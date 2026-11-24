import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cmdExamples } from '../bin/commands/examples.ts';
import { cmdBootstrap } from '../bin/commands/bootstrap.ts';
import { cmdLint } from '../bin/commands/lint.ts';
import { main as feynmanMain } from '../bin/feynman.ts';
import { main as lintMain } from '../bin/feynman-lint.ts';

class ExitSignal extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

function invoke(
  fn: (args: string[]) => void,
  args: string[],
): { code: number; out: string; err: string } {
  const output: string[] = [];
  const errors: string[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    throw new ExitSignal(code ?? 0);
  });
  const logMock = mock.method(console, 'log', (...values: unknown[]) =>
    output.push(values.join(' ')),
  );
  const errorMock = mock.method(console, 'error', (...values: unknown[]) =>
    errors.push(values.join(' ')),
  );
  try {
    fn(args);
  } catch (error) {
    if (!(error instanceof ExitSignal)) throw error;
    return { code: error.code, out: output.join('\n'), err: errors.join('\n') };
  } finally {
    exitMock.mock.restore();
    logMock.mock.restore();
    errorMock.mock.restore();
  }
  return { code: 0, out: output.join('\n'), err: errors.join('\n') };
}

function invokeLint(args: string[]): { code: number; out: string; err: string } {
  const previousExitCode = process.exitCode;
  const output: string[] = [];
  const errors: string[] = [];
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    throw new ExitSignal(code ?? 0);
  });
  const stdoutMock = mock.method(process.stdout, 'write', (chunk: unknown) => {
    output.push(String(chunk));
    return true;
  });
  const stderrMock = mock.method(process.stderr, 'write', (chunk: unknown) => {
    errors.push(String(chunk));
    return true;
  });
  try {
    lintMain(args);
    return { code: Number(process.exitCode ?? 0), out: output.join(''), err: errors.join('') };
  } catch (error) {
    if (error instanceof ExitSignal)
      return { code: error.code, out: output.join(''), err: errors.join('') };
    throw error;
  } finally {
    process.exitCode = previousExitCode;
    exitMock.mock.restore();
    stdoutMock.mock.restore();
    stderrMock.mock.restore();
  }
}

