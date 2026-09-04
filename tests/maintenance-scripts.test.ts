import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyHighlight,
  createHighlightEnvironment,
  executeHighlight,
  highlightExitCode,
  highlightMain,
  parseHighlightArguments,
  revertHighlight,
  runSystemTestCommand,
  type HighlightEnvironment,
} from '../scripts/feynman-highlight.ts';
import {
  bumpSemver,
  createBumpEnvironment,
  executeBump,
  bumpExitCode,
  bumpMain,
  parseBumpArguments,
  readManifestVersion,
  resolveTarget,
  runSystemCommand,
  updateManifestVersion,
  updatePackageLock,
  type BumpEnvironment,
  type BumpOptions,
  type CommandResult,
} from '../scripts/feynman-bump.ts';

const MARKER = '**bold** keys; ▲▼ priority; ✓✗ status.';

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-maintenance-'));
}

function noOpLog(_message: string): void {
  return undefined;
}

describe('feynman-highlight', () => {
  it('parses frozen arguments and applies and reverts every contract marker', () => {
    const argv = Object.freeze(['ignored', '--dry-run', '--revert', '--revert']);
    assert.deepEqual(parseHighlightArguments(argv), { dryRun: true, operation: 'revert' });
    assert.deepEqual(argv, ['ignored', '--dry-run', '--revert', '--revert']);

    const original = '<contract>one\n</contract>\n<contract>two\n</contract>\n';
    const applied = applyHighlight(original);
    assert.equal(applied.added, 2);
    assert.equal(
      applied.text.match(new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length,
      2,
    );
    assert.deepEqual(revertHighlight(applied.text), {
      text: original,
      added: -2,
      note: 'removed 2 marker lines',
    });
    assert.equal(applyHighlight(applied.text).text, applied.text);
  });

  it('restores the exact original bytes when post-write tests fail', () => {
    const root = tempRoot();
    const rulesPath = path.join(root, 'rules', 'feynman-contract.md');
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(rulesPath, '<contract>\noriginal ü\n</contract>\n');
    const before = fs.readFileSync(rulesPath);
    const environment: HighlightEnvironment = {
      root,
      readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
      writeFile: (filePath, contents) => {
        fs.writeFileSync(filePath, contents);
      },
      runTests: () => {
        throw new Error('simulated test failure');
      },
      log: noOpLog,
    };
    try {
      assert.throws(() => {
        executeHighlight({ dryRun: false, operation: 'apply' }, environment);
      }, /simulated test failure/);
      assert.deepEqual(fs.readFileSync(rulesPath), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports restoration failure and keeps dry-run write-free', () => {
    const writes: string[] = [];
    const failingRestore: HighlightEnvironment = {
      root: '/tmp/highlight-test',
      readFile: () => '<contract>\ntext\n</contract>\n',
      writeFile: (_filePath, contents) => {
        writes.push(contents);
        if (writes.length === 2) throw new Error('disk unavailable');
      },
      runTests: () => {
        throw new Error('tests failed');
      },
      log: noOpLog,
    };
    assert.throws(() => {
      executeHighlight({ dryRun: false, operation: 'apply' }, failingRestore);
    }, /tests failed; failed to restore .*disk unavailable/);

    const dryRun = { ...failingRestore, writeFile: () => assert.fail('dry-run wrote a file') };
    assert.equal(highlightExitCode(['--dry-run'], dryRun), 0);
  });

  it('handles unchanged, successful and over-budget boundaries', () => {
    const logs: string[] = [];
    const unchanged: HighlightEnvironment = {
      root: '/tmp/highlight-test',
      readFile: () => `<contract>\n${MARKER}\n</contract>\n`,
      writeFile: () => assert.fail('unchanged content was written'),
      runTests: () => assert.fail('tests ran for unchanged content'),
      log: (message) => {
        logs.push(message);
      },
    };
    executeHighlight({ dryRun: false, operation: 'apply' }, unchanged);
    assert.ok(logs.includes('no changes needed'));

    let testsRan = false;
    executeHighlight(
      { dryRun: false, operation: 'apply' },
      {
        ...unchanged,
        readFile: () => '<contract>\ntext\n</contract>\n',
        writeFile: noOpLog,
        runTests: () => {
          testsRan = true;
        },
      },
    );
    assert.equal(testsRan, true);
    assert.throws(() => {
      executeHighlight(
        { dryRun: false, operation: 'apply' },
        { ...unchanged, readFile: () => 'x'.repeat(4481) },
      );
    }, /exceeds budget/);
  });

  it('uses the filesystem adapter with an injected test runner and reports main failures', () => {
    const root = tempRoot();
    const rulesPath = path.join(root, 'rules', 'feynman-contract.md');
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(rulesPath, '<contract>\ntext\n</contract>\n');
    const logMock = mock.method(console, 'log', () => undefined);
    const errorMock = mock.method(console, 'error', () => undefined);
    try {
      executeHighlight(
        { dryRun: false, operation: 'apply' },
        createHighlightEnvironment(root, () => commandResult()),
      );
      assert.match(fs.readFileSync(rulesPath, 'utf8'), /\*\*bold\*\*/);
      fs.writeFileSync(rulesPath, '<contract>\ntext\n</contract>\n');
      assert.throws(() => {
        executeHighlight(
          { dryRun: false, operation: 'apply' },
          createHighlightEnvironment(root, () => ({
            ...commandResult(),
            error: new Error('npm executable missing'),
          })),
        );
      }, /npm executable missing/);
      assert.equal(fs.readFileSync(rulesPath, 'utf8'), '<contract>\ntext\n</contract>\n');
      assert.throws(() => {
        executeHighlight(
          { dryRun: false, operation: 'apply' },
          createHighlightEnvironment(root, () => ({
            ...commandResult(),
            signal: 'SIGTERM',
          })),
        );
      }, /terminated by signal SIGTERM/);
      assert.equal(fs.readFileSync(rulesPath, 'utf8'), '<contract>\ntext\n</contract>\n');
      assert.equal(
        highlightExitCode([], {
          ...createHighlightEnvironment(root, () => commandResult()),
          readFile: () => {
            throw new Error('read failed');
          },
        }),
        1,
      );
      const previousExitCode = process.exitCode;
      try {
        highlightMain(['--dry-run'], {
          ...createHighlightEnvironment(root, () => commandResult()),
          readFile: () => `<contract>\n${MARKER}\n</contract>\n`,
        });
        assert.equal(process.exitCode, 0);
      } finally {
        process.exitCode = previousExitCode;
      }
    } finally {
      logMock.mock.restore();
      errorMock.mock.restore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves a real missing test-command error at the spawn boundary', () => {
    const result = runSystemTestCommand(
      'feynman-test-command-that-does-not-exist',
      [],
      process.cwd(),
    );
    assert.equal(result.status, null);
    assert.ok(result.error instanceof Error);
    assert.equal(result.signal, null);
  });
});

function commandResult(stdout = ''): CommandResult {
  return { status: 0, stdout, stderr: '', error: undefined, signal: null };
}

function writeBumpFixtures(root: string): void {
  fs.mkdirSync(path.join(root, 'plugins', 'feynman', '.codex-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"feynman","version":"1.2.3"}\n');
  fs.writeFileSync(
    path.join(root, 'plugins', 'feynman', '.codex-plugin', 'plugin.json'),
    '{"name":"feynman","version":"1.2.3","foreign":true}\n',
  );
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    '{"name":"feynman","version":"1.2.3","packages":{"":{"version":"1.2.3","x":1}},"foreign":true}\n',
  );
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\noriginal\n');
}

function bumpEnvironment(root: string, commands: string[]): BumpEnvironment {
  return {
    readFile: (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8'),
    writeFile: (relativePath, contents) => {
      fs.writeFileSync(path.join(root, relativePath), contents);
    },
    run: (command, args) => {
      const invocation = [command, ...args].join(' ');
      commands.push(invocation);
      if (invocation === 'git rev-parse --abbrev-ref HEAD') return commandResult('main\n');
      if (invocation === 'git rev-parse --short HEAD') return commandResult('abc123\n');
      if (invocation === 'npm run --silent changelog') return commandResult('generated\n');
      return commandResult();
    },
    log: noOpLog,
    writeError: noOpLog,
  };
}

const RELEASE_OPTIONS: BumpOptions = {
  kind: 'run',
  versionRequest: 'minor',
  dryRun: false,
  commit: true,
  tag: true,
  push: true,
};

const RELEASE_PATHS = [
  'package.json',
  'plugins/feynman/.codex-plugin/plugin.json',
  'package-lock.json',
  'CHANGELOG.md',
] as const;

function releaseBytes(root: string): Map<string, Buffer> {
  return new Map(
    RELEASE_PATHS.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(root, relativePath)),
    ]),
  );
}

function assertReleaseBytes(root: string, expected: ReadonlyMap<string, Buffer>): void {
  RELEASE_PATHS.forEach((relativePath) => {
    assert.deepEqual(fs.readFileSync(path.join(root, relativePath)), expected.get(relativePath));
  });
}

describe('feynman-bump', () => {
  it('parses immutable options and enforces explicit action dependencies', () => {
    const argv = Object.freeze(['patch', 'ignored', '--commit', '--commit']);
    assert.deepEqual(parseBumpArguments(argv), {
      kind: 'run',
      versionRequest: 'patch',
      dryRun: false,
      commit: true,
      tag: false,
      push: false,
    });
    assert.deepEqual(argv, ['patch', 'ignored', '--commit', '--commit']);
    assert.equal(parseBumpArguments(['patch', '--tag']).kind, 'error');
    assert.equal(parseBumpArguments(['patch', '--dry-run', '--commit']).kind, 'error');
    assert.equal(parseBumpArguments(['patch', '--unknown']).kind, 'error');
    assert.equal(bumpExitCode(['--push']), 2);
  });

  it('resolves patch, minor, major and explicit versions without mutable segments', () => {
    assert.equal(bumpSemver('1.2.3', 'patch'), '1.2.4');
    assert.equal(bumpSemver('1.2.3', 'minor'), '1.3.0');
    assert.equal(bumpSemver('1.2.3', 'major'), '2.0.0');
    assert.equal(resolveTarget('4.5.6', '1.2.3'), '4.5.6');
    assert.throws(() => bumpSemver('v1', 'patch'), /unparseable version/);
    assert.throws(() => resolveTarget('next', '1.2.3'), /bad version arg/);
  });

  it('immutably updates package-lock root versions and preserves foreign data', () => {
    const updated = updatePackageLock(
      '{"version":"1.0.0","packages":{"":{"version":"1.0.0","foreign":7},"x":{"value":2}},"foreign":true}',
      '2.0.0',
    );
    const parsed: unknown = JSON.parse(updated);
    assert.deepEqual(parsed, {
      version: '2.0.0',
      packages: { '': { version: '2.0.0', foreign: 7 }, x: { value: 2 } },
      foreign: true,
    });
    assert.throws(() => updatePackageLock('{"version":"1.0.0"}', '2.0.0'), /root package/);
    assert.throws(
      () => updatePackageLock('{"version":"1.0.0","packages":{"":{}}}', '2.0.0'),
      /root package/,
    );
    assert.equal(
      updateManifestVersion('{"version":"1.0.0","foreign":true}', '2.0.0', 'x.json'),
      '{"version": "2.0.0","foreign":true}',
    );
    assert.throws(() => updateManifestVersion('{}', '2.0.0', 'x.json'), /no version field/);
    assert.throws(() => readManifestVersion('{}', 'x.json'), /Invalid version manifest/);
  });

  it('runs only explicitly requested release actions through the injected runner', () => {
    const root = tempRoot();
    const commands: string[] = [];
    try {
      writeBumpFixtures(root);
      executeBump(RELEASE_OPTIONS, bumpEnvironment(root, commands));
      assert.equal(
        readManifestVersion(
          fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
          'package.json',
        ),
        '1.3.0',
      );
      assert.deepEqual(commands, [
        'git status --porcelain',
        'git rev-parse --abbrev-ref HEAD',
        'npm run --silent changelog',
        'npm run --silent ci',
        'git add package.json plugins/feynman/.codex-plugin/plugin.json package-lock.json CHANGELOG.md',
        'git commit -m chore(release): v1.3.0',
        'git rev-parse --short HEAD',
        'git tag -a v1.3.0 -m v1.3.0',
        'git push origin main',
        'git push origin v1.3.0',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('stops on preflight failure before reading or writing manifests', () => {
    const environment: BumpEnvironment = {
      readFile: () => assert.fail('read after failed preflight'),
      writeFile: () => assert.fail('write after failed preflight'),
      run: () => commandResult(' M package.json\n'),
      log: noOpLog,
      writeError: noOpLog,
    };
    assert.throws(() => {
      executeBump({ ...RELEASE_OPTIONS, commit: false, tag: false, push: false }, environment);
    }, /working tree dirty/);
  });

  it('keeps dry-run write-free and rejects non-main release actions', () => {
    const root = tempRoot();
    try {
      writeBumpFixtures(root);
      const commands: string[] = [];
      executeBump(
        { ...RELEASE_OPTIONS, dryRun: true, commit: false, tag: false, push: false },
        bumpEnvironment(root, commands),
      );
      assert.deepEqual(commands, ['git status --porcelain']);
      assert.equal(
        readManifestVersion(
          fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
          'package.json',
        ),
        '1.2.3',
      );

      const nonMain = {
        ...bumpEnvironment(root, []),
        run: (_command: string, args: readonly string[]) =>
          args.includes('--abbrev-ref') ? commandResult('feature\n') : commandResult(),
      };
      assert.throws(() => {
        executeBump(RELEASE_OPTIONS, nonMain);
      }, /not on main/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('surfaces runner and release-gate failures with diagnostics', () => {
    const errors: string[] = [];
    const failedGit: BumpEnvironment = {
      readFile: () => assert.fail('read after git failure'),
      writeFile: () => assert.fail('write after git failure'),
      run: () => ({
        status: 0,
        stdout: 'git output',
        stderr: 'git error',
        error: new Error('spawn failed'),
        signal: null,
      }),
      log: noOpLog,
      writeError: (message) => {
        errors.push(message);
      },
    };
    assert.throws(() => {
      executeBump({ ...RELEASE_OPTIONS, commit: false, tag: false, push: false }, failedGit);
    }, /spawn failed/);
    assert.deepEqual(errors, ['git error']);

    const root = tempRoot();
    try {
      writeBumpFixtures(root);
      const before = releaseBytes(root);
      const failedGate: BumpEnvironment = {
        ...bumpEnvironment(root, []),
        run: (command: string, args: readonly string[]) => {
          if (command === 'npm' && args.at(-1) === 'changelog') {
            fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# generated\n');
          }
          return command === 'npm' && args.at(-1) === 'ci'
            ? {
                status: 0,
                stdout: 'ci failed',
                stderr: '',
                error: undefined,
                signal: 'SIGABRT',
              }
            : commandResult();
        },
        writeError: (message: string) => {
          errors.push(message);
        },
      };
      assert.throws(() => {
        executeBump({ ...RELEASE_OPTIONS, commit: false, tag: false, push: false }, failedGate);
      }, /full CI failed.*terminated by signal SIGABRT/);
      assert.equal(errors.at(-1), 'ci failed');
      assertReleaseBytes(root, before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('restores every release file when changelog generation fails after mutating it', () => {
    const root = tempRoot();
    try {
      writeBumpFixtures(root);
      const before = releaseBytes(root);
      const commands: string[] = [];
      const base = bumpEnvironment(root, commands);
      const environment: BumpEnvironment = {
        ...base,
        run: (command, args) => {
          const result = base.run(command, args);
          if (command === 'npm' && args.at(-1) === 'changelog') {
            fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# partial generated changelog\n');
            return { ...commandResult(), status: 1, stderr: 'changelog failed' };
          }
          return result;
        },
      };
      assert.throws(() => {
        executeBump({ ...RELEASE_OPTIONS, commit: false, tag: false, push: false }, environment);
      }, /npm run changelog failed \(exit 1\)/);
      assertReleaseBytes(root, before);
      assert.deepEqual(commands, ['git status --porcelain', 'npm run --silent changelog']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('validates every planned transform before the first release write', () => {
    const root = tempRoot();
    try {
      writeBumpFixtures(root);
      fs.writeFileSync(path.join(root, 'package-lock.json'), '{"version":"1.2.3"}\n');
      const before = releaseBytes(root);
      const writes: string[] = [];
      const base = bumpEnvironment(root, []);
      assert.throws(() => {
        executeBump(
          { ...RELEASE_OPTIONS, commit: false, tag: false, push: false },
          {
            ...base,
            writeFile: (relativePath, contents) => {
              writes.push(relativePath);
              base.writeFile(relativePath, contents);
            },
          },
        );
      }, /package-lock.json does not have a root package version/);
      assert.deepEqual(writes, []);
      assertReleaseBytes(root, before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('restores exact bytes after a preparation write partially succeeds and throws', () => {
    const root = tempRoot();
    try {
      writeBumpFixtures(root);
      const before = releaseBytes(root);
      const base = bumpEnvironment(root, []);
      let failOnce = true;
      assert.throws(() => {
        executeBump(
          { ...RELEASE_OPTIONS, commit: false, tag: false, push: false },
          {
            ...base,
            writeFile: (relativePath, contents) => {
              base.writeFile(relativePath, contents);
              if (relativePath.endsWith('plugin.json') && failOnce) {
                failOnce = false;
                throw new Error('simulated partial write');
              }
            },
          },
        );
      }, /simulated partial write/);
      assertReleaseBytes(root, before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('continues restoring all snapshots and reports restoration failures', () => {
    const root = tempRoot();
    try {
      writeBumpFixtures(root);
      const base = bumpEnvironment(root, []);
      const writes: string[] = [];
      const counts = new Map<string, number>();
      assert.throws(() => {
        executeBump(
          { ...RELEASE_OPTIONS, commit: false, tag: false, push: false },
          {
            ...base,
            writeFile: (relativePath, contents) => {
              writes.push(relativePath);
              const count = (counts.get(relativePath) ?? 0) + 1;
              counts.set(relativePath, count);
              if (relativePath === 'package-lock.json' && count === 1) {
                throw new Error('preparation write failed');
              }
              if (relativePath.endsWith('plugin.json') && count === 2) {
                throw new Error('restore denied');
              }
              base.writeFile(relativePath, contents);
            },
          },
        );
      }, /preparation write failed; restoration failures: .*plugin\.json: restore denied/);
      assert.deepEqual(writes.slice(-RELEASE_PATHS.length), RELEASE_PATHS);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves real spawn errors and treats a signal as failure even with status zero', () => {
    const missing = runSystemCommand('feynman-command-that-does-not-exist', [], process.cwd());
    assert.equal(missing.status, null);
    assert.ok(missing.error instanceof Error);

    const signaled: BumpEnvironment = {
      readFile: () => assert.fail('read after signaled preflight'),
      writeFile: () => assert.fail('write after signaled preflight'),
      run: () => ({
        status: 0,
        stdout: '',
        stderr: '',
        error: undefined,
        signal: 'SIGTERM',
      }),
      log: noOpLog,
      writeError: noOpLog,
    };
    assert.throws(() => {
      executeBump({ ...RELEASE_OPTIONS, commit: false, tag: false, push: false }, signaled);
    }, /terminated by signal SIGTERM/);
  });

  it('uses the filesystem adapter with an injected runner and reports main failures', () => {
    const root = tempRoot();
    const logMock = mock.method(console, 'log', () => undefined);
    const errorMock = mock.method(console, 'error', () => undefined);
    try {
      writeBumpFixtures(root);
      const environment = createBumpEnvironment(root, () => commandResult());
      executeBump(
        { ...RELEASE_OPTIONS, dryRun: true, commit: false, tag: false, push: false },
        environment,
      );
      environment.writeFile('scratch', 'value');
      assert.equal(environment.readFile('scratch'), 'value');
      assert.equal(
        bumpExitCode(['patch'], {
          ...environment,
          run: () => commandResult(' M package.json\n'),
        }),
        1,
      );
      const previousExitCode = process.exitCode;
      try {
        bumpMain(['--push'], environment);
        assert.equal(process.exitCode, 2);
      } finally {
        process.exitCode = previousExitCode;
      }
    } finally {
      logMock.mock.restore();
      errorMock.mock.restore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
