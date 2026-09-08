import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  buildPackage,
  buildPackageMain,
  type CommandResult,
  type CommandRunner,
} from '../scripts/build-package.ts';
import {
  releaseSmoke,
  releaseSmokeMain,
  runReleaseCommand,
  type ReleaseCommandRunner,
} from '../scripts/release-smoke.ts';
import {
  runPublishedCommand,
  verifyPublishedPackage,
  verifyPublishedPackageMain,
  type PublishedCommandRunner,
} from '../scripts/verify-published-package.ts';

const OK: CommandResult = { status: 0, signal: null, stdout: '', stderr: '', error: undefined };
function result(stdout = ''): CommandResult {
  return { ...OK, stdout };
}
function ownedRoot(
  prefix: string,
): Readonly<{ owned: string; root: string; temporaryRoot: string }> {
  const owned = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const root = path.join(owned, 'repo');
  const temporaryRoot = path.join(owned, 'tmp');
  fs.mkdirSync(root);
  fs.mkdirSync(temporaryRoot);
  return { owned, root, temporaryRoot };
}
function writePackage(root: string, value: unknown): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(value));
}

describe('build package behavior', () => {
  it('stages compiled/static files, rewrites entrypoints, and writes the tarball pointer', () => {
    const fixture = ownedRoot('feynman-build-happy-');
    writePackage(fixture.root, {
      name: '@test/feynman',
      version: '1.0.0',
      main: 'lib/index.ts',
      bin: { feynman: 'bin/feynman.ts' },
    });
    fs.mkdirSync(path.join(fixture.root, 'docs'));
    fs.writeFileSync(path.join(fixture.root, 'docs', 'guide.md'), 'guide');
    fs.writeFileSync(path.join(fixture.root, 'README.md'), 'readme');
    fs.writeFileSync(path.join(fixture.root, 'install.sh'), 'node bin/feynman.ts\n');
    const runner: CommandRunner = (command, _args, options) => {
      if (command === 'npx') {
        fs.mkdirSync(path.join(fixture.root, '.build', 'bin'), { recursive: true });
        fs.mkdirSync(path.join(fixture.root, '.build', 'lib'), { recursive: true });
        fs.writeFileSync(path.join(fixture.root, '.build', 'bin', 'feynman.js'), 'bin');
        fs.writeFileSync(path.join(fixture.root, '.build', 'lib', 'index.js'), 'lib');
        return OK;
      }
      const staged: unknown = JSON.parse(
        fs.readFileSync(path.join(options.cwd, 'package.json'), 'utf8'),
      );
      assert.deepEqual(staged, {
        name: '@test/feynman',
        version: '1.0.0',
        main: 'lib/index.js',
        bin: { feynman: 'bin/feynman.js' },
      });
      assert.equal(
        fs.readFileSync(path.join(options.cwd, 'install.sh'), 'utf8'),
        'node bin/feynman.js\n',
      );
      assert.equal(fs.readFileSync(path.join(options.cwd, 'docs', 'guide.md'), 'utf8'), 'guide');
      const tarball = path.join(fixture.root, 'dist', 'test.tgz');
      fs.writeFileSync(tarball, 'packed');
      return result(JSON.stringify({ package: { filename: 'test.tgz', size: 6, entryCount: 5 } }));
    };
    try {
      assert.equal(
        buildPackage({
          root: fixture.root,
          temporaryRoot: fixture.temporaryRoot,
          runCommand: runner,
        }),
        path.join(fixture.root, 'dist', 'test.tgz'),
      );
      assert.equal(
        fs.readFileSync(path.join(fixture.root, 'dist', 'TARBALL.txt'), 'utf8'),
        'dist/test.tgz\n',
      );
      assert.deepEqual(fs.readdirSync(fixture.temporaryRoot), []);
    } finally {
      fs.rmSync(fixture.owned, { recursive: true, force: true });
    }
  });

  it('rejects invalid pack metadata and a reported tarball that is absent', () => {
    for (const scenario of ['bad-json', 'incomplete', 'missing-tarball'] as const) {
      const fixture = ownedRoot(`feynman-build-${scenario}-`);
      writePackage(fixture.root, { bin: { feynman: 'bin/feynman.ts' } });
      const runner: CommandRunner = (command) =>
        command === 'npx'
          ? OK
          : result(
              scenario === 'bad-json'
                ? '{'
                : scenario === 'incomplete'
                  ? '[{"filename":"x"}]'
                  : JSON.stringify([{ filename: 'missing.tgz', size: 1, entryCount: 1 }]),
            );
      try {
        assert.throws(
          () =>
            buildPackage({
              root: fixture.root,
              temporaryRoot: fixture.temporaryRoot,
              runCommand: runner,
            }),
          scenario === 'bad-json'
            ? /JSON/
            : scenario === 'incomplete'
              ? /incomplete package metadata/
              : /expected tarball missing/,
        );
        assert.deepEqual(fs.readdirSync(fixture.temporaryRoot), []);
      } finally {
        fs.rmSync(fixture.owned, { recursive: true, force: true });
      }
    }
  });

  it('rejects invalid bin metadata through the function and main boundary', () => {
    const fixture = ownedRoot('feynman-build-invalid-bin-');
    writePackage(fixture.root, { bin: { feynman: 42 } });
    const previous = process.exitCode;
    try {
      assert.throws(
        () =>
          buildPackage({
            root: fixture.root,
            temporaryRoot: fixture.temporaryRoot,
            runCommand: () => OK,
          }),
        /bin values/,
      );
      buildPackageMain({
        root: fixture.root,
        temporaryRoot: fixture.temporaryRoot,
        runCommand: () => OK,
      });
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = previous;
      fs.rmSync(fixture.owned, { recursive: true, force: true });
    }
  });
});