describe('command modules', { concurrency: false }, () => {
  it('covers examples listing, selection, preview, help, and validation', () => {
    const listed = invoke(cmdExamples, []);
    assert.equal(listed.code, 0);
    assert.match(listed.out, /Available examples:/);
    assert.match(listed.out, /feature-planning/);
    assert.match(invoke(cmdExamples, ['--help']).out, /feynman examples/);
    assert.match(invoke(cmdExamples, ['--name', 'feature-planning']).out, /Feature Planning/);
    assert.match(invoke(cmdExamples, ['--random']).out, /Preview:/);
    assert.equal(invoke(cmdExamples, ['--name']).code, 2);
    assert.equal(invoke(cmdExamples, ['--name', 'feature-planning', '--random']).code, 2);
    assert.equal(invoke(cmdExamples, ['--name', 'missing']).code, 2);
    assert.equal(invoke(cmdExamples, ['--unknown']).code, 2);
    assert.equal(invoke(cmdExamples, ['unexpected']).code, 2);
  });

  it('documents and prints a 26-line random preview and a full named example', (t) => {
    const exampleDir = path.resolve(import.meta.dirname, '..', 'examples');
    const files = fs
      .readdirSync(exampleDir)
      .filter((name) => name.endsWith('.md'))
      .toSorted();
    const filename = 'activity-flow.md';
    const index = files.indexOf(filename);
    assert.ok(index >= 0);
    const content = fs.readFileSync(path.join(exampleDir, filename), 'utf8');
    const lines = content.split('\n');
    assert.ok(lines.length > 26);
    t.mock.method(Math, 'random', () => (index + 0.5) / files.length);

    const preview = invoke(cmdExamples, ['--random']);
    assert.equal(preview.code, 0);
    assert.match(preview.out, /\[activity-flow\]/);
    assert.equal(preview.out.split('Preview:\n\n')[1], lines.slice(0, 26).join('\n'));
    const named = invoke(cmdExamples, ['--name', 'activity-flow']);
    assert.equal(named.code, 0);
    assert.ok(named.out.endsWith(`\n\n${content}`));

    const help = invoke(cmdExamples, ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /--random\s+Preview .*26 lines/);
    assert.match(help.out, /--name <fileBase>\s+# print the full example/);
  });

  it('covers bootstrap help, export, idempotence, force, and argument errors', () => {
    const cwd = process.cwd();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bootstrap-'));
    try {
      process.chdir(home);
      assert.match(invoke(cmdBootstrap, ['--help']).out, /feynman bootstrap/);
      const out = path.join(home, 'out');
      assert.equal(invoke(cmdBootstrap, ['--out', out]).code, 0);
      assert.ok(
        fs.existsSync(path.join(out, 'plugins', 'feynman', '.codex-plugin', 'plugin.json')),
      );
      const exportedCli = spawnSync(
        process.execPath,
        [path.join(out, 'bin', 'feynman.ts'), 'version'],
        {
          encoding: 'utf8',
          cwd: home,
          env: { PATH: process.env['PATH'], HOME: home },
        },
      );
      assert.equal(exportedCli.status, 0, exportedCli.stderr);
      assert.match(exportedCli.stdout, /^\d+\.\d+\.\d+/);
      const exportedLint = spawnSync(
        process.execPath,
        [path.join(out, 'bin', 'feynman-lint.ts'), '-'],
        {
          input: 'Ordinary text.',
          encoding: 'utf8',
          cwd: home,
          env: { PATH: process.env['PATH'], HOME: home },
        },
      );
      assert.equal(exportedLint.status, 0, exportedLint.stderr);
      fs.writeFileSync(path.join(out, 'keep'), 'yes');
      assert.match(invoke(cmdBootstrap, ['--out', out]).out, /already exists/);
      assert.equal(fs.readFileSync(path.join(out, 'keep'), 'utf8'), 'yes');
      assert.equal(invoke(cmdBootstrap, [`--out=${out}`, '--force']).code, 0);
      assert.equal(fs.existsSync(path.join(out, 'keep')), false);
      assert.equal(invoke(cmdBootstrap, ['--out']).code, 2);
      assert.equal(invoke(cmdBootstrap, ['--out=']).code, 2);
      assert.equal(invoke(cmdBootstrap, ['--bad']).code, 2);
      const unrelated = path.join(home, 'unrelated');
      fs.mkdirSync(unrelated);
      fs.writeFileSync(path.join(unrelated, 'keep'), 'user bytes');
      assert.equal(invoke(cmdBootstrap, ['--out', unrelated, '--force']).code, 2);
      assert.equal(fs.readFileSync(path.join(unrelated, 'keep'), 'utf8'), 'user bytes');
      assert.equal(invoke(cmdBootstrap, ['--out', home, '--force']).code, 2);
      const link = path.join(home, 'link');
      fs.symlinkSync(out, link);
      assert.equal(invoke(cmdBootstrap, ['--out', link, '--force']).code, 2);
      assert.ok(fs.existsSync(path.join(out, 'feynman-bootstrap.json')));
      const missing = path.join(home, 'missing-export');
      fs.symlinkSync(missing, path.join(home, 'dangling'));
      assert.equal(invoke(cmdBootstrap, ['--out', path.join(home, 'dangling'), '--force']).code, 2);
      assert.equal(fs.existsSync(missing), false);
    } finally {
      process.chdir(cwd);
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('rechecks destination ownership before promoting a staged export', (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bootstrap-'));
    const out = path.join(home, 'out');
    const args = ['--out', out, '--force'];
    try {
      assert.equal(invoke(cmdBootstrap, args).code, 0);
      const copy = fs.copyFileSync;
      t.mock.method(fs, 'copyFileSync', (source: string, destination: string) => {
        if (path.basename(source) === 'feynman-contract.md') {
          fs.rmSync(path.join(out, 'feynman-bootstrap.json'), { force: true });
          fs.writeFileSync(path.join(out, 'foreign'), 'user bytes');
        }
        copy(source, destination);
      });
      const result = invoke(cmdBootstrap, args);
      assert.equal(result.code, 2);
      assert.match(result.err, /refusing to replace/);
      assert.equal(fs.readFileSync(path.join(out, 'foreign'), 'utf8'), 'user bytes');
      assert.equal(fs.existsSync(path.join(out, 'feynman-bootstrap.json')), false);
      assert.deepEqual(fs.readdirSync(home), ['out']);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('preserves the prior export when the source hook directory is unavailable', (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bootstrap-'));
    const out = path.join(home, 'out');
    const args = ['--out', out, '--force'];
    try {
      assert.equal(invoke(cmdBootstrap, args).code, 0);
      const marker = path.join(out, 'feynman-bootstrap.json');
      const priorMarker = fs.readFileSync(marker, 'utf8');
      const priorFile = path.join(out, 'keep');
      fs.writeFileSync(priorFile, 'prior bytes');
      const source = path.resolve(import.meta.dirname, '..', 'hooks');
      const exists = fs.existsSync;
      const readdir = fs.readdirSync;
      const failure = Object.assign(new Error('injected hook source inspection failure'), {
        code: 'EACCES',
      });
      t.mock.method(fs, 'existsSync', (file: string) => file !== source && exists(file));
      t.mock.method(fs, 'readdirSync', (file: string, options?: { withFileTypes: true }) => {
        if (file === source) throw failure;
        return options === undefined ? readdir(file) : readdir(file, options);
      });
      assert.throws(() => invoke(cmdBootstrap, args), failure);
      assert.equal(fs.readFileSync(marker, 'utf8'), priorMarker);
      assert.equal(fs.readFileSync(priorFile, 'utf8'), 'prior bytes');
      assert.deepEqual(fs.readdirSync(home), ['out']);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('retains a foreign directory swapped in at the displacement rename', (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bootstrap-'));
    const out = path.join(home, 'out');
    const original = path.join(home, 'original');
    const args = ['--out', out, '--force'];
    try {
      assert.equal(invoke(cmdBootstrap, args).code, 0);
      const rename = fs.renameSync;
      let displaced: string | undefined;
      t.mock.method(fs, 'renameSync', (source: string, destination: string) => {
        if (source === out) {
          rename(out, original);
          fs.mkdirSync(out);
          // Even a replacement carrying a copied ownership marker has a different identity.
          fs.copyFileSync(
            path.join(original, 'feynman-bootstrap.json'),
            path.join(out, 'feynman-bootstrap.json'),
          );
          fs.writeFileSync(path.join(out, 'foreign'), 'user bytes');
          displaced = destination;
        }
        rename(source, destination);
      });
      assert.throws(() => invoke(cmdBootstrap, args), /destination changed.*preserved at/i);
      assert.ok(displaced !== undefined);
      assert.equal(fs.readFileSync(path.join(displaced, 'foreign'), 'utf8'), 'user bytes');
      assert.ok(fs.existsSync(path.join(original, 'feynman-bootstrap.json')));
      assert.equal(fs.existsSync(out), false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  for (const replace of [false, true]) {
    it(`does not clobber a concurrent empty destination during ${replace ? 'replacement' : 'creation'}`, (t) => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bootstrap-'));
      const out = path.join(home, 'out');
      const args = ['--out', out, '--force'];
      try {
        if (replace) {
          assert.equal(invoke(cmdBootstrap, args).code, 0);
          fs.writeFileSync(path.join(out, 'keep'), 'prior bytes');
        }
        const mkdir = fs.mkdirSync;
        let concurrent: fs.BigIntStats | undefined;
        t.mock.method(fs, 'mkdirSync', (directory: string, options?: fs.MakeDirectoryOptions) => {
          if (directory === out && concurrent === undefined) {
            mkdir(out);
            concurrent = fs.lstatSync(out, { bigint: true });
          }
          return mkdir(directory, options);
        });
        assert.throws(() => invoke(cmdBootstrap, args), replace ? AggregateError : /EEXIST/);
        assert.ok(concurrent !== undefined);
        assert.equal(fs.lstatSync(out, { bigint: true }).ino, concurrent.ino);
        assert.deepEqual(fs.readdirSync(out), []);
        const staging = fs.readdirSync(home).filter((entry) => entry !== 'out');
        if (replace) {
          assert.equal(staging.length, 1);
          assert.equal(
            fs.readFileSync(path.join(home, staging[0] ?? '', 'previous', 'keep'), 'utf8'),
            'prior bytes',
          );
        } else assert.deepEqual(staging, []);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });
  }

  it('restores the prior export after a failed promotion', (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bootstrap-'));
    const out = path.join(home, 'out');
    const args = ['--out', out, '--force'];
    try {
      assert.equal(invoke(cmdBootstrap, args).code, 0);
      const marker = path.join(out, 'feynman-bootstrap.json');
      const priorMarker = fs.readFileSync(marker, 'utf8');
      const priorFile = path.join(out, 'keep');
      fs.writeFileSync(priorFile, 'prior bytes');

      const promoteError = new Error('injected promotion failure');
      const link = fs.linkSync;
      let failNextPromotion = true;
      const fault = t.mock.method(fs, 'linkSync', (source: string, destination: string) => {
        if (failNextPromotion) {
          failNextPromotion = false;
          throw promoteError;
        }
        link(source, destination);
      });
      assert.throws(
        () => invoke(cmdBootstrap, args),
        (error: unknown) => error === promoteError,
      );
      assert.equal(fs.readFileSync(marker, 'utf8'), priorMarker);
      assert.equal(fs.readFileSync(priorFile, 'utf8'), 'prior bytes');
      assert.deepEqual(fs.readdirSync(home), ['out']);

      fault.mock.restore();
      assert.equal(invoke(cmdBootstrap, args).code, 0);
      assert.equal(fs.existsSync(priorFile), false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('preserves the prior export and both errors if restoring it also fails', (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bootstrap-'));
    const out = path.join(home, 'out');
    const args = ['--out', out, '--force'];
    try {
      assert.equal(invoke(cmdBootstrap, args).code, 0);
      fs.writeFileSync(path.join(out, 'keep'), 'prior bytes');
      const promoteError = new Error('injected promotion failure');
      const restoreError = new Error('injected restoration failure');
      const mkdir = fs.mkdirSync;
      let attempts = 0;
      t.mock.method(fs, 'mkdirSync', (directory: string, options?: fs.MakeDirectoryOptions) => {
        if (directory === out) throw attempts++ === 0 ? promoteError : restoreError;
        return mkdir(directory, options);
      });
      assert.throws(
        () => invoke(cmdBootstrap, args),
        (error: unknown) => {
          assert.ok(error instanceof AggregateError);
          assert.deepEqual(error.errors, [promoteError, restoreError]);
          const stagingDirectory = fs.readdirSync(home).at(0);
          assert.ok(stagingDirectory !== undefined);
          const previousDirectory = path.join(home, stagingDirectory, 'previous');
          assert.ok(error.message.includes(previousDirectory));
          assert.equal(
            fs.readFileSync(path.join(previousDirectory, 'keep'), 'utf8'),
            'prior bytes',
          );
          assert.deepEqual(fs.readdirSync(path.dirname(previousDirectory)), [
            path.basename(previousDirectory),
          ]);
          return true;
        },
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('covers lint command help and delegation setup', () => {
    assert.equal(invoke(cmdLint, ['--help']).code, 0);
    assert.equal(invoke(cmdLint, []).code, 0);
    const fixture = path.resolve(import.meta.dirname, 'fixtures', 'valid-flow.md');
    assert.equal(invoke(cmdLint, [fixture]).code, 0);
  });

  it('dispatches every public CLI route without spawning an uninstrumented process', () => {
    assert.equal(invoke(feynmanMain, []).code, 2);
    assert.equal(invoke(feynmanMain, ['unknown']).code, 2);
    for (const command of [
      'install',
      'uninstall',
      'doctor',
      'state',
      'lint',
      'examples',
      'bootstrap',
      'version',
    ]) {
      assert.equal(invoke(feynmanMain, [command, '--help']).code, 0, command);
    }
    assert.equal(invoke(feynmanMain, ['status', '--help']).code, 0);
  });

  it('executes the standalone lint entrypoint on each supported output path', () => {
    const fixture = path.resolve(import.meta.dirname, 'fixtures', 'valid-flow.md');
    const help = invokeLint(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /Usage: feynman-lint/);
    for (const flags of ['', '--json', '--strict', '--explain']) {
      assert.equal(invokeLint([...(flags ? [flags] : []), fixture]).code, 0);
    }
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-lint-'));
    const fixFile = path.join(temp, 'broken.md');
    const frameFile = path.join(temp, 'frame.md');
    try {
      fs.writeFileSync(fixFile, '┌───┐\n│ x │\n└─┐─┘\n');
      fs.writeFileSync(frameFile, '┌─────┐\n│ key │\n└─────┘\n');
      assert.equal(invokeLint(['--fix', fixFile]).code, 0);
      assert.equal(invokeLint(['--explain', frameFile]).code, 0);
      assert.equal(
        invokeLint([
          '--json',
          path.resolve(import.meta.dirname, 'fixtures', 'invalid-l01-unclosed-box.md'),
        ]).code,
        1,
      );
      assert.equal(
        invokeLint([
          '--strict',
          path.resolve(import.meta.dirname, 'fixtures', 'invalid-l06-half-priority.md'),
        ]).code,
        1,
      );
      assert.equal(invokeLint([path.join(temp, 'missing.md')]).code, 2);
      assert.equal(invokeLint(['--fix', path.join(temp, 'missing-fix.md')]).code, 2);
      assert.equal(invokeLint(['--unknown', fixture]).code, 2);
      assert.equal(invokeLint([fixture, fixture]).code, 2);
      assert.equal(invokeLint(['--fix', '-']).code, 2);
      assert.equal(invokeLint([]).code, 2);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
