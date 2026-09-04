import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments } from '../bin/feynman-lint.ts';

describe('feynman-lint argument parsing', () => {
  it('does not mutate the caller argv and accepts duplicate flags', () => {
    const argv = Object.freeze(['--json', '--strict', '--json', 'diagram.md']);

    assert.deepEqual(parseArguments(argv), {
      kind: 'lint',
      useJson: true,
      useStrict: true,
      useExplain: false,
      input: { kind: 'file', path: 'diagram.md' },
    });
    assert.deepEqual(argv, ['--json', '--strict', '--json', 'diagram.md']);
  });

  it('preserves immediate help and malformed-argument ordering', () => {
    assert.deepEqual(parseArguments(['--help', '--unknown']), { kind: 'help' });

    const unknownBeforeHelp = parseArguments(['--unknown', '--help']);
    assert.equal(unknownBeforeHelp.kind, 'error');
    assert.match(unknownBeforeHelp.message, /^feynman-lint: unknown flag '--unknown'/);

    const duplicateFileBeforeHelp = parseArguments(['one.md', 'two.md', '--help']);
    assert.equal(duplicateFileBeforeHelp.kind, 'error');
    assert.match(duplicateFileBeforeHelp.message, /^feynman-lint: too many file arguments/);
  });

  it('preserves stdin precedence and rejects --fix with stdin after the full scan', () => {
    const stdin = parseArguments(['diagram.md', '-', '--json']);
    assert.equal(stdin.kind, 'lint');
    assert.deepEqual(stdin.input, { kind: 'stdin' });
    assert.equal(stdin.useJson, true);

    assert.deepEqual(parseArguments(['--fix', '-', 'diagram.md']), {
      kind: 'error',
      message: 'feynman-lint: --fix requires a file path (not stdin)\n',
    });
  });
});
