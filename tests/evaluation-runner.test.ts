import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  runEvaluation,
  runEvaluationCommand,
  type EvaluationCommandResult,
  type EvaluationCommandRunner,
} from '../scripts/evaluate.ts';

interface EvaluationFixture {
  readonly root: string;
  readonly output: string;
  readonly temporaryRoot: string;
  readonly authSource: string;
  readonly dispose: () => void;
}

function fixture(tasks: unknown = validTasks()): EvaluationFixture {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-evaluate-test-'));
  const root = path.join(base, 'repo');
  const output = path.join(base, 'output');
  const temporaryRoot = path.join(base, 'temporary');
  const authSource = path.join(base, 'auth.json');
  fs.mkdirSync(path.join(root, 'evals'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plugins/feynman/skills/feynman'), { recursive: true });
  fs.mkdirSync(path.join(root, 'rules'), { recursive: true });
  fs.mkdirSync(temporaryRoot);
  fs.writeFileSync(path.join(root, 'evals/evals.json'), `${JSON.stringify(tasks)}\n`);
  fs.writeFileSync(path.join(root, 'plugins/feynman/skills/feynman/SKILL.md'), 'skill');
  fs.writeFileSync(
    path.join(root, 'rules/feynman-contract.md'),
    '<intensity name="full">hook</intensity>',
  );
  fs.writeFileSync(authSource, '{"synthetic":true}\n', { mode: 0o600 });
  return {
    root,
    output,
    temporaryRoot,
    authSource,
    dispose: () => {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

function validTasks(): Readonly<{ evals: readonly { id: number; prompt: string }[] }> {
  return {
    evals: Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      prompt: `prompt ${index + 1}`,
    })),
  };
}

const ok = (stdout = ''): EvaluationCommandResult => ({
  status: 0,
  signal: null,
  stdout,
  stderr: '',
});
const events = (): string =>
  [
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'answer' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }),
  ].join('\n');

function runnerForExec(
  exec: () => EvaluationCommandResult,
  calls: string[][] = [],
): EvaluationCommandRunner {
  return (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') return ok(args[0] === 'rev-parse' ? 'abc123\n' : '');
    if (args[0] === '--version') return ok('codex-test 1\n');
    return exec();
  };
}

function run(
  fx: EvaluationFixture,
  runner: EvaluationCommandRunner,
  onProgress: (line: string) => void = () => undefined,
  removeTemporaryHome?: (home: string) => void,
): void {
  runEvaluation({
    model: 'exact-model',
    root: fx.root,
    outputDirectory: fx.output,
    temporaryRoot: fx.temporaryRoot,
    authSource: fx.authSource,
    runCommand: runner,
    now: () => new Date('2026-09-05T00:00:00.000Z'),
    environment: { PATH: '/synthetic' },
    onProgress,
    ...(removeTemporaryHome === undefined ? {} : { removeTemporaryHome }),
  });
}

