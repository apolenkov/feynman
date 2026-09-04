import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  checkReproducibility,
  runReproducibilityCommand,
  type ReproducibilityCommandResult,
  type ReproducibilityRunner,
} from '../scripts/check-reproducibility.ts';

interface Fixture {
  readonly root: string;
  readonly dispose: () => void;
}

function fixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-repro-test-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'source.txt'), 'stable');
  fs.writeFileSync(path.join(root, 'scripts/build-package.ts'), 'synthetic');
  return {
    root,
    dispose: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

const result = (status = 0, stderr = ''): ReproducibilityCommandResult => ({
  status,
  signal: null,
  stdout: '',
  stderr,
});

function runner(build: (attempt: number) => ReproducibilityCommandResult): ReproducibilityRunner {
  let attempt = 0;
  return (command) => {
    if (command === 'git') return { ...result(), stdout: 'source.txt\0scripts/build-package.ts\0' };
    attempt++;
    return build(attempt);
  };
}

function retain(root: string, bytes: string, pointer = 'dist/package.tgz'): void {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/TARBALL.txt'), `${pointer}\n`);
  if (pointer === 'dist/package.tgz') fs.writeFileSync(path.join(root, pointer), bytes);
}

describe('reproducibility check', () => {
  it('real command adapter inherits omitted env and preserves ENOENT details', () => {
    const inherited = runReproducibilityCommand(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.PATH ?? "")'],
      { cwd: process.cwd() },
    );
    assert.equal(inherited.status, 0);
    assert.equal(inherited.stdout, process.env['PATH'] ?? '');
    const unavailable = runReproducibilityCommand('feynman-command-that-does-not-exist', [], {
      cwd: process.cwd(),
    });
    assert.equal(unavailable.status, null);
    assert.equal(unavailable.stdout, '');
    assert.equal(unavailable.stderr, '');
    assert.ok(unavailable.error instanceof Error);
  });

  it('preserves the real git diagnostic outside a repository', () => {
    const fx = fixture();
    try {
      assert.throws(
        () => checkReproducibility({ root: fx.root }),
        /Cannot enumerate repository source inputs:[\s\S]*not a git repository/i,
      );
    } finally {
      fx.dispose();
    }
  });

  it('preserves a signal-only source enumeration failure', () => {
    const fx = fixture();
    const signalled: ReproducibilityRunner = () => ({
      status: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
    });
    try {
      assert.throws(
        () => checkReproducibility({ root: fx.root, runCommand: signalled }),
        /Cannot enumerate repository source inputs:\nterminated by signal: SIGTERM/,
      );
    } finally {
      fx.dispose();
    }
  });

  it('accepts two byte-identical simulated builds and retains the tested package', () => {
    const fx = fixture();
    try {
      const output = checkReproducibility({
        root: fx.root,
        runCommand: runner(() => {
          retain(fx.root, 'same');
          return result();
        }),
      });
      assert.match(output, /^reproducible dist\/package\.tgz SHA256 /);
      assert.equal(fs.readFileSync(path.join(fx.root, 'dist/package.tgz'), 'utf8'), 'same');
    } finally {
      fx.dispose();
    }
  });

  it('detects source drift after the first build', () => {
    const fx = fixture();
    try {
      assert.throws(
        () =>
          checkReproducibility({
            root: fx.root,
            runCommand: runner(() => {
              retain(fx.root, 'same');
              fs.writeFileSync(path.join(fx.root, 'source.txt'), 'drift');
              return result();
            }),
          }),
        /source or lockfile changed during the first build/,
      );
    } finally {
      fx.dispose();
    }
  });

  it('preserves child-process failure diagnostics', () => {
    const fx = fixture();
    try {
      assert.throws(
        () =>
          checkReproducibility({
            root: fx.root,
            runCommand: runner(() => result(9, 'compiler failed')),
          }),
        /first build failed \(exit 9\):\ncompiler failed/,
      );
    } finally {
      fx.dispose();
    }
  });

  it('rejects a tarball pointer that escapes dist', () => {
    const fx = fixture();
    try {
      assert.throws(
        () =>
          checkReproducibility({
            root: fx.root,
            runCommand: runner(() => {
              retain(fx.root, 'unused', 'outside.tgz');
              return result();
            }),
          }),
        /points outside dist/,
      );
    } finally {
      fx.dispose();
    }
  });

  it('rejects unequal bytes from isolated simulated builds', () => {
    const fx = fixture();
    try {
      assert.throws(
        () =>
          checkReproducibility({
            root: fx.root,
            runCommand: runner((attempt) => {
              retain(fx.root, attempt === 1 ? 'first' : 'second');
              return result();
            }),
          }),
        /package bytes differ/,
      );
    } finally {
      fx.dispose();
    }
  });
});
