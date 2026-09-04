import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertCompleteCoverageScope,
  assertMinimumCoverage,
  coverageScope,
  coverageSourceFiles,
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

  it('scans a long ordered LCOV report without losing record totals or cursor position', () => {
    const records = Array.from(
      { length: 750 },
      (_, index) => `SF:file-${index}.ts\nLF:4\nLH:${index % 5}\nend_of_record`,
    );
    assert.deepEqual(lineCoverage(records.join('\n')), {
      hit: 1_500,
      found: 3_000,
      percentage: 50,
    });
    assert.throws(
      () => lineCoverage(`${records.join('\n')}\nSF:file-750.ts\nLF:4\nLH:2\n`),
      /record for file-750\.ts is missing end_of_record/,
    );
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
      fs.writeFileSync(path.join(root, 'eslint.config.mjs'), 'export default [];\n');
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
      assert.deepEqual(coverageSourceFiles(root), [
        'bin/entry.ts',
        'eslint.config.mjs',
        'hooks/start.ts',
        'lib/core.ts',
        'lib/nested/child.ts',
        'scripts/tool.ts',
      ]);
      assert.deepEqual(
        coverageScope(
          'SF:bin/entry.ts\nLF:1\nLH:1\nend_of_record\nSF:eslint.config.mjs\nLF:1\nLH:1\nend_of_record\n',
          root,
        ),
        {
          coverage: { hit: 2, found: 2, percentage: 100 },
          coverageFiles: [
            'bin/entry.ts',
            'eslint.config.mjs',
            'hooks/start.ts',
            'lib/core.ts',
            'lib/nested/child.ts',
            'scripts/tool.ts',
          ],
          lcovFiles: ['bin/entry.ts', 'eslint.config.mjs'],
          missingCoverageFiles: [
            'hooks/start.ts',
            'lib/core.ts',
            'lib/nested/child.ts',
            'scripts/tool.ts',
          ],
          lcovFilesOutsideCoverageInventory: [],
        },
      );
      assert.deepEqual(
        coverageScope('SF:../outside.ts\nLF:1\nLH:1\nend_of_record\n', root).lcovFiles,
        ['../outside.ts'],
      );

      const completeLcov = coverageSourceFiles(root)
        .map((file) => `SF:${file}\nLF:20\nLH:19\nend_of_record`)
        .join('\n');
      assert.throws(() => {
        assertCompleteCoverageScope(
          coverageScope('SF:bin/entry.ts\nLF:1\nLH:1\nend_of_record\n', root),
        );
      }, /coverage sources absent from LCOV: eslint\.config\.mjs, hooks\/start\.ts, lib\/core\.ts, lib\/nested\/child\.ts, scripts\/tool\.ts/);
      assert.throws(() => {
        assertCompleteCoverageScope(
          coverageScope(`${completeLcov}\nSF:other.config.mjs\nLF:1\nLH:1\nend_of_record\n`, root),
        );
      }, /LCOV records outside coverage inventory: other\.config\.mjs/);
      assert.doesNotThrow(() => {
        const scope = coverageScope(completeLcov, root);
        assertCompleteCoverageScope(scope);
        assert.equal(scope.coverage.percentage, 95);
        assertMinimumCoverage(scope.coverage);
      });
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
