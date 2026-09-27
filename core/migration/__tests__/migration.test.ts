import { describe, expect, it } from 'vitest';
import {
  createNonNullCheck,
  createNumericRangeCheck,
  createSchemaConformityCheck,
  createUniquenessCheck
} from '../postChecks';
import { MigrationRunner } from '../runner';
import { MigrationDefinition, MigrationPreviewReport } from '../types';

interface LegacyTicketRecord {
  id: string;
  eventId: string;
  owner: string;
  priceXlm?: number;
  status: string;
}

interface ModernTicketRecord {
  id: string;
  eventId: string;
  owner: string;
  priceStroops: number;
  status: 'issued' | 'transferred' | 'redeemed' | 'expired';
  version: number;
}

describe('Migration Safety Framework (#79)', () => {
  const sampleLegacyTickets: LegacyTicketRecord[] = [
    { id: 'tkt_1', eventId: 'ev_1', owner: 'G_ALICE', priceXlm: 10, status: 'issued' },
    { id: 'tkt_2', eventId: 'ev_1', owner: 'G_BOB', priceXlm: 25, status: 'transferred' },
    { id: 'tkt_3', eventId: 'ev_2', owner: 'G_CHARLIE', priceXlm: 0, status: 'redeemed' }
  ];

  const ticketMigration: MigrationDefinition<LegacyTicketRecord, ModernTicketRecord> = {
    id: '20260927_ticket_stroop_upgrade',
    name: 'Upgrade Ticket Price from XLM to Stroops',
    description: 'Converts legacy decimal XLM prices to integer Stroops and validates status types',
    fromVersion: 1,
    toVersion: 2,
    riskLevel: 'medium',
    rollbackNotes: 'To rollback: divide priceStroops by 10,000,000 to restore priceXlm and decrement version to 1.',
    forwardFixNotes: 'If partial records fail, check for negative or NaN price values in legacy backup.',
    dryRun: (records) => {
      const affected = records.filter((r) => r.priceXlm !== undefined);
      return {
        migrationId: '20260927_ticket_stroop_upgrade',
        targetVersion: 2,
        totalRecords: records.length,
        affectedCount: affected.length,
        unchangedCount: records.length - affected.length,
        sampleDiffs: affected.slice(0, 2).map((r) => ({
          recordId: r.id,
          before: { priceXlm: r.priceXlm },
          after: { priceStroops: Math.round((r.priceXlm ?? 0) * 10_000_000) },
          action: 'update'
        })),
        riskLevel: 'medium',
        rollbackNotes: 'To rollback: divide priceStroops by 10,000,000 to restore priceXlm.',
        forwardFixNotes: 'If validation fails, check records for undefined prices.',
        estimatedDurationMs: 15
      };
    },
    apply: (records) => {
      const transformed: ModernTicketRecord[] = records.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        owner: r.owner,
        priceStroops: Math.round((r.priceXlm ?? 0) * 10_000_000),
        status: r.status as any,
        version: 2
      }));
      return { transformed, affectedCount: records.length };
    },
    rollback: (records) => {
      const transformed: LegacyTicketRecord[] = records.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        owner: r.owner,
        priceXlm: r.priceStroops / 10_000_000,
        status: r.status
      }));
      return { transformed, affectedCount: records.length };
    },
    postChecks: [
      createNonNullCheck<ModernTicketRecord>('priceStroops'),
      createNumericRangeCheck<ModernTicketRecord>('priceStroops', 0),
      createUniquenessCheck<ModernTicketRecord>('id'),
      createSchemaConformityCheck<ModernTicketRecord>('valid_status_enum', (r) => ({
        valid: ['issued', 'transferred', 'redeemed', 'expired'].includes(r.status),
        reason: `Invalid status: ${r.status}`
      }))
    ]
  };

  describe('dryRun & preview', () => {
    it('generates a comprehensive preview report without mutating input data', () => {
      const initialSnapshot = JSON.stringify(sampleLegacyTickets);
      const preview = MigrationRunner.preview(ticketMigration, sampleLegacyTickets);

      expect(preview.migrationId).toBe('20260927_ticket_stroop_upgrade');
      expect(preview.totalRecords).toBe(3);
      expect(preview.affectedCount).toBe(3);
      expect(preview.sampleDiffs.length).toBe(2);
      expect(preview.rollbackNotes).toContain('rollback: divide priceStroops');
      expect(preview.riskLevel).toBe('medium');

      // Verify input immutability
      expect(JSON.stringify(sampleLegacyTickets)).toBe(initialSnapshot);
    });

    it('returns dry_run execution status without executing writes', async () => {
      const report = await MigrationRunner.execute(ticketMigration, sampleLegacyTickets, {
        dryRun: true
      });

      expect(report.success).toBe(true);
      expect(report.status).toBe('dry_run');
      expect(report.totalRecords).toBe(3);
      expect(report.affectedRecords).toBe(3);
      expect(report.outputRecords).toBeUndefined();
    });
  });

  describe('execute & post-checks', () => {
    it('successfully executes migration and passes all post-checks', async () => {
      const report = await MigrationRunner.execute(ticketMigration, sampleLegacyTickets);

      expect(report.success).toBe(true);
      expect(report.status).toBe('applied');
      expect(report.totalRecords).toBe(3);
      expect(report.affectedRecords).toBe(3);
      expect(report.postCheckResults.length).toBe(4);
      expect(report.postCheckResults.every((c) => c.passed)).toBe(true);

      const output = report.outputRecords!;
      expect(output.length).toBe(3);
      expect(output[0].priceStroops).toBe(100_000_000);
      expect(output[1].priceStroops).toBe(250_000_000);
      expect(output[2].priceStroops).toBe(0);
      expect(output[0].version).toBe(2);
    });

    it('detects post-check violations on invalid migration outcomes and rolls back', async () => {
      const faultyMigration: MigrationDefinition<LegacyTicketRecord, ModernTicketRecord> = {
        ...ticketMigration,
        id: '20260927_faulty_migration',
        apply: (records) => {
          // Faulty transform introducing a negative price and invalid status
          const transformed: ModernTicketRecord[] = records.map((r, i) => ({
            id: r.id,
            eventId: r.eventId,
            owner: r.owner,
            priceStroops: i === 0 ? -500 : 100_000,
            status: (i === 1 ? 'INVALID_STATUS' : 'issued') as any,
            version: 2
          }));
          return { transformed, affectedCount: records.length };
        }
      };

      const report = await MigrationRunner.execute(faultyMigration, sampleLegacyTickets, {
        autoRollbackOnFailure: true
      });

      expect(report.success).toBe(false);
      expect(report.status).toBe('rolled_back');
      expect(report.rollbackExecuted).toBe(true);
      expect(report.errors && report.errors.length).toBeGreaterThan(0);

      // Check specific post-check failures
      const rangeCheck = report.postCheckResults.find((c) => c.checkName === 'numeric_range_priceStroops');
      expect(rangeCheck?.passed).toBe(false);
      expect(rangeCheck?.violatingRecordIds).toContain('tkt_1');

      const statusCheck = report.postCheckResults.find((c) => c.checkName === 'valid_status_enum');
      expect(statusCheck?.passed).toBe(false);
      expect(statusCheck?.violatingRecordIds).toContain('tkt_2');
    });

    it('handles unexpected exceptions during apply gracefully', async () => {
      const crashingMigration: MigrationDefinition<LegacyTicketRecord, ModernTicketRecord> = {
        ...ticketMigration,
        id: '20260927_crashing_migration',
        apply: () => {
          throw new Error('Database connection reset during batch update');
        }
      };

      const report = await MigrationRunner.execute(crashingMigration, sampleLegacyTickets);
      expect(report.success).toBe(false);
      expect(report.status).toBe('failed');
      expect(report.errors?.[0]).toContain('Database connection reset');
    });
  });
});
