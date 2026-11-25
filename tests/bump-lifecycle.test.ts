import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, type TestContext } from 'node:test';
import { createBumpEnvironment, executeBump, type BumpRunner } from '../scripts/feynman-bump.ts';

const plugin = 'plugins/feynman/.codex-plugin/plugin.json';
const originals = {
  'package.json': '{  "version":"1.2.3", "name":"fixture" }\r\n',
  [plugin]: '{"name":"feynman","version":"1.2.3","skills":"./skills/"}\n',
  'package-lock.json':
    '{"version":"1.2.3","packages":{"":{"version":"1.2.3"},"dep":{"version":"1.2.3"}}}\n',
  'CHANGELOG.md': '# Versions\r\n\r\nPrevious release\r\n',
};
const generated = '# Versions\n\nv1.3.0\n';
const prepared = {
  'package.json': '{  "version": "1.3.0", "name":"fixture" }\r\n',
  [plugin]: '{"name":"feynman","version": "1.3.0","skills":"./skills/"}\n',
  'package-lock.json':
    JSON.stringify(
      {
        version: '1.3.0',
        packages: { '': { version: '1.3.0' }, dep: { version: '1.2.3' } },
      },
      null,
      2,
    ) + '\n',
  'CHANGELOG.md': generated,
};
const options = {
  kind: 'run',
  versionRequest: 'minor',
  dryRun: false,
  commit: true,
  tag: true,
  push: true,
} as const;
const files = Object.keys(originals);
const commands = [
  ['git', 'status', '--porcelain'],
  ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
  ['npm', 'run', '--silent', 'changelog'],
  ['npm', 'run', '--silent', 'ci'],
  ['git', 'add', ...files],
  ['git', 'commit', '-m', 'chore(release): v1.3.0'],
  ['git', 'rev-parse', '--short', 'HEAD'],
  ['git', 'tag', '-a', 'v1.3.0', '-m', 'v1.3.0'],
  ['git', 'push', 'origin', 'main'],
  ['git', 'push', 'origin', 'v1.3.0'],
];

function releaseFixture(t: TestContext, interrupt?: 'changelog' | 'ci' | 'tag') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bump-trace-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.dirname(path.join(root, plugin)), { recursive: true });
  for (const [file, bytes] of Object.entries(originals))
    fs.writeFileSync(path.join(root, file), bytes);
  const calls: string[][] = [];
  const errors: string[] = [];
  const readFiles = () =>
    Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  const runner: BumpRunner = (command, args, cwd) => {
    assert.equal(cwd, root);
    calls.push([command, ...args]);
    const action = command === 'git' ? args[0] : args.at(-1);
    if (action === 'changelog') fs.writeFileSync(path.join(root, 'CHANGELOG.md'), generated);
    if (action === 'ci' || action === 'changelog') assert.deepEqual(readFiles(), prepared);
    if (interrupt !== undefined && action === interrupt) {
      return {
        status: null,
        signal: 'SIGTERM',
        error: undefined,
        stdout: 'partial output',
        stderr: `${action} interrupted\n`,
      };
    }
    const stdout = args.includes('--abbrev-ref')
      ? 'main\n'
      : args.includes('--short')
        ? 'abc123\n'
        : '';
    return { status: 0, signal: null, error: undefined, stdout, stderr: '' };
  };
  const env = {
    ...createBumpEnvironment(root, runner),
    log: () => undefined,
    writeError: (message: string) => {
      errors.push(message);
    },
  };
  return { env, calls, errors, readFiles };
}

it('prepares exact release bytes before CI, then commits, tags and pushes through the fake runner', (t) => {
  const fx = releaseFixture(t);
  executeBump(options, fx.env);
  assert.deepEqual(fx.calls, commands);
  assert.deepEqual(fx.errors, []);
  assert.deepEqual(fx.readFiles(), prepared);
});

it('restores all four files byte-for-byte after interrupted changelog generation', (t) => {
  const fx = releaseFixture(t, 'changelog');
  assert.throws(
    () => {
      executeBump(options, fx.env);
    },
    {
      message: 'npm run changelog failed (terminated by signal SIGTERM)',
    },
  );
  assert.deepEqual(fx.calls, commands.slice(0, 3));
  assert.deepEqual(fx.errors, ['changelog interrupted\n']);
  assert.deepEqual(fx.readFiles(), originals);
});

it('retains CI diagnostics and continues rollback after one restoration write fails', (t) => {
  const fx = releaseFixture(t, 'ci');
  const restored: string[] = [];
  const snapshots = new Map(Object.entries(originals));
  assert.throws(
    () => {
      executeBump(options, {
        ...fx.env,
        writeFile: (file, contents) => {
          if (contents === snapshots.get(file)) {
            restored.push(file);
            if (file === plugin) throw new Error('write denied');
          }
          fx.env.writeFile(file, contents);
        },
      });
    },
    {
      message: `full CI failed — refusing to bump (terminated by signal SIGTERM); restoration failures: ${plugin}: write denied`,
    },
  );
  assert.deepEqual(restored, files);
  assert.deepEqual(fx.calls, commands.slice(0, 4));
  assert.deepEqual(fx.errors, ['ci interrupted\n']);
  assert.deepEqual(fx.readFiles(), { ...originals, [plugin]: prepared[plugin] });
});

it('keeps the prepared release and stops before push when tagging is interrupted', (t) => {
  const fx = releaseFixture(t, 'tag');
  assert.throws(
    () => {
      executeBump(options, fx.env);
    },
    {
      message: 'git tag -a v1.3.0 -m v1.3.0 failed (terminated by signal SIGTERM)',
    },
  );
  assert.deepEqual(fx.calls, commands.slice(0, 8));
  assert.deepEqual(fx.errors, ['tag interrupted\n']);
  assert.deepEqual(fx.readFiles(), prepared);
});
