/**
 * Types and interfaces for Migration Safety Framework (#79)
 *
 * Provides dry-run previews, automated post-migration invariant checks,
 * rollback/forward-fix documentation, and safe execution with atomic rollback capabilities.
 */

export type MigrationRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface MigrationDiff<T = unknown> {
  readonly recordId: string;
  readonly before?: Partial<T> | Record<string, unknown>;
  readonly after?: Partial<T> | Record<string, unknown>;
  readonly action: 'update' | 'insert' | 'delete' | 'noop';
}

export interface MigrationPreviewReport {
  readonly migrationId: string;
  readonly targetVersion: number;
  readonly totalRecords: number;
  readonly affectedCount: number;
  readonly unchangedCount: number;
  readonly sampleDiffs: readonly MigrationDiff[];
  readonly riskLevel: MigrationRiskLevel;
  readonly rollbackNotes: string;
  readonly forwardFixNotes: string;
  readonly estimatedDurationMs: number;
}

export interface PostMigrationCheckResult {
  readonly checkName: string;
  readonly passed: boolean;
  readonly message?: string;
  readonly violatingRecordIds?: readonly string[];
}

export interface PostMigrationCheck<T> {
  readonly name: string;
  readonly description: string;
  readonly validate: (
    records: readonly T[],
    context?: MigrationContext
  ) => PostMigrationCheckResult | Promise<PostMigrationCheckResult>;
}

export interface MigrationContext {
  readonly dryRun?: boolean;
  readonly batchSize?: number;
  readonly autoRollbackOnFailure?: boolean;
  readonly now?: Date;
  readonly customParams?: Record<string, unknown>;
}

export interface MigrationDefinition<TInput, TOutput = TInput> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly riskLevel: MigrationRiskLevel;
  readonly rollbackNotes: string;
  readonly forwardFixNotes: string;

  /** Previews affected records, differences, and risk without mutating source data */
  readonly dryRun: (
    records: readonly TInput[],
    context?: MigrationContext
  ) => MigrationPreviewReport;

  /** Applies forward migration transformation */
  readonly apply: (
    records: readonly TInput[],
    context?: MigrationContext
  ) => { transformed: TOutput[]; affectedCount: number };

  /** Optional reverse migration handler to rollback changes */
  readonly rollback?: (
    records: readonly TOutput[],
    context?: MigrationContext
  ) => { transformed: TInput[]; affectedCount: number };

  /** Post-migration invariant checks that must all pass */
  readonly postChecks: readonly PostMigrationCheck<TOutput>[];
}

export interface MigrationExecutionReport<TOutput = unknown> {
  readonly migrationId: string;
  readonly success: boolean;
  readonly status: 'applied' | 'dry_run' | 'rolled_back' | 'failed';
  readonly totalRecords: number;
  readonly affectedRecords: number;
  readonly postCheckResults: readonly PostMigrationCheckResult[];
  readonly errors?: readonly string[];
  readonly durationMs: number;
  readonly rollbackExecuted?: boolean;
  readonly rollbackNotes: string;
  readonly forwardFixNotes: string;
  readonly outputRecords?: readonly TOutput[];
}
