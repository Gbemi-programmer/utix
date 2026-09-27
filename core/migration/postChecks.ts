/**
 * Standard Post-Migration Invariant Checks (#79)
 *
 * Verifies domain record integrity, schema conformance, non-null guarantees,
 * numeric bounds, and relational consistency post-migration.
 */

import { MigrationContext, PostMigrationCheck, PostMigrationCheckResult } from './types';

/**
 * Creates a post-check verifying that a specific field is defined and non-null on all records.
 * Time Complexity: O(N)
 * Space Complexity: O(K) where K is number of violations
 */
export function createNonNullCheck<T extends Record<string, any>>(
  fieldName: keyof T & string
): PostMigrationCheck<T> {
  return {
    name: `non_null_${fieldName}`,
    description: `Ensures field '${fieldName}' is defined and not null on all records`,
    validate: (records: readonly T[]): PostMigrationCheckResult => {
      const violatingIds: string[] = [];
      for (const record of records) {
        const val = record[fieldName];
        if (val === undefined || val === null) {
          violatingIds.push(record.id || 'unknown_id');
        }
      }

      const passed = violatingIds.length === 0;
      return {
        checkName: `non_null_${fieldName}`,
        passed,
        message: passed
          ? `All ${records.length} records have a non-null '${fieldName}'`
          : `Found ${violatingIds.length} records with missing/null '${fieldName}'`,
        violatingRecordIds: violatingIds
      };
    }
  };
}

/**
 * Creates a post-check verifying numeric field bounds (e.g. non-negative balances).
 * Time Complexity: O(N)
 */
export function createNumericRangeCheck<T extends Record<string, any>>(
  fieldName: keyof T & string,
  min?: number,
  max?: number
): PostMigrationCheck<T> {
  return {
    name: `numeric_range_${fieldName}`,
    description: `Ensures field '${fieldName}' is a number within [${min ?? '-∞'}, ${max ?? '∞'}]`,
    validate: (records: readonly T[]): PostMigrationCheckResult => {
      const violatingIds: string[] = [];
      for (const record of records) {
        const val = record[fieldName];
        if (typeof val !== 'number' || isNaN(val)) {
          violatingIds.push(record.id || 'unknown_id');
          continue;
        }
        if (min !== undefined && val < min) {
          violatingIds.push(record.id || 'unknown_id');
          continue;
        }
        if (max !== undefined && val > max) {
          violatingIds.push(record.id || 'unknown_id');
        }
      }

      const passed = violatingIds.length === 0;
      return {
        checkName: `numeric_range_${fieldName}`,
        passed,
        message: passed
          ? `All ${records.length} records satisfy numeric bounds for '${fieldName}'`
          : `Found ${violatingIds.length} records violating numeric bounds for '${fieldName}'`,
        violatingRecordIds: violatingIds
      };
    }
  };
}

/**
 * Creates a post-check asserting uniqueness of a given field across all records.
 * Time Complexity: O(N)
 * Space Complexity: O(N)
 */
export function createUniquenessCheck<T extends Record<string, any>>(
  fieldName: keyof T & string
): PostMigrationCheck<T> {
  return {
    name: `uniqueness_${fieldName}`,
    description: `Ensures all records have a unique value for '${fieldName}'`,
    validate: (records: readonly T[]): PostMigrationCheckResult => {
      const seen = new Set<unknown>();
      const violatingIds: string[] = [];

      for (const record of records) {
        const val = record[fieldName];
        if (seen.has(val)) {
          violatingIds.push(record.id || 'unknown_id');
        } else {
          seen.add(val);
        }
      }

      const passed = violatingIds.length === 0;
      return {
        checkName: `uniqueness_${fieldName}`,
        passed,
        message: passed
          ? `All ${records.length} records have unique values for '${fieldName}'`
          : `Found ${violatingIds.length} duplicate values for '${fieldName}'`,
        violatingRecordIds: violatingIds
      };
    }
  };
}

/**
 * Creates a custom schema conformity check.
 * Time Complexity: O(N)
 */
export function createSchemaConformityCheck<T>(
  name: string,
  validator: (record: T) => { valid: boolean; reason?: string }
): PostMigrationCheck<T> {
  return {
    name,
    description: `Validates schema and business logic invariants for ${name}`,
    validate: (records: readonly T[]): PostMigrationCheckResult => {
      const violatingIds: string[] = [];
      let firstReason = '';

      for (const record of records) {
        const res = validator(record);
        if (!res.valid) {
          const recId = (record as any)?.id || 'unknown_id';
          violatingIds.push(recId);
          if (!firstReason && res.reason) firstReason = res.reason;
        }
      }

      const passed = violatingIds.length === 0;
      return {
        checkName: name,
        passed,
        message: passed
          ? `All ${records.length} records passed schema check '${name}'`
          : `Schema check '${name}' failed on ${violatingIds.length} records. Reason: ${firstReason || 'Validation failed'}`,
        violatingRecordIds: violatingIds
      };
    }
  };
}
