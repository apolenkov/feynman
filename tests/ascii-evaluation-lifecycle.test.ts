import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';
import { fixture } from './helpers/ascii-fixture.ts';
import { fakeTransport, run } from './helpers/ascii-transport.ts';
import { assertManifestBytes } from './helpers/evaluation-manifest.ts';

const preflight = [
  ['git', 'rev-parse', 'HEAD'],
  ['git', 'rev-parse', 'HEAD^{tree}'],
  ['git', 'status', '--porcelain=v1', '--untracked-files=all'],
  ['git', 'diff', 'HEAD', '--binary'],
  ['codex', '--version'],
  ['npm', 'run', 'build'],
  ['npm', 'run', 'test:release'],
];

function asciiPrompt(id: number): string {
  const task = 'A' + String(id).padStart(2, '0');
  const source =
    id === 2
      ? 'Source branches to Build and Scan; both join at shared Release.'
      : `Public source ${task}.`;
  return `Transform ${task}.\n\n${source}\n\nMaximum diagram width: ${id === 13 ? 60 : 80} display columns. ASCII means ASCII structural marks with source-language Unicode labels permitted. Preserve names and use fenced monospaced text for the visual.`;
}

it('records the final ASCII manifest after discovery, hook trust and the 67 model calls', async (t) => {
  const fx = fixture();
  t.after(fx.dispose);
  const transport = fakeTransport(fx);
  const calls: string[][] = [];
  const directories: string[] = [];
  await run(fx, transport, {
    development: false,
    taskIds: [],
    arms: [],
    runCommand: (command, args, options) => {
      calls.push([command, ...args]);
      if (command === 'codex' && args[0] === 'exec') {
        const home = options.env?.['HOME'];
        assert.equal(options.cwd, home);
        assert.equal(args.at(-2), home);
      }
      return transport.runner(command, args, options);
    },
    discoverSkills: (...args) => {
      directories.push(...fs.readdirSync(fx.temporaryRoot));
      calls.push(['discover']);
      return transport.discover(...args);
    },
    trustHooks: (...args) => {
      calls.push(['trust']);
      return transport.trust(...args);
    },
  });

  const homeFor = (arm: string): string => {
    const dir = directories.find((name) => name.startsWith(`feynman-ascii-${arm}-`));
    assert.ok(dir !== undefined, `missing ${arm} home`);
    return path.join(fx.temporaryRoot, dir);
  };
  const native = path.join(homeFor('native'), 'artifact');
  const hook = path.join(homeFor('hook'), 'artifact');
  const cli = path.join(hook, 'package/bin/feynman.js');
  const tarball = path.join(fx.output, 'candidate-package.tgz');
  const setup = [
    ...preflight,
    ['tar', '-xzf', tarball, '-C', native],
    ['tar', '-xzf', tarball, '-C', hook],
    ['codex', 'plugin', 'marketplace', 'add', path.join(native, 'package'), '--json'],
    ['codex', 'plugin', 'add', 'feynman@feynman', '--json'],
    ['discover'],
    [process.execPath, cli, 'install'],
    ['trust'],
  ];
  const exec = (arm: string, prompt: string, explicit = false) => [
    'codex',
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--json',
    '-m',
    'gpt-5.6-luna',
    '-c',
    'model_reasoning_effort="medium"',
    '-C',
    homeFor(arm),
    explicit ? 'Use $feynman for this request.\n\n' + prompt : prompt,
  ];
  const rotations = [
    ['hook', 'baseline', 'native'],
    ['baseline', 'native', 'hook'],
    ['native', 'hook', 'baseline'],
  ];
  const transformations = Array.from({ length: 14 }, (_, index) => {
    const arms = rotations[index % 3];
    assert.ok(arms);
    return arms.map((arm) => exec(arm, asciiPrompt(index + 1), arm === 'native' && index < 10));
  }).flat();
  const suppressions = Array.from({ length: 8 }, (_, index) => {
    const arms = index % 2 === 0 ? ['native', 'hook'] : ['hook', 'native'];
    return arms.map((arm) => exec(arm, `Original prompt ${index + 13}`, arm === 'native'));
  }).flat();
  const settings = ['lite', 'full', 'ultra'].flatMap((intensity) =>
    ['short', 'middle', 'full'].flatMap((style) => [
      [process.execPath, cli, 'state', intensity],
      [process.execPath, cli, 'state', 'style', style],
      exec('hook', asciiPrompt(2)),
    ]),
  );
  assert.deepEqual(calls, [...setup, ...transformations, ...suppressions, ...settings]);
  assertManifestBytes(fx.output, 'ascii-completed-manifest', 'evaluate-ascii');
  assert.deepEqual(fs.readdirSync(fx.temporaryRoot), []);
});

it('keeps the interrupted ASCII manifest and model diagnostics when home removal also fails', async (t) => {
  const fx = fixture();
  t.after(fx.dispose);
  const transport = fakeTransport(fx, { modelFailure: true });
  const calls: string[][] = [];
  const retained: string[] = [];
  const primary = 'Model attempt A01-baseline failed; evidence retained';
  await assert.rejects(
    run(fx, transport, {
      taskIds: ['A01', 'A02'],
      runCommand: (command, args, options) => {
        calls.push([command, ...args]);
        return transport.runner(command, args, options);
      },
      removeTemporaryHome: (home) => {
        retained.push(home);
        throw new Error('removal denied');
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error && error.cause instanceof Error);
      assert.equal(error.cause.message, primary);
      assert.equal(
        error.message,
        primary +
          '\nAdditional cleanup failure: Temporary cleanup failed: baseline: removal denied',
      );
      return true;
    },
  );
  assert.deepEqual(calls.slice(0, -1), preflight);
  assert.deepEqual(calls.at(-1)?.slice(0, 2), ['codex', 'exec']);
  assert.deepEqual(transport.callOrder, ['exec']);
  assertManifestBytes(fx.output, 'ascii-failed-manifest', 'evaluate-ascii');
  assert.equal(
    fs.readFileSync(path.join(fx.output, 'A01-baseline.stderr.txt'), 'utf8'),
    'synthetic model failure\n',
  );
  assert.equal(fs.existsSync(path.join(fx.output, 'completion.json')), false);
  assert.equal(retained.length, 1);
  assert.deepEqual(
    fs.readdirSync(fx.temporaryRoot),
    retained.map((home) => path.basename(home)),
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(fx.output, 'filesystem-final.json'), 'utf8')),
    {
      temporaryHomes: [{ arm: 'baseline', path: retained[0], exists: true }],
      cleanupFailures: ['baseline: removal denied'],
      authContentsRecorded: false,
    },
  );
});
