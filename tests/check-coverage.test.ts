import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertMinimumCoverage,
  coverageScope,
  lineCoverage,
  productionSourceFiles,
} from '../scripts/check-coverage.ts';

describe('coverage gate', () => {
  it('uses aggregate LH/LF records from lcov', () => {
    const coverage = lineCoverage(
      'SF:a.ts\nLF:10\nLH:9\nend_of_record\nSF:b.ts\nLF:30\nLH:30\nend_of_record\n',
    );
    assert.deepEqual(coverage, { hit: 39, found: 40, percentage: 97.5 });
    assert.doesNotThrow(() => {
      assertMinimumCoverage(coverage);
    });
  });

  it('rejects malformed records before their totals can be masked by valid records', () => {
    assert.throws(
      () => lineCoverage('SF:a.ts\nLF:10\nend_of_record\nSF:b.ts\nLF:30\nLH:30\nend_of_record\n'),
      /must contain one LH and one LF/,
    );
    assert.throws(
      () => lineCoverage('SF:a.ts\nLF:10\nLH:not-a-number\nend_of_record\n'),
      /not a non-negative integer/,
    );
    assert.throws(() => lineCoverage('SF:a.ts\nLF:10\nLH:9\n'), /missing end_of_record/);
    assert.throws(() => lineCoverage('SF:a.ts\nLF:0\nLH:0\nend_of_record\n'), /invalid or empty/);
    assert.throws(() => lineCoverage('SF:\n'), /has no source path/);
    assert.throws(
      () => lineCoverage('SF:a.ts\nLF:1\nLH:1\nSF:b.ts\n'),
      /missing end_of_record before line 4/,
    );
    assert.throws(
      () => lineCoverage('SF:a.ts\nLF:1\nLH:1\nLH:1\nend_of_record\n'),
      /more than one LH/,
    );
    assert.throws(() => lineCoverage('SF:a.ts\nLF:1\nLH:2\nend_of_record\n'), /LH exceeds LF/);
    assert.throws(
      () => lineCoverage('SF:a.ts\nLF:9007199254740992\nLH:0\nend_of_record\n'),
      /outside the safe integer range/,
    );
    assert.throws(() => lineCoverage('end_of_record\n'), /has no source/);
    assert.throws(() => lineCoverage('DA:1,1\n'), /appears before SF/);
  });

  it('reports every first-party TypeScript file that is absent from LCOV', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-coverage-'));
    try {
      for (const file of ['bin/entry.ts', 'hooks/start.ts', 'lib/core.ts', 'scripts/tool.ts']) {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, 'export {};\n');
      }
      fs.writeFileSync(path.join(root, 'bin', 'ignored.js'), 'export {};\n');
      fs.mkdirSync(path.join(root, 'lib', 'nested'), { recursive: true });
      fs.writeFileSync(path.join(root, 'lib', 'nested', 'child.ts'), 'export {};\n');

      assert.deepEqual(productionSourceFiles(root), [
        'bin/entry.ts',
        'hooks/start.ts',
        'lib/core.ts',
        'lib/nested/child.ts',
        'scripts/tool.ts',
      ]);
      assert.deepEqual(productionSourceFiles(path.join(root, 'missing')), []);
      assert.deepEqual(
        coverageScope(
          'SF:bin/entry.ts\nLF:1\nLH:1\nend_of_record\nSF:eslint.config.mjs\nLF:1\nLH:1\nend_of_record\n',
          root,
        ),
        {
          coverage: { hit: 2, found: 2, percentage: 100 },
          productionFiles: [
            'bin/entry.ts',
            'hooks/start.ts',
            'lib/core.ts',
            'lib/nested/child.ts',
            'scripts/tool.ts',
          ],
          lcovFiles: ['bin/entry.ts', 'eslint.config.mjs'],
          missingProductionFiles: [
            'hooks/start.ts',
            'lib/core.ts',
            'lib/nested/child.ts',
            'scripts/tool.ts',
          ],
          lcovFilesOutsideProductionInventory: ['eslint.config.mjs'],
        },
      );
      assert.deepEqual(
        coverageScope('SF:../outside.ts\nLF:1\nLH:1\nend_of_record\n', root).lcovFiles,
        ['../outside.ts'],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a missed threshold', () => {
    assert.throws(() => {
      assertMinimumCoverage({ hit: 94, found: 100, percentage: 94 });
    }, /below 95%/);
  });
});