describe('evaluation runner', () => {
  it('real command adapter inherits omitted env and preserves ENOENT details', () => {
    const inherited = runEvaluationCommand(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.PATH ?? "")'],
      { encoding: 'utf8' },
    );
    assert.equal(inherited.status, 0);
    assert.equal(inherited.stdout, process.env['PATH'] ?? '');
    const unavailable = runEvaluationCommand('feynman-command-that-does-not-exist', [], {
      encoding: 'utf8',
    });
    assert.equal(unavailable.status, null);
    assert.equal(unavailable.stdout, '');
    assert.equal(unavailable.stderr, '');
    assert.ok(unavailable.error instanceof Error);
  });

  it('rejects an unavailable Codex CLI without attempting a model call', () => {
    const fx = fixture();
    let execCalls = 0;
    try {
      const unavailable: EvaluationCommandRunner = (command, args) =>
        command === 'codex' && args[0] === '--version'
          ? { status: null, signal: null, stdout: '', stderr: '', error: new Error('ENOENT') }
          : command === 'git'
            ? ok('abc')
            : (execCalls++, ok(events()));
      assert.throws(() => {
        run(fx, unavailable);
      }, /Codex CLI is unavailable:\nENOENT/);
      assert.equal(execCalls, 0);
    } finally {
      fx.dispose();
    }
  });

  it('preserves a signal-only Codex version failure', () => {
    const fx = fixture();
    const signalled: EvaluationCommandRunner = () => ({
      status: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
    });
    try {
      assert.throws(() => {
        run(fx, signalled);
      }, /Codex CLI is unavailable:\nterminated by signal: SIGTERM/);
    } finally {
      fx.dispose();
    }
  });

  it('rejects malformed and duplicate task sets before any model call', () => {
    for (const tasks of [
      { evals: [{ id: 1, prompt: 'only one' }] },
      { evals: Array.from({ length: 20 }, () => ({ id: 1, prompt: 'duplicate' })) },
      { evals: Array.from({ length: 20 }, (_, id) => ({ id, prompt: 4 })) },
    ]) {
      const fx = fixture(tasks);
      let calls = 0;
      try {
        assert.throws(() => {
          run(fx, () => (calls++, ok()));
        }, /20-task|Duplicate|Invalid/);
        assert.equal(calls, 0);
      } finally {
        fx.dispose();
      }
    }
    const malformed = fixture();
    fs.writeFileSync(path.join(malformed.root, 'evals/evals.json'), '{bad json');
    let calls = 0;
    try {
      assert.throws(() => {
        run(malformed, () => (calls++, ok()));
      }, SyntaxError);
      assert.equal(calls, 0);
    } finally {
      malformed.dispose();
    }
  });

  it('preserves a git termination signal when its streams are empty', () => {
    const fx = fixture();
    try {
      assert.throws(() => {
        run(fx, (command) =>
          command === 'git'
            ? { status: null, signal: 'SIGTERM', stdout: '', stderr: '' }
            : ok('codex-test'),
        );
      }, /Cannot identify source revision:\nsignal SIGTERM/);
    } finally {
      fx.dispose();
    }
  });

  it('preserves git diagnostics when source revision cannot be identified', () => {
    const fx = fixture();
    const failedGit: EvaluationCommandRunner = (command, args) => {
      if (command === 'codex' && args[0] === '--version') return ok('codex-test');
      return { status: 128, signal: null, stdout: '', stderr: 'fatal: synthetic git failure' };
    };
    try {
      assert.throws(() => {
        run(fx, failedGit);
      }, /Cannot identify source revision:\nfatal: synthetic git failure/);
    } finally {
      fx.dispose();
    }
  });

  it('retains raw evidence and cleans temporary auth after malformed events', () => {
    const fx = fixture();
    try {
      assert.throws(() => {
        run(
          fx,
          runnerForExec(() => ok('{bad json')),
        );
      }, SyntaxError);
      assert.equal(
        fs.readFileSync(path.join(fx.output, '1-1-hook.events.jsonl'), 'utf8'),
        '{bad json',
      );
      assert.deepEqual(fs.readdirSync(fx.temporaryRoot), []);
    } finally {
      fx.dispose();
    }
  });

  it('retains raw events, stderr, and a failed summary for an attempted call', () => {
    const fx = fixture();
    const failure: EvaluationCommandResult = {
      status: 7,
      signal: null,
      stdout: events(),
      stderr: 'synthetic failure',
    };
    try {
      assert.throws(() => {
        run(
          fx,
          runnerForExec(() => failure),
        );
      }, /evidence retained/);
      const summary: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, '1-1-hook.json'), 'utf8'),
      );
      assert.ok(
        typeof summary === 'object' &&
          summary !== null &&
          'success' in summary &&
          summary.success === false,
      );
      assert.equal(
        fs.readFileSync(path.join(fx.output, '1-1-hook.stderr.txt'), 'utf8'),
        'synthetic failure',
      );
      assert.deepEqual(fs.readdirSync(fx.temporaryRoot), []);
    } finally {
      fx.dispose();
    }
  });

  it('reports both a failed attempt and temporary-home cleanup failure', () => {
    const fx = fixture();
    const failure: EvaluationCommandResult = {
      status: 7,
      signal: null,
      stdout: events(),
      stderr: 'synthetic model failure',
    };
    let caught: unknown;
    try {
      try {
        run(
          fx,
          runnerForExec(() => failure),
          () => undefined,
          () => {
            throw new Error('synthetic cleanup failure');
          },
        );
      } catch (error) {
        caught = error;
      }
      assert.ok(caught instanceof AggregateError);
      assert.match(caught.message, /failed attempt 1-1-hook; evidence retained/);
      assert.match(caught.message, /temporary-home cleanup also failed: synthetic cleanup failure/);
      assert.ok(caught.cause instanceof Error);
      assert.match(caught.cause.message, /failed attempt 1-1-hook; evidence retained/);
      assert.equal(
        fs.readFileSync(path.join(fx.output, '1-1-hook.stderr.txt'), 'utf8'),
        'synthetic model failure',
      );
      assert.ok(fs.existsSync(path.join(fx.output, '1-1-hook.json')));
    } finally {
      fx.dispose();
    }
  });

  it('records all 180 successful attempts in rotated order and cleans every home', () => {
    const fx = fixture();
    const calls: string[][] = [];
    const progress: string[] = [];
    try {
      run(
        fx,
        runnerForExec(() => ok(events()), calls),
        (line) => {
          progress.push(line);
        },
      );
      const execCalls = calls.filter(
        ([command, subcommand]) => command === 'codex' && subcommand === 'exec',
      );
      assert.equal(execCalls.length, 180);
      assert.equal(
        fs.readdirSync(fx.output).filter((name) => /^\d+-\d+-.+\.json$/.test(name)).length,
        180,
      );
      assert.deepEqual(progress.slice(0, 3), [
        '1-1-hook: recorded',
        '1-1-baseline: recorded',
        '1-1-skill: recorded',
      ]);
      assert.deepEqual(
        execCalls.slice(0, 3).map((args) => args.at(-1)),
        ['prompt 1', 'prompt 1', 'prompt 1'],
      );
      assert.deepEqual(
        ['1-1-hook.json', '1-1-baseline.json', '1-1-skill.json'].map((name) =>
          fs.existsSync(path.join(fx.output, name)),
        ),
        [true, true, true],
      );
      const complete: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'complete.json'), 'utf8'),
      );
      assert.deepEqual(complete, { completedAt: '2026-09-05T00:00:00.000Z', attempts: 180 });
      assert.deepEqual(fs.readdirSync(fx.temporaryRoot), []);
      const first = execCalls[0] ?? [];
      assert.ok(first.includes('exact-model'));
      assert.ok(first.includes('model_reasoning_effort="medium"'));
      assert.ok(first.includes('read-only'));
    } finally {
      fx.dispose();
    }
  });

  it('refuses to overwrite an existing output directory', () => {
    const fx = fixture();
    fs.mkdirSync(fx.output);
    try {
      assert.throws(() => {
        run(
          fx,
          runnerForExec(() => ok(events())),
        );
      }, /EEXIST/);
    } finally {
      fx.dispose();
    }
  });
});
