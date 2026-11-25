import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';
import { events, fixture, ok, run, runnerForExec } from './helpers/evaluation-fixture.ts';
import { assertManifestBytes } from './helpers/evaluation-manifest.ts';

const preflight = [
  ['codex', '--version'],
  ['git', 'rev-parse', 'HEAD'],
  ['git', 'status', '--porcelain=v1', '--untracked-files=all'],
  ['git', 'diff', 'HEAD', '--binary'],
];

const orders = [
  ['hook', '', 'skill'],
  ['', 'skill', 'hook'],
  ['skill', 'hook', ''],
] as const;

function expectedExec(home: string, instructions: string, prompt: string): string[] {
  return [
    'codex',
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--json',
    '-m',
    'exact-model',
    '-c',
    'model_reasoning_effort="medium"',
    '-c',
    `developer_instructions=${JSON.stringify('Answer the user using only the supplied facts. Do not call tools.\n' + instructions)}`,
    '-C',
    home,
    prompt,
  ];
}

it('uses the fixed three-condition rotation and records the byte-exact evaluation manifest', (t) => {
  const fx = fixture();
  t.after(fx.dispose);
  const calls: string[][] = [];
  const homes: string[] = [];
  const fake = runnerForExec(() => ok(events()), calls);
  run(fx, (command, args, options) => {
    if (command === 'codex' && args[0] === 'exec') {
      const env = options.env;
      assert.ok(env !== undefined);
      const home = env['HOME'];
      assert.ok(home !== undefined);
      assert.equal(path.dirname(home), fx.temporaryRoot);
      assert.equal(env['CODEX_HOME'], path.join(home, '.codex'));
      homes.push(home);
    }
    return fake(command, args, options);
  });

  const prompts = [
    ...Array.from({ length: 20 }, (_, index) => `prompt ${index + 1}`),
    ...Array.from({ length: 12 }, (_, index) => {
      const id = index + 1;
      return `These facts completely define the fictional system for this task.\n\nnew prompt ${id}\n\nF1: new fact ${id}\n\nComprehension question: new question ${id}`;
    }),
  ];
  assert.equal(new Set(homes).size, 96);
  assert.deepEqual(calls, [
    ...preflight,
    ...prompts.flatMap((prompt, index) => {
      const order = orders[index % 3];
      assert.ok(order);
      return order.map((instruction, offset) => {
        const home = homes[index * 3 + offset];
        assert.ok(home !== undefined);
        return expectedExec(home, instruction, prompt);
      });
    }),
  ]);
  assertManifestBytes(fx.output, 'evaluation-manifest', 'evaluate');
  assert.deepEqual(fs.readdirSync(fx.temporaryRoot), []);
  assert.equal(
    fs.readFileSync(path.join(fx.output, 'complete.json'), 'utf8'),
    '{"completedAt":"2026-09-05T00:00:00.000Z","attempts":96}\n',
  );
});

it('preserves the interrupted second attempt, its stderr and its cleanup error', (t) => {
  const fx = fixture();
  t.after(fx.dispose);
  const calls: string[][] = [];
  const homes: string[] = [];
  const cleanup = new Error('removal denied');
  const stdout = events();
  const stderr = 'model interrupted\n';
  const primary = 'Evaluation stopped after failed attempt 1-1-baseline; evidence retained';
  const fake = runnerForExec(
    () =>
      homes.length === 0
        ? ok(stdout)
        : {
            status: null,
            signal: 'SIGTERM',
            stdout,
            stderr,
          },
    calls,
  );
  assert.throws(
    () => {
      run(fx, fake, undefined, (home) => {
        homes.push(home);
        if (homes.length === 2) throw cleanup;
        fs.rmSync(home, { recursive: true });
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof AggregateError && error.cause instanceof Error);
      assert.equal(error.cause.message, primary);
      assert.deepEqual(error.errors, [error.cause, cleanup]);
      assert.equal(error.message, primary + '; temporary-home cleanup also failed: removal denied');
      return true;
    },
  );
  const [first, second] = homes;
  assert.ok(first !== undefined && second !== undefined);
  assert.deepEqual(calls, [
    ...preflight,
    expectedExec(first, 'hook', 'prompt 1'),
    expectedExec(second, '', 'prompt 1'),
  ]);
  assertManifestBytes(fx.output, 'evaluation-manifest', 'evaluate');
  const evidence = (name: string): string => fs.readFileSync(path.join(fx.output, name), 'utf8');
  assert.equal(evidence('1-1-baseline.stderr.txt'), stderr);
  assert.equal(evidence('1-1-baseline.events.jsonl'), stdout);
  assert.partialDeepStrictEqual(JSON.parse(evidence('1-1-baseline.json')), {
    success: false,
    status: null,
    signal: 'SIGTERM',
  });
  assert.equal(fs.existsSync(path.join(fx.output, 'complete.json')), false);
  assert.deepEqual(fs.readdirSync(fx.temporaryRoot), [path.basename(second)]);
});
