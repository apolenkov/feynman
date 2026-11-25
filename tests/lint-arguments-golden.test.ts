import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const cli = path.join(import.meta.dirname, '../bin/feynman-lint.ts');
const fixtures = new URL('./fixtures/r04/', import.meta.url);
const usage = readFileSync(new URL('help.txt', fixtures), 'utf8');

function run(argv: readonly string[], input = '') {
  const result = spawnSync(process.execPath, [cli, ...argv], { input, encoding: 'utf8' });
  assert.ifError(result.error);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('feynman-lint argument output', () => {
  for (const [argv, status, stdout, stderr] of [
    [['--help', '--unknown'], 0, usage, ''],
    [['--unknown', '--help'], 2, '', "feynman-lint: unknown flag '--unknown'\n" + usage],
    [[], 2, '', usage],
    [['one', 'two', '--help'], 2, '', 'feynman-lint: too many file arguments\n' + usage],
    [['--fix', '-'], 2, '', 'feynman-lint: --fix requires a file path (not stdin)\n'],
  ] as const) {
    it(`argv ${JSON.stringify(argv)}`, () => {
      assert.deepEqual(run(argv), { status, stdout, stderr });
    });
  }

  it('reads stdin in preference to a file and accepts repeated flags', () => {
    assert.deepEqual(run(['--json', 'unused.md', '-', '--explain', '--json'], 'prose\n'), {
      status: 0,
      stdout: '{\n  "file": "<stdin>",\n  "passed": true,\n  "issues": [],\n  "explain": []\n}\n',
      stderr: '',
    });
  });

  it('exits 1 for a warning on stdin with --strict', () => {
    assert.deepEqual(run(['-', '--strict'], '```\n▲ high\n```\n'), {
      status: 1,
      stdout:
        "<stdin>:2:1: L06 warn Priority scale has '▲' but missing '▼' — scales require both ends\n",
      stderr: '<stdin>: 1 warning\n',
    });
  });

  it('writes the converted bytes silently when --fix follows a file', (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'feynman-r04-'));
    t.after(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const file = path.join(dir, 'mixed.md');
    copyFileSync(new URL('mixed-input.txt', fixtures), file);
    assert.deepEqual(run([file, '--fix']), { status: 0, stdout: '', stderr: '' });
    assert.deepEqual(readFileSync(file), readFileSync(new URL('converted.txt', fixtures)));
  });
});
