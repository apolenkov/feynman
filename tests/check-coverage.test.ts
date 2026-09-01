import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertMinimumCoverage, lineCoverage } from '../scripts/check-coverage.ts';

describe('coverage gate', () => {
  it('uses aggregate LH/LF records from lcov', () => {
    const coverage = lineCoverage('SF:a.ts\nLF:10\nLH:9\nend_of_record\nSF:b.ts\nLF:30\nLH:30\n');
    assert.deepEqual(coverage, { hit: 39, found: 40, percentage: 97.5 });
    assert.doesNotThrow(() => assertMinimumCoverage(coverage));
  });

  it('rejects malformed totals and a missed threshold', () => {
    assert.throws(() => lineCoverage('LF:0\nLH:0\n'), /invalid or empty/);
    assert.throws(() => assertMinimumCoverage({ hit: 94, found: 100, percentage: 94 }), /below 95%/);
  });
});
