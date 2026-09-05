import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitFixtureEnvironment, withGitFixtureEnvironment } from './helpers/git-environment.ts';

it('keeps Git fixture writes out of a repository named by inherited environment', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-git-isolation-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const protectedRoot = path.join(root, 'protected');
  const fixtureRoot = path.join(root, 'fixture');
  fs.mkdirSync(protectedRoot);
  fs.mkdirSync(fixtureRoot);
  const baseEnvironment = gitFixtureEnvironment();
  const protectedGit = (args: readonly string[]): string =>
    execFileSync('git', args, { cwd: protectedRoot, env: baseEnvironment, encoding: 'utf8' });
  protectedGit(['init', '--quiet']);
  fs.writeFileSync(path.join(protectedRoot, 'preserve.txt'), 'keep this staged content\n');
  protectedGit(['add', '.']);
  const snapshot = (): readonly { readonly file: string; readonly bytes: Buffer }[] =>
    fs
      .readdirSync(protectedRoot, { recursive: true, encoding: 'utf8' })
      .filter((file) => fs.statSync(path.join(protectedRoot, file)).isFile())
      .toSorted()
      .map((file) => ({ file, bytes: fs.readFileSync(path.join(protectedRoot, file)) }));
  const before = snapshot();
  const inherited = Object.freeze({
    ...process.env,
    GIT_DIR: path.join(protectedRoot, '.git'),
    GIT_WORK_TREE: protectedRoot,
    GIT_INDEX_FILE: path.join(protectedRoot, '.git', 'index'),
    GIT_OBJECT_DIRECTORY: path.join(protectedRoot, '.git', 'objects'),
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.worktree',
    GIT_CONFIG_VALUE_0: protectedRoot,
  });
  const env = gitFixtureEnvironment(inherited);
  execFileSync('git', ['init', '--quiet'], { cwd: fixtureRoot, env });
  fs.writeFileSync(path.join(fixtureRoot, 'fixture.txt'), 'owned fixture\n');
  execFileSync('git', ['add', '.'], { cwd: fixtureRoot, env });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'test: owned fixture',
    ],
    { cwd: fixtureRoot, env },
  );
  assert.equal(
    execFileSync('git', ['log', '-1', '--format=%s'], {
      cwd: fixtureRoot,
      env,
      encoding: 'utf8',
    }).trim(),
    'test: owned fixture',
  );
  assert.deepEqual(snapshot(), before);
  assert.equal(protectedGit(['status', '--porcelain']), 'A  preserve.txt\n');
  assert.equal(
    fs.readFileSync(path.join(protectedRoot, 'preserve.txt'), 'utf8'),
    'keep this staged content\n',
  );
  assert.equal(fs.existsSync(path.join(protectedRoot, 'fixture.txt')), false);
});

it('restores the caller environment after successful and failed synchronous fixture scopes', () => {
  const original = process.env;
  const failure = new Error('fixture callback failed');
  withGitFixtureEnvironment(() => {
    assert.notEqual(process.env, original);
    assert.equal(process.env['GIT_DIR'], undefined);
    assert.equal(process.env['GIT_CONFIG_GLOBAL'], '/dev/null');
  });
  assert.equal(process.env, original);
  assert.throws(
    () => {
      withGitFixtureEnvironment(() => {
        throw failure;
      });
    },
    (error: unknown) => error === failure,
  );
  assert.equal(process.env, original);
});
