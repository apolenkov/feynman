import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cmdExamples } from '../bin/commands/examples.ts';
import { cmdBootstrap } from '../bin/commands/bootstrap.ts';
import { cmdLint } from '../bin/commands/lint.ts';
import { main as feynmanMain } from '../bin/feynman.ts';
import { main as lintMain } from '../bin/feynman-lint.ts';

class ExitSignal extends Error {
  readonly code: number;
  constructor(code: number) { super(`exit ${code}`); this.code = code; }
}

function invoke(fn: (args: string[]) => void, args: string[]): { code: number; out: string; err: string } {
  const output: string[] = [];
  const errors: string[] = [];
  const oldExit = process.exit;
  const oldLog = console.log;
  const oldError = console.error;
  process.exit = ((code?: number) => { throw new ExitSignal(code ?? 0); }) as typeof process.exit;
  console.log = (...values: unknown[]) => output.push(values.join(' '));
  console.error = (...values: unknown[]) => errors.push(values.join(' '));
  try {
    fn(args);
  } catch (error) {
    if (!(error instanceof ExitSignal)) throw error;
    return { code: error.code, out: output.join('\n'), err: errors.join('\n') };
  } finally {
    process.exit = oldExit;
    console.log = oldLog;
    console.error = oldError;
  }
  return { code: 0, out: output.join('\n'), err: errors.join('\n') };
}

function invokeLint(args: string[]): { code: number; out: string; err: string } {
  const output: string[] = [];
  const errors: string[] = [];
  const oldExit = process.exit;
  const oldStdoutWrite = process.stdout.write;
  const oldStderrWrite = process.stderr.write;
  process.exit = ((code?: number) => { throw new ExitSignal(code ?? 0); }) as typeof process.exit;
  process.stdout.write = ((chunk: unknown) => { output.push(String(chunk)); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => { errors.push(String(chunk)); return true; }) as typeof process.stderr.write;
  try {
    lintMain(args);
  } catch (error) {
    if (error instanceof ExitSignal) return { code: error.code, out: output.join(''), err: errors.join('') };
    throw error;
  } finally {
    process.exit = oldExit;
    process.stdout.write = oldStdoutWrite;
    process.stderr.write = oldStderrWrite;
  }
  return { code: 0, out: output.join(''), err: errors.join('') };
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

  it('covers bootstrap help, export, idempotence, force, and argument errors', () => {
    const cwd = process.cwd();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-bootstrap-'));
    try {
      process.chdir(home);
      assert.match(invoke(cmdBootstrap, ['--help']).out, /feynman bootstrap/);
      const out = path.join(home, 'out');
      assert.equal(invoke(cmdBootstrap, ['--out', out]).code, 0);
      assert.ok(fs.existsSync(path.join(out, 'plugins', 'feynman', '.codex-plugin', 'plugin.json')));
      fs.writeFileSync(path.join(out, 'keep'), 'yes');
      assert.match(invoke(cmdBootstrap, ['--out', out]).out, /already exists/);
      assert.equal(fs.readFileSync(path.join(out, 'keep'), 'utf8'), 'yes');
      assert.equal(invoke(cmdBootstrap, [`--out=${out}`, '--force']).code, 0);
      assert.equal(fs.existsSync(path.join(out, 'keep')), false);
      assert.equal(invoke(cmdBootstrap, ['--out']).code, 2);
      assert.equal(invoke(cmdBootstrap, ['--out=']).code, 2);
      assert.equal(invoke(cmdBootstrap, ['--bad']).code, 2);
    } finally {
      process.chdir(cwd);
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
    for (const command of ['install', 'uninstall', 'doctor', 'state', 'lint', 'examples', 'bootstrap', 'version']) {
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
      assert.equal(invokeLint(['--json', path.resolve(import.meta.dirname, 'fixtures', 'invalid-l01-unclosed-box.md')]).code, 1);
      assert.equal(invokeLint(['--strict', path.resolve(import.meta.dirname, 'fixtures', 'invalid-l06-half-priority.md')]).code, 1);
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