function releaseFixture(
  prefix: string,
): Readonly<{ owned: string; root: string; temporaryRoot: string; tarball: string }> {
  const fixture = ownedRoot(prefix);
  writePackage(fixture.root, { version: '2.0.0', files: ['README.md', 'docs/'] });
  fs.mkdirSync(path.join(fixture.root, 'dist'));
  const tarball = path.join(fixture.root, 'dist', 'test.tgz');
  fs.writeFileSync(tarball, 'packed');
  fs.writeFileSync(path.join(fixture.root, 'dist', 'TARBALL.txt'), 'dist/test.tgz\n');
  return { ...fixture, tarball };
}

type ReleaseFailure =
  | 'none'
  | 'skill'
  | 'tar'
  | 'files'
  | 'file'
  | 'manifest'
  | 'manifest-fields'
  | 'entry'
  | 'forbidden'
  | 'remote-runner'
  | 'install'
  | 'version'
  | 'doctor'
  | 'home'
  | 'hook-command'
  | 'hook'
  | 'lint';
function releaseRunner(failure: ReleaseFailure = 'none'): ReleaseCommandRunner {
  return (command, args, options) => {
    if (command === 'tar' && args[0] === '-tzf') {
      if (failure === 'tar') return { ...OK, status: 2, stderr: 'tar failed' };
      if (failure === 'files') return result('package/README.md\n');
      if (failure === 'file') return result('package/docs/guide.md\n');
      return result('package/README.md\npackage/docs/guide.md\n');
    }
    if (command === 'tar') {
      if (failure === 'entry') return { ...OK, status: 2, stderr: 'entry failed' };
      const entry = args[2] ?? '';
      if (entry.endsWith('plugin.json'))
        return result(
          failure === 'manifest'
            ? '[]'
            : failure === 'manifest-fields'
              ? '{}'
              : JSON.stringify({
                  name: 'feynman',
                  version: '2.0.0',
                  skills: './skills/',
                  interface: { brandColor: '#2563EB' },
                }),
        );
      if (entry.endsWith('SKILL.md'))
        return result(
          failure === 'skill'
            ? 'missing link'
            : `See [settings](references/settings.md)${failure === 'forbidden' ? ' disable-model-invocation' : ''}`,
        );
      return result(
        failure === 'remote-runner'
          ? 'feynman state [status|on|off]\nnpx -y @albinocrabs/feynman state'
          : 'feynman state [status|on|off]',
      );
    }
    if (command === 'npm')
      return failure === 'install' ? { ...OK, status: 2, stderr: 'install failed' } : OK;
    if (args[0] === 'version') return result(failure === 'version' ? '1.0.0\n' : '2.0.0\n');
    if (args[0] === 'install') {
      const home = options.env['HOME'];
      if (home === undefined) throw new Error('HOME missing in install command');
      fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
      fs.writeFileSync(
        path.join(home, '.codex', 'hooks.json'),
        JSON.stringify({
          hooks: {
            SessionStart: [
              {
                hooks: [
                  {
                    command: `${failure === 'home' ? '/wrong/home' : path.join(home, '.codex')} feynman-session-start.js`,
                  },
                ],
              },
            ],
          },
        }),
      );
      return OK;
    }
    if (args[0] === 'doctor') return result(failure === 'doctor' ? 'Status: BAD' : 'Status: OK');
    if (args[0] === '--json')
      return result(failure === 'lint' ? '{"issues":[{}]}' : '{"issues":[]}');
    if (command.includes('feynman-session-start.js') && failure === 'hook-command')
      return { ...OK, status: 2, stderr: 'hook failed' };
    if (command.includes('feynman-session-start.js'))
      return result(failure === 'hook' ? 'empty' : '<triggers> →');
    return OK;
  };
}

