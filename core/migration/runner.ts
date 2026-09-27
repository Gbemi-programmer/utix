/**
 * Migration Runner Service (#79)
 *
 * Executes migrations with dry-run verification, atomic execution,
 * automated post-migration invariant checks, and automated rollback if needed.
 */

import {
  MigrationContext,
  MigrationDefinition,
  MigrationExecutionReport,
  MigrationPreviewReport,
  PostMigrationCheckResult
} from './types';

export class MigrationRunner {
  /**
   * Previews a migration via dryRun without making any modifications.
   * Time Complexity: O(N)
   * Space Complexity: O(1) beyond preview diff storage
   */
  public static preview<TInput, TOutput>(
    migration: MigrationDefinition<TInput, TOutput>,
    records: readonly TInput[],
    context?: MigrationContext
  ): MigrationPreviewReport {
    return migration.dryRun(records, context);
  }

  /**
   * Executes a migration safely.
   * If post-checks fail and `autoRollbackOnFailure` is true, rolls back to original state.
   * Time Complexity: O(N)
   * Space Complexity: O(N) for transformed output
   */
  public static async execute<TInput, TOutput>(
    migration: MigrationDefinition<TInput, TOutput>,
    records: readonly TInput[],
    options?: MigrationContext
  ): Promise<MigrationExecutionReport<TOutput>> {
    const startTime = Date.now();
    const isDryRun = options?.dryRun ?? false;
    const autoRollback = options?.autoRollbackOnFailure ?? true;

    // 1. Dry Run Mode
    if (isDryRun) {
      const previewReport = migration.dryRun(records, options);
      const durationMs = Date.now() - startTime;
      return {
        migrationId: migration.id,
        success: true,
        status: 'dry_run',
        totalRecords: previewReport.totalRecords,
        affectedRecords: previewReport.affectedCount,
        postCheckResults: [],
        durationMs,
        rollbackNotes: migration.rollbackNotes,
        forwardFixNotes: migration.forwardFixNotes
      };
    }

    // 2. Apply Transformation
    let transformed: TOutput[];
    let affectedCount = 0;
    try {
      const applyResult = migration.apply(records, options);
      transformed = applyResult.transformed;
      affectedCount = applyResult.affectedCount;
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        migrationId: migration.id,
        success: false,
        status: 'failed',
        totalRecords: records.length,
        affectedRecords: 0,
        postCheckResults: [],
        errors: [`Migration apply threw an unhandled exception: ${errMsg}`],
        durationMs,
        rollbackNotes: migration.rollbackNotes,
        forwardFixNotes: migration.forwardFixNotes
      };
    }

    // 3. Run Post-Migration Checks
    const postCheckResults: PostMigrationCheckResult[] = [];
    let allChecksPassed = true;

    for (const check of migration.postChecks) {
      try {
        const result = await check.validate(transformed, options);
        postCheckResults.push(result);
        if (!result.passed) {
          allChecksPassed = false;
        }
      } catch (checkErr: unknown) {
        allChecksPassed = false;
        const msg = checkErr instanceof Error ? checkErr.message : String(checkErr);
        postCheckResults.push({
          checkName: check.name,
          passed: false,
          message: `Post-check threw exception: ${msg}`
        });
      }
    }

    // 4. Handle Post-Check Failures
    if (!allChecksPassed) {
      const errors = postCheckResults
        .filter((c) => !c.passed)
        .map((c) => `[${c.checkName}] ${c.message || 'Validation failed'}`);

      // Attempt Rollback if requested
      if (autoRollback && migration.rollback) {
        try {
          migration.rollback(transformed, options);
          const durationMs = Date.now() - startTime;
          return {
            migrationId: migration.id,
            success: false,
            status: 'rolled_back',
            totalRecords: records.length,
            affectedRecords: affectedCount,
            postCheckResults,
            errors,
            durationMs,
            rollbackExecuted: true,
            rollbackNotes: migration.rollbackNotes,
            forwardFixNotes: migration.forwardFixNotes
          };
        } catch (rbErr: unknown) {
          const rbMsg = rbErr instanceof Error ? rbErr.message : String(rbErr);
          errors.push(`Automated rollback failed: ${rbMsg}`);
        }
      }

      const durationMs = Date.now() - startTime;
      return {
        migrationId: migration.id,
        success: false,
        status: 'failed',
        totalRecords: records.length,
        affectedRecords: affectedCount,
        postCheckResults,
        errors,
        durationMs,
        rollbackExecuted: false,
        rollbackNotes: migration.rollbackNotes,
        forwardFixNotes: migration.forwardFixNotes
      };
    }

    // 5. Success
    const durationMs = Date.now() - startTime;
    return {
      migrationId: migration.id,
      success: true,
      status: 'applied',
      totalRecords: records.length,
      affectedRecords: affectedCount,
      postCheckResults,
      durationMs,
      rollbackNotes: migration.rollbackNotes,
      forwardFixNotes: migration.forwardFixNotes,
      outputRecords: transformed
    };
  }
}
