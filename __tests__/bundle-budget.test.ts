import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Bundle budget configuration', () => {
  it('has bundle baseline file', () => {
    const baselinePath = join(process.cwd(), 'bundle-baseline.json');
    expect(existsSync(baselinePath)).toBe(true);
  });

  it('has bundle budget script', () => {
    const scriptPath = join(process.cwd(), 'scripts/bundle-budget.mjs');
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('baseline contains valid structure', () => {
    const baselinePath = join(process.cwd(), 'bundle-baseline.json');

    if (existsSync(baselinePath)) {
      const baselineContent = readFileSync(baselinePath, 'utf-8');
      const baseline = JSON.parse(baselineContent);

      for (const [feature, data] of Object.entries(baseline)) {
        expect(typeof feature).toBe('string');
        expect(typeof data.totalSize).toBe('number');
        expect(typeof data.sizeKB).toBe('number');
        expect(typeof data.timestamp).toBe('string');
        expect(data.totalSize).toBeGreaterThan(0);
        expect(data.sizeKB).toBeGreaterThan(0);
      }
    }
  });
});
