import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

import { buildPackage, runCommand, type CommandRunner } from '../scripts/build-package.ts';
import { releaseSmoke, type ReleaseCommandRunner } from '../scripts/release-smoke.ts';
import {
  verifyPublishedPackage,
  type PublishedCommandRunner,
} from '../scripts/verify-published-package.ts';

function temporaryDirectory(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function caughtError(action: () => void): unknown {
  try {
    action();
    return undefined;
  } catch (error) {
    return error;
  }
}

function withFailedTemporaryCleanup(temporaryRoot: string, action: () => void): unknown {
  const originalRmSync = fs.rmSync;
  const cleanupFailure = new Error('temporary cleanup failure');
  const mockedRmSync: typeof fs.rmSync = (target, options) => {
    const resolved = path.resolve(target.toString());
    if (resolved.startsWith(`${temporaryRoot}${path.sep}`)) throw cleanupFailure;
    originalRmSync(target, options);
  };
  try {
    Object.defineProperty(fs, 'rmSync', { configurable: true, value: mockedRmSync });
    return caughtError(action);
  } finally {
    Object.defineProperty(fs, 'rmSync', { configurable: true, value: originalRmSync });
  }
}

function assertPrimaryAndCleanup(
  failure: unknown,
  primaryPattern: RegExp,
): asserts failure is AggregateError {
  assert.ok(failure instanceof AggregateError);
  assert.match(failure.message, /cleanup also failed/);
  const errors: unknown = failure.errors;
  assert.ok(Array.isArray(errors));
  const primary: unknown = errors[0];
  const cleanup: unknown = errors[1];
  assert.ok(primary instanceof Error);
  assert.ok(cleanup instanceof Error);
  assert.equal(failure.cause, primary);
  assert.match(primary.message, primaryPattern);
  assert.equal(cleanup.message, 'temporary cleanup failure');
}

describe('packaging failure cleanup', () => {
  it('removes build and staging directories after an intermediate manifest read failure', () => {
    const owned = temporaryDirectory('feynman-build-failure-test-');
    const root = path.join(owned, 'repository');
    const temporaryRoot = path.join(owned, 'temporary');
    fs.mkdirSync(path.join(root, '.build', 'lib'), { recursive: true });
    fs.mkdirSync(temporaryRoot, { recursive: true });
    fs.writeFileSync(path.join(root, '.build', 'lib', 'index.js'), 'export {};\n');
    const successfulCompile: CommandRunner = () => ({
      status: 0,
      signal: null,
      stdout: '',
      stderr: '',
      error: undefined,
    });

    try {
      assert.throws(
        () => buildPackage({ root, temporaryRoot, runCommand: successfulCompile }),
        /package\.json/,
      );
      assert.equal(fs.existsSync(path.join(root, '.build')), false);
      assert.deepEqual(fs.readdirSync(temporaryRoot), []);
    } finally {
      fs.rmSync(owned, { recursive: true, force: true });
    }
  });

  it('preserves an unavailable command error and cleans both build directories', () => {
    const owned = temporaryDirectory('feynman-unavailable-command-test-');
    const root = path.join(owned, 'repository');
    const temporaryRoot = path.join(owned, 'temporary');
    fs.mkdirSync(path.join(root, '.build'), { recursive: true });
    fs.mkdirSync(temporaryRoot, { recursive: true });
    const unavailable: CommandRunner = (_command, _args, options) =>
      runCommand('feynman-command-that-does-not-exist', [], options);

    try {
      assert.throws(
        () => buildPackage({ root, temporaryRoot, runCommand: unavailable }),
        /spawnSync feynman-command-that-does-not-exist ENOENT/,
      );
      assert.equal(fs.existsSync(path.join(root, '.build')), false);
      assert.deepEqual(fs.readdirSync(temporaryRoot), []);
    } finally {
      fs.rmSync(owned, { recursive: true, force: true });
    }
  });

  it('attempts both cleanups and preserves the command failure when staging cleanup fails', () => {
    const owned = temporaryDirectory('feynman-cleanup-aggregation-test-');
    const root = path.join(owned, 'repository');
    const temporaryRoot = path.join(owned, 'temporary');
    const buildDir = path.join(root, '.build');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(temporaryRoot, { recursive: true });
    const originalRmSync = fs.rmSync;
    const cleanupAttempts: string[] = [];
    const failedCommand: CommandRunner = () => ({
      status: 9,
      signal: null,
      stdout: '',
      stderr: 'compiler primary failure',
      error: undefined,
    });
    const cleanupFailure = new Error('staging cleanup failure');
    const mockedRmSync: typeof fs.rmSync = (target, options) => {
      const resolved = path.resolve(target.toString());
      if (resolved.startsWith(`${temporaryRoot}${path.sep}`)) {
        cleanupAttempts.push('staging');
        throw cleanupFailure;
      }
      if (resolved === buildDir) cleanupAttempts.push('build');
      originalRmSync(target, options);
    };

    let failure: unknown;
    try {
      Object.defineProperty(fs, 'rmSync', { configurable: true, value: mockedRmSync });
      failure = caughtError(() => {
        buildPackage({ root, temporaryRoot, runCommand: failedCommand });
      });
    } finally {
      Object.defineProperty(fs, 'rmSync', { configurable: true, value: originalRmSync });
    }

    try {
      assert.ok(failure instanceof AggregateError);
      assert.match(failure.message, /command failed: npx.*cleanup also failed/s);
      const aggregateErrors: unknown = failure.errors;
      assert.ok(Array.isArray(aggregateErrors));
      const primary: unknown = aggregateErrors[0];
      const cleanup: unknown = aggregateErrors[1];
      assert.ok(primary instanceof Error);
      assert.equal(failure.cause, primary);
      assert.match(primary.message, /compiler primary failure/);
      assert.equal(cleanup, cleanupFailure);
      assert.deepEqual(cleanupAttempts, ['build', 'staging', 'build']);
      assert.equal(fs.existsSync(buildDir), false);
    } finally {
      originalRmSync(owned, { recursive: true, force: true });
    }
  });

  it('propagates child diagnostics, exits nonzero, and removes the published-package workdir', () => {
    const owned = temporaryDirectory('feynman-published-failure-test-');
    const root = path.join(owned, 'repository');
    const temporaryRoot = path.join(owned, 'temporary');
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(temporaryRoot, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: '@test/feynman', version: '1.2.3' }),
    );
    const moduleUrl = new URL('../scripts/verify-published-package.ts', import.meta.url).href;
    const source = [
      `import { verifyPublishedPackageMain } from ${JSON.stringify(moduleUrl)};`,
      `verifyPublishedPackageMain({`,
      `  root: ${JSON.stringify(root)},`,
      `  temporaryRoot: ${JSON.stringify(temporaryRoot)},`,
      `  runCommand: () => ({ status: 17, signal: null, stdout: '', stderr: 'registry unavailable', error: undefined }),`,
      `});`,
    ].join('\n');

    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /registry unavailable/);
      assert.match(result.stderr, /command failed: npm view @test\/feynman@1\.2\.3 version/);
      assert.deepEqual(fs.readdirSync(temporaryRoot), []);
    } finally {
      fs.rmSync(owned, { recursive: true, force: true });
    }
  });

  it('preserves registry and cleanup failures together', () => {
    const owned = temporaryDirectory('feynman-published-double-failure-');
    const root = path.join(owned, 'repository');
    const temporaryRoot = path.join(owned, 'temporary');
    fs.mkdirSync(root);
    fs.mkdirSync(temporaryRoot);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: '@test/feynman', version: '1.2.3' }),
    );
    const registryFailure: PublishedCommandRunner = () => ({
      status: 2,
      signal: null,
      stdout: '',
      stderr: 'registry primary failure',
      error: undefined,
    });
    try {
      const failure = withFailedTemporaryCleanup(temporaryRoot, () => {
        verifyPublishedPackage({ root, temporaryRoot, runCommand: registryFailure });
      });
      assertPrimaryAndCleanup(failure, /registry primary failure/);
    } finally {
      fs.rmSync(owned, { recursive: true, force: true });
    }
  });

  it('preserves release consumer and cleanup failures together', () => {
    const owned = temporaryDirectory('feynman-release-double-failure-');
    const root = path.join(owned, 'repository');
    const temporaryRoot = path.join(owned, 'temporary');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.mkdirSync(temporaryRoot);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ version: '1.2.3', files: [] }),
    );
    fs.writeFileSync(path.join(root, 'dist', 'package.tgz'), 'packed');
    fs.writeFileSync(path.join(root, 'dist', 'TARBALL.txt'), 'dist/package.tgz\n');
    const consumerFailure: ReleaseCommandRunner = (command, args) => {
      if (command === 'tar' && args[0] === '-tzf')
        return { status: 0, signal: null, stdout: '', stderr: '', error: undefined };
      if (command === 'tar') {
        const entry = args[2] ?? '';
        const stdout = entry.endsWith('plugin.json')
          ? JSON.stringify({
              name: 'feynman',
              version: '1.2.3',
              skills: './skills/',
              interface: { brandColor: '#2563EB' },
            })
          : entry.endsWith('SKILL.md')
            ? 'See [settings](references/settings.md)'
            : 'feynman state [status|on|off]';
        return { status: 0, signal: null, stdout, stderr: '', error: undefined };
      }
      return {
        status: 2,
        signal: null,
        stdout: '',
        stderr: 'consumer primary failure',
        error: undefined,
      };
    };
    try {
      const failure = withFailedTemporaryCleanup(temporaryRoot, () => {
        releaseSmoke({ root, temporaryRoot, runCommand: consumerFailure });
      });
      assertPrimaryAndCleanup(failure, /consumer primary failure/);
    } finally {
      fs.rmSync(owned, { recursive: true, force: true });
    }
  });
});
