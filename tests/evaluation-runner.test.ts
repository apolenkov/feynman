import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  runEvaluationCommand,
  type EvaluationCommandResult,
  type EvaluationCommandRunner,
} from '../scripts/evaluate.ts';

import {
  fixture,
  validTasks,
  validUsefulnessTasks,
  ok,
  events,
  runnerForExec,
  run,
} from './helpers/evaluation-fixture.ts';

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
      { evals: Array.from({ length: 20 }, (_, index) => ({ id: index + 2, prompt: 'shifted' })) },
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

  it('rejects malformed usefulness tasks before any model call', () => {
    for (const tasks of [
      { tasks: [] },
      { tasks: Array.from({ length: 12 }, () => ({ id: 'N01' })) },
      {
        tasks: validUsefulnessTasks().tasks.map((task, index) =>
          index === 4 ? { ...task, answerKey: 4 } : task,
        ),
      },
    ]) {
      const fx = fixture(validTasks(), tasks);
      let calls = 0;
      try {
        assert.throws(() => {
          run(fx, () => (calls++, ok()));
        }, /12-task|usefulness/);
        assert.equal(calls, 0);
      } finally {
        fx.dispose();
      }
    }
  });

  it('refuses a dirty source revision before any model attempt', () => {
    const fx = fixture();
    let execCalls = 0;
    try {
      assert.throws(() => {
        run(fx, (command, args) => {
          if (command === 'git')
            return ok(args[0] === 'status' ? '?? evals/usefulness.json\n' : 'abc123\n');
          if (args[0] === '--version') return ok('codex-test 1\n');
          execCalls++;
          return ok(events());
        });
      }, /clean source revision/);
      assert.equal(execCalls, 0);
    } finally {
      fx.dispose();
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

  for (const [label, text, valid] of [
    ['missing', undefined, false],
    ['non-string', { answer: 'looks like text' }, false],
    ['blank', ' \t\n ', false],
    ['multiline', '  ┌─é─┐\n  └───┘\r\n', true],
  ] as const) {
    it(`records a ${label} agent message in a completed tool-free turn`, () => {
      const fx = fixture();
      const stdout = [
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }),
      ].join('\n');
      try {
        const evaluate = (): void => {
          run(
            fx,
            runnerForExec(() => ok(stdout)),
          );
        };
        if (valid) evaluate();
        else assert.throws(evaluate, /Evaluation stopped after failed attempt/);
        const attempts = fs.readdirSync(fx.output).filter((name) => /^1-1-.+\.json$/.test(name));
        assert.equal(attempts.length, valid ? 3 : 1);
        for (const attempt of attempts) {
          const summary: unknown = JSON.parse(
            fs.readFileSync(path.join(fx.output, attempt), 'utf8'),
          );
          assert.partialDeepStrictEqual(summary, {
            success: valid,
            usedTools: false,
            ...(valid ? { answer: text } : {}),
          });
          assert.equal(
            fs.readFileSync(
              path.join(fx.output, attempt.replace(/\.json$/, '.events.jsonl')),
              'utf8',
            ),
            stdout,
          );
        }
      } finally {
        fx.dispose();
      }
    });
  }

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

  it('records one fixed 96-attempt run with original and usefulness prompts', () => {
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
      assert.equal(execCalls.length, 96);
      assert.equal(
        fs.readdirSync(fx.output).filter((name) => /^\d+-\d+-.+\.json$/.test(name)).length,
        96,
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
      assert.deepEqual(complete, { completedAt: '2026-09-05T00:00:00.000Z', attempts: 96 });
      assert.deepEqual(fs.readdirSync(fx.temporaryRoot), []);
      const first = execCalls[0] ?? [];
      assert.ok(first.includes('exact-model'));
      assert.ok(first.includes('model_reasoning_effort="medium"'));
      assert.ok(first.includes('read-only'));
      const firstUsefulnessPrompt = execCalls[60]?.at(-1);
      assert.equal(
        firstUsefulnessPrompt,
        'These facts completely define the fictional system for this task.\n\nnew prompt 1\n\nF1: new fact 1\n\nComprehension question: new question 1',
      );
      assert.equal(firstUsefulnessPrompt.includes('SECRET answer 1'), false);
      const newSummary: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, '21-1-skill.json'), 'utf8'),
      );
      assert.ok(typeof newSummary === 'object' && newSummary !== null);
      assert.deepEqual(
        {
          taskId: 'taskId' in newSummary ? newSummary.taskId : undefined,
          sourceTaskId: 'sourceTaskId' in newSummary ? newSummary.sourceTaskId : undefined,
          suite: 'suite' in newSummary ? newSummary.suite : undefined,
          repetition: 'repetition' in newSummary ? newSummary.repetition : undefined,
        },
        { taskId: 21, sourceTaskId: 'N01', suite: 'usefulness', repetition: 1 },
      );
      assert.equal(
        fs.readFileSync(path.join(fx.output, 'original-tasks.json'), 'utf8'),
        `${JSON.stringify(validTasks())}\n`,
      );
      assert.equal(
        fs.readFileSync(path.join(fx.output, 'usefulness-tasks.json'), 'utf8'),
        `${JSON.stringify(validUsefulnessTasks())}\n`,
      );
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(typeof manifest === 'object' && manifest !== null);
      assert.deepEqual(
        {
          protocol: 'protocol' in manifest ? manifest.protocol : undefined,
          repetitions: 'repetitions' in manifest ? manifest.repetitions : undefined,
          expectedAttempts: 'expectedAttempts' in manifest ? manifest.expectedAttempts : undefined,
        },
        { protocol: 2, repetitions: 1, expectedAttempts: 96 },
      );
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
