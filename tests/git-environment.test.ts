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

for (const throws of [false, true]) {
  it(`isolates implicit child environment and restores it after callback ${throws ? 'throw' : 'success'}`, (t) => {
    const original = { ...process.env };
    const root = fs.mkdtempSync(path.join(process.cwd(), '.git-environment-test-'));
    t.after(() => {
      for (const name of Object.keys(process.env)) {
        if (!Object.hasOwn(original, name)) Reflect.deleteProperty(process.env, name);
      }
      Object.assign(process.env, original);
      fs.rmSync(root, { recursive: true, force: true });
    });
    execFileSync('git', ['init', '--quiet'], { cwd: root, env: gitFixtureEnvironment() });
    const gitDir = path.join(root, '.git');
    process.env['GIT_DIR'] = gitDir;
    process.env['GIT_CONFIG_GLOBAL'] = path.join(root, 'caller-config');
    process.env['GIT_CONFIG_NOSYSTEM'] = '0';
    process.env['FEYNMAN_GIT_ENVIRONMENT_TEST'] = 'caller';
    delete process.env['GIT_TEST_SCOPE'];
    const childEnvironment = (): string =>
      execFileSync(
        process.execPath,
        [
          '-e',
          'process.stdout.write(JSON.stringify([process.env.GIT_DIR ?? null, process.env.GIT_CONFIG_GLOBAL, process.env.GIT_CONFIG_NOSYSTEM, process.env.FEYNMAN_GIT_ENVIRONMENT_TEST, process.env.GIT_TEST_SCOPE ?? null]))',
        ],
        { encoding: 'utf8' },
      );
    const failure = new Error('fixture callback failed');
    const operation = (): undefined => {
      assert.equal(childEnvironment(), '[null,"/dev/null","1","caller",null]');
      process.env['FEYNMAN_GIT_ENVIRONMENT_TEST'] = 'callback';
      process.env['GIT_TEST_SCOPE'] = 'callback';
      if (throws) throw failure;
    };
    if (throws) {
      assert.throws(
        () => {
          withGitFixtureEnvironment(operation);
        },
        (error: unknown) => error === failure,
      );
    } else {
      withGitFixtureEnvironment(operation);
    }
    assert.equal(
      childEnvironment(),
      JSON.stringify([gitDir, path.join(root, 'caller-config'), '0', 'caller', null]),
    );
  });
}
