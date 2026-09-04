import { it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHookScriptPath,
  isSessionStartHookCommand,
  isFeynmanHookCommand,
} from '../bin/adapters/codex-config.ts';
import { assertDefined } from './helpers/assertions.ts';

it('recognizes literal node script arguments without shell evaluation', () => {
  for (const [command, expected] of [
    ['node /tmp/feynman-session-start.ts', '/tmp/feynman-session-start.ts'],
    [
      'FEYNMAN_HOME="/tmp/user/.codex" node "/tmp/source path/feynman-session-start.ts"',
      '/tmp/source path/feynman-session-start.ts',
    ],
    [
      "FEYNMAN_HOME='/tmp/O'\\''Brien $tag' node '/tmp/plugin'\\''s $tag/feynman-session-start.ts'",
      "/tmp/plugin's $tag/feynman-session-start.ts",
    ],
    ["'/usr/local/bin/node' '/tmp/feynman-session-start.ts'", '/tmp/feynman-session-start.ts'],
    ['node /tmp/a\\ b/feynman-session-start.ts', '/tmp/a b/feynman-session-start.ts'],
    ['node "/tmp/a\\\"b/feynman-session-start.ts"', '/tmp/a"b/feynman-session-start.ts'],
    ['node "/tmp/a\\qb/feynman-session-start.ts"', '/tmp/a\\qb/feynman-session-start.ts'],
    ['node "/tmp/a\\$b/feynman-session-start.ts"', '/tmp/a$b/feynman-session-start.ts'],
    ['node /tmp/a\\\nb/feynman-session-start.ts', '/tmp/ab/feynman-session-start.ts'],
  ]) {
    assertDefined(command);
    assertDefined(expected);
    assert.equal(extractHookScriptPath(command, 'feynman-session-start.ts'), expected);
    assert.equal(isSessionStartHookCommand(command), true);
  }
  assert.equal(isFeynmanHookCommand('node /tmp/feynman-lint.js'), true);
  assert.equal(isFeynmanHookCommand('node /tmp/feynman-lint.ts'), true);
  assert.equal(isSessionStartHookCommand('node /tmp/feynman-session-start.js'), true);
});

it('leaves unrelated commands, expansions and malformed shell words unowned', () => {
  for (const command of [
    '',
    'echo /tmp/feynman-session-start.ts',
    'node /tmp/not-feynman-session-start.ts',
    'node /tmp/feynman-session-start.ts && true',
    'node "$HOME/feynman-session-start.ts"',
    'node "`pwd`/feynman-session-start.ts"',
    'node $ROOT/feynman-session-start.ts',
    "node '/tmp/feynman-session-start.ts",
    'node /tmp/feynman-session-start.ts\\',
    'node /tmp/feynman-session-start.ts\necho extra',
    'node',
    "node ''",
    'node /tmp/*/feynman-session-start.ts',
  ]) {
    assert.equal(isSessionStartHookCommand(command), false, command);
    assert.equal(isFeynmanHookCommand(command), false, command);
  }
  assert.equal(isSessionStartHookCommand(null), false);
});
