import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cmdBootstrap, parseBootstrapArguments } from '../bin/commands/bootstrap.ts';
import { cmdExamples, parseExampleArguments } from '../bin/commands/examples.ts';
import { parseStateArguments } from '../bin/commands/state.ts';
import { cmdLint, runLintProcess } from '../bin/commands/lint.ts';
import { removeFeynmanHooks, type ValidatedCodexConfig } from '../bin/adapters/codex-config.ts';

class ExitSignal extends Error {}

describe('command argument parsing', () => {
  it('parses frozen bootstrap arguments without mutation and keeps the last output', () => {
    const argv = Object.freeze(['--out', 'first', '--force', '--out=second', '--force']);

    assert.deepEqual(parseBootstrapArguments(argv, '/workspace'), {
      kind: 'run',
      out: path.resolve('/workspace', 'second'),
      force: true,
    });
    assert.deepEqual(argv, ['--out', 'first', '--force', '--out=second', '--force']);
  });

  it('preserves bootstrap help and malformed-value precedence', () => {
    assert.deepEqual(parseBootstrapArguments(['bad', '--help', '--out'], '/workspace'), {
      kind: 'help',
    });
    assert.deepEqual(parseBootstrapArguments(['bad', '--out', '--force'], '/workspace'), {
      kind: 'error',
      messages: ['feynman bootstrap: --out requires a value'],
    });
    assert.deepEqual(parseBootstrapArguments(['one', '--force', 'two'], '/workspace'), {
      kind: 'error',
      messages: [
        'feynman bootstrap: unexpected arguments "one two"',
        'Run `feynman bootstrap --help` for usage.',
      ],
    });
  });

  it('preserves examples help, duplicate, conflict and unknown ordering', () => {
    const argv = Object.freeze(['--name', 'flow', '--random', 'extra']);
    assert.deepEqual(parseExampleArguments(argv), {
      kind: 'error',
      messages: ['feynman examples: use either --random or --name'],
    });
    assert.deepEqual(argv, ['--name', 'flow', '--random', 'extra']);

    assert.deepEqual(parseExampleArguments(['extra', '--name', 'a', '--name', 'b']), {
      kind: 'error',
      messages: ['feynman examples: duplicate --name'],
    });
    assert.deepEqual(parseExampleArguments(['--name', '--random', '--help']), { kind: 'help' });
    assert.deepEqual(parseExampleArguments(['first', '-r', 'second']), {
      kind: 'error',
      messages: [
        'feynman examples: unexpected arguments "first second"',
        'Run `feynman examples --help` for usage.',
      ],
    });
  });

  it('rejects malformed arguments before command filesystem access', () => {
    const existsMock = mock.method(fs, 'existsSync', () => {
      throw new Error('unexpected bootstrap I/O');
    });
    const readdirMock = mock.method(fs, 'readdirSync', () => {
      throw new Error('unexpected examples I/O');
    });
    const errorMock = mock.method(console, 'error', () => undefined);
    const exitMock = mock.method(process, 'exit', () => {
      throw new ExitSignal();
    });
    try {
      assert.throws(() => {
        cmdBootstrap(['--out']);
      }, ExitSignal);
      assert.throws(() => {
        cmdExamples(['--name']);
      }, ExitSignal);
      assert.equal(existsMock.mock.callCount(), 0);
      assert.equal(readdirMock.mock.callCount(), 0);
    } finally {
      existsMock.mock.restore();
      readdirMock.mock.restore();
      errorMock.mock.restore();
      exitMock.mock.restore();
    }
  });

  it('parses frozen state arguments without I/O or partial error returns', () => {
    const argv = Object.freeze(['style', 'middle']);
    assert.deepEqual(parseStateArguments(argv), {
      kind: 'change',
      change: { output_style: 'middle' },
    });
    assert.deepEqual(argv, ['style', 'middle']);
    assert.deepEqual(parseStateArguments([]), { kind: 'status' });
    assert.deepEqual(parseStateArguments(['status', 'extra']), {
      kind: 'error',
      message: 'state status does not accept arguments',
    });
    assert.deepEqual(parseStateArguments(['on', 'extra']), {
      kind: 'error',
      message: 'state on does not accept arguments',
    });
    assert.deepEqual(parseStateArguments(['style', 'wide']), {
      kind: 'error',
      message: 'usage: feynman state style short|middle|full',
    });
    assert.deepEqual(parseStateArguments(['unknown']), {
      kind: 'error',
      message: "unknown state command 'unknown'",
    });
  });

  it('preserves real lint spawn errors and reports signaled wrappers', () => {
    const missing = runLintProcess('feynman-linter-that-does-not-exist', []);
    assert.equal(missing.status, null);
    assert.ok(missing.error instanceof Error);

    const stderr: string[] = [];
    const stderrMock = mock.method(process.stderr, 'write', (chunk: unknown) => {
      stderr.push(String(chunk));
      return true;
    });
    const exitMock = mock.method(process, 'exit', () => {
      throw new ExitSignal();
    });
    try {
      assert.throws(() => {
        cmdLint(['file.md'], () => missing);
      }, ExitSignal);
      assert.match(stderr.join(''), /failed to start linter/);
      assert.match(stderr.join(''), /ENOENT|not found/i);
      stderr.length = 0;
      assert.throws(() => {
        cmdLint(['file.md'], () => ({ status: 0, error: undefined, signal: 'SIGTERM' }));
      }, ExitSignal);
      assert.match(stderr.join(''), /terminated by signal SIGTERM/);
    } finally {
      stderrMock.mock.restore();
      exitMock.mock.restore();
    }
  });
});

describe('Codex hook configuration transformation', () => {
  it('preserves foreign keys and leaves a frozen caller configuration unchanged', () => {
    const foreignGroup = Object.freeze({
      matcher: 'foreign',
      hooks: Object.freeze([Object.freeze({ type: 'command', command: 'node /tmp/foreign.ts' })]),
      extension: Object.freeze({ owner: 'user' }),
    });
    const feynmanGroup = Object.freeze({
      matcher: 'startup',
      hooks: Object.freeze([
        Object.freeze({ type: 'command', command: 'node /tmp/feynman-session-start.ts' }),
      ]),
    });
    const settings: ValidatedCodexConfig = Object.freeze({
      model: 'custom',
      foreign: Object.freeze({ nested: true }),
      hooks: Object.freeze({
        SessionStart: Object.freeze([foreignGroup, feynmanGroup]),
        CustomEvent: Object.freeze([foreignGroup]),
      }),
    });

    const cleaned = removeFeynmanHooks(settings);

    assert.deepEqual(cleaned, {
      model: 'custom',
      foreign: { nested: true },
      hooks: {
        SessionStart: [foreignGroup],
        CustomEvent: [foreignGroup],
      },
    });
    assert.equal(settings.hooks?.['SessionStart']?.length, 2);
    assert.equal(cleaned === settings, false);
  });
});