describe('release smoke behavior', () => {
  it('validates the packed manifest, plugin, consumer commands, lint, and installed hook', () => {
    const fixture = releaseFixture('feynman-release-happy-');
    try {
      releaseSmoke({
        root: fixture.root,
        temporaryRoot: fixture.temporaryRoot,
        runCommand: releaseRunner(),
      });
      assert.deepEqual(fs.readdirSync(fixture.temporaryRoot), []);
    } finally {
      fs.rmSync(fixture.owned, { recursive: true, force: true });
    }
  });

  for (const [failure, expected] of [
    ['skill', /lacks its linked CLI settings reference/],
    ['tar', /tar failed/],
    ['files', /tarball missing files.*directory/],
    ['file', /tarball missing files.*entry/],
    ['manifest', /manifest must contain an object/],
    ['manifest-fields', /manifest is incomplete/],
    ['entry', /entry failed/],
    ['forbidden', /non-discoverable metadata/],
    ['remote-runner', /automatic remote runner/],
    ['install', /install failed/],
    ['version', /version mismatch/],
    ['doctor', /doctor smoke failed/],
    ['home', /missing expected FEYNMAN_HOME/],
    ['hook-command', /hook failed/],
    ['hook', /did not emit/],
    ['lint', /expected zero issues/],
  ] as const) {
    it(`rejects ${failure} release failure`, () => {
      const fixture = releaseFixture(`feynman-release-${failure}-`);
      try {
        assert.throws(() => {
          releaseSmoke({
            root: fixture.root,
            temporaryRoot: fixture.temporaryRoot,
            runCommand: releaseRunner(failure),
          });
        }, expected);
        assert.deepEqual(fs.readdirSync(fixture.temporaryRoot), []);
      } finally {
        fs.rmSync(fixture.owned, { recursive: true, force: true });
      }
    });
  }

  it('covers the main failure and real ENOENT adapter', () => {
    const fixture = ownedRoot('feynman-release-boundary-');
    writePackage(fixture.root, { version: '2.0.0', files: [] });
    const previous = process.exitCode;
    try {
      releaseSmokeMain({
        root: fixture.root,
        temporaryRoot: fixture.temporaryRoot,
        runCommand: releaseRunner(),
      });
      assert.equal(process.exitCode, 1);
      assert.match(
        runReleaseCommand('missing-feynman-command', [], { cwd: fixture.root, env: {} }).error
          ?.message ?? '',
        /ENOENT/,
      );
    } finally {
      process.exitCode = previous;
      fs.rmSync(fixture.owned, { recursive: true, force: true });
    }
  });
});

function publishedRunner(
  failure: 'none' | 'published-version' | 'install' | 'installed-version' | 'doctor',
): PublishedCommandRunner {
  return (command, args) => {
    if (command === 'npm' && args[0] === 'view')
      return result(failure === 'published-version' ? '9.9.9\n' : '3.0.0\n');
    if (command === 'npm') {
      if (failure === 'install') return { ...OK, status: 2, stderr: 'install failed' };
      const prefix = args[2];
      if (prefix === undefined) throw new Error('install prefix missing');
      const binDir = path.join(prefix, 'node_modules', '.bin');
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(
        path.join(binDir, process.platform === 'win32' ? 'feynman.cmd' : 'feynman'),
        'bin',
      );
      return OK;
    }
    if (args[0] === 'version')
      return result(failure === 'installed-version' ? '0.0.0\n' : '3.0.0\n');
    if (args[0] === 'doctor') return result(failure === 'doctor' ? 'Status: BAD' : 'Status: OK');
    return OK;
  };
}

describe('published package behavior', () => {
  it('verifies a complete published consumer flow and cleans its workdir', () => {
    const fixture = ownedRoot('feynman-published-happy-');
    writePackage(fixture.root, { name: '@test/feynman', version: '3.0.0' });
    try {
      verifyPublishedPackage({
        root: fixture.root,
        temporaryRoot: fixture.temporaryRoot,
        runCommand: publishedRunner('none'),
      });
      assert.deepEqual(fs.readdirSync(fixture.temporaryRoot), []);
    } finally {
      fs.rmSync(fixture.owned, { recursive: true, force: true });
    }
  });

  for (const [failure, expected] of [
    ['published-version', /published version mismatch/],
    ['install', /install failed/],
    ['installed-version', /installed package version mismatch/],
    ['doctor', /doctor check failed/],
  ] as const) {
    it(`propagates ${failure} failure and cleans its workdir`, () => {
      const fixture = ownedRoot(`feynman-published-${failure}-`);
      writePackage(fixture.root, { name: '@test/feynman', version: '3.0.0' });
      try {
        assert.throws(() => {
          verifyPublishedPackage({
            root: fixture.root,
            temporaryRoot: fixture.temporaryRoot,
            runCommand: publishedRunner(failure),
          });
        }, expected);
        assert.deepEqual(fs.readdirSync(fixture.temporaryRoot), []);
      } finally {
        fs.rmSync(fixture.owned, { recursive: true, force: true });
      }
    });
  }

  it('covers empty registry output, missing binary, main failure, and ENOENT', () => {
    const fixture = ownedRoot('feynman-published-boundaries-');
    writePackage(fixture.root, { name: '@test/feynman', version: '3.0.0' });
    const empty: PublishedCommandRunner = () => OK;
    const missingBin: PublishedCommandRunner = (command, args) =>
      command === 'npm' && args[0] === 'view' ? result('3.0.0') : OK;
    const previous = process.exitCode;
    try {
      assert.throws(() => {
        verifyPublishedPackage({
          root: fixture.root,
          temporaryRoot: fixture.temporaryRoot,
          runCommand: empty,
        });
      }, /empty npm view/);
      assert.throws(() => {
        verifyPublishedPackage({
          root: fixture.root,
          temporaryRoot: fixture.temporaryRoot,
          runCommand: missingBin,
        });
      }, /binary not found/);
      verifyPublishedPackageMain({
        root: fixture.root,
        temporaryRoot: fixture.temporaryRoot,
        runCommand: empty,
      });
      assert.equal(process.exitCode, 1);
      assert.match(
        runPublishedCommand('missing-feynman-command', [], { cwd: fixture.root, env: {} }).error
          ?.message ?? '',
        /ENOENT/,
      );
    } finally {
      process.exitCode = previous;
      fs.rmSync(fixture.owned, { recursive: true, force: true });
    }
  });
});
