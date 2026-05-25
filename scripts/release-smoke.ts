#!/usr/bin/env node
// scripts/release-smoke.ts — verify the packed npm artifact installs and runs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = require(path.join(ROOT, 'package.json')) as { version: string; name: string; files?: string[] };
const NPM_CACHE: string = process.env['FEYNMAN_NPM_CACHE'] || path.join(os.tmpdir(), 'npm-cache-feynman');

interface RunOpts {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

function run(cmd: string, args: string[], opts: RunOpts = {}): string {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      npm_config_cache: NPM_CACHE,
      ...opts.env,
    },
  });
  if (result.status !== 0) {
    process.stderr.write(`command failed: ${cmd} ${args.join(' ')}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  return result.stdout || '';
}

function binPath(projectDir: string, name: string): string {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(projectDir, 'node_modules', '.bin', `${name}${suffix}`);
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runtimeConfigPath(homeDir: string, target: string): string {
  return path.join(homeDir, target === 'codex' ? '.codex/hooks.json' : '.claude/settings.json');
}

function runtimeHome(homeDir: string, target: string): string {
  return path.join(homeDir, target === 'codex' ? '.codex' : '.claude');
}

function findHookCommand(config: Record<string, unknown>, eventName: string, scriptName: string): string {
  const hooks = config['hooks'] as Record<string, unknown[]> | undefined;
  const groups = (hooks && hooks[eventName]) || [];
  for (const group of groups as Array<{ hooks?: Array<{ command?: string }> }>) {
    for (const hook of group.hooks || []) {
      if (hook.command && hook.command.includes(scriptName)) {
        return hook.command;
      }
    }
  }
  throw new Error(`${scriptName} command missing in ${eventName}`);
}

interface HookStdin {
  hook_event_name?: string;
  session_id: string;
  prompt?: string;
}

function runHookCommand(command: string, homeDir: string, stdin: HookStdin): string {
  const result = spawnSync(command, [], {
    cwd: ROOT,
    shell: true,
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homeDir,
      NO_COLOR: '1',
    },
    timeout: 10000,
  });
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`hook command failed: ${command}`);
  }
  return result.stdout || '';
}

function verifyInstalledHooks(homeDir: string, target: string): void {
  const cfg = readJson(runtimeConfigPath(homeDir, target));

  // v0.7.0: only SessionStart hook, no UserPromptSubmit
  const hooks = cfg['hooks'] as Record<string, unknown[]> | undefined;
  if (hooks?.['UserPromptSubmit'] !== undefined) {
    throw new Error(`${target} must not have UserPromptSubmit registered (v0.7.0+)`);
  }

  const sessionCommand = findHookCommand(cfg, 'SessionStart', 'feynman-session-start.js');
  const expectedHome = runtimeHome(homeDir, target);
  if (!sessionCommand.includes(expectedHome)) {
    throw new Error(`${target} SessionStart command missing expected FEYNMAN_HOME`);
  }

  const sessionOut = runHookCommand(sessionCommand, homeDir, {
    hook_event_name: 'SessionStart',
    session_id: `${target}-release-smoke`,
  });
  if (!/<triggers>|<contract>|→|├──/.test(sessionOut)) {
    throw new Error(`${target} SessionStart did not emit rule-file diagram tokens`);
  }
}

function verifyTarballManifest(tarball: string, filesField: string[]): void {
  const result = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('failed to list tarball contents');
  const entries = new Set(
    result.stdout.split('\n').map(e => e.replace(/^package\//, '').replace(/\/$/, '')),
  );
  for (const entry of filesField) {
    const name = entry.replace(/\/$/, '');
    if (entry.endsWith('/')) {
      if (![...entries].some(e => e === name || e.startsWith(name + '/'))) {
        throw new Error(`tarball missing files[] directory: ${entry}`);
      }
    } else {
      if (!entries.has(name)) {
        throw new Error(`tarball missing files[] entry: ${entry}`);
      }
    }
  }
}

// Expect a pre-built tarball in dist/ (produced by `npm run build`).
// Running npm pack here would pack raw .ts sources, which fail in node_modules.
const DIST = path.join(ROOT, 'dist');
const tarballTxt = path.join(DIST, 'TARBALL.txt');
if (!fs.existsSync(tarballTxt)) {
  process.stderr.write(`TARBALL.txt not found in dist/ — run 'npm run build' first.\n`);
  process.exit(1);
}
const expectedTarball = path.join(DIST, fs.readFileSync(tarballTxt, 'utf8').trim());
if (!fs.existsSync(expectedTarball)) {
  process.stderr.write(`pre-built tarball not found: ${expectedTarball}\nRun 'npm run build' first.\n`);
  process.exit(1);
}

verifyTarballManifest(expectedTarball, pkg.files ?? []);
console.log(`tarball manifest OK (${(pkg.files ?? []).length} files[] entries present)`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-release-smoke-'));

try {
  const tarball = expectedTarball;

  const projectDir = path.join(tmp, 'project');
  const homeDir = path.join(tmp, 'home');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });

  run('npm', ['install', '--prefix', projectDir, tarball]);

  const feynman = binPath(projectDir, 'feynman');
  const lint = binPath(projectDir, 'feynman-lint');

  const version = run(feynman, ['version'], { env: { HOME: homeDir } }).trim();
  if (version !== pkg.version) {
    throw new Error(`version mismatch: expected ${pkg.version}, got ${version}`);
  }

  run(feynman, ['install', '--target', 'both', '--force'], { env: { HOME: homeDir } });

  const claudeDoctor = run(feynman, ['doctor', '--target', 'claude'], { env: { HOME: homeDir } });
  const codexDoctor = run(feynman, ['doctor', '--target', 'codex'], { env: { HOME: homeDir } });
  if (!claudeDoctor.includes('Status: OK') || !codexDoctor.includes('Status: OK')) {
    throw new Error('doctor smoke failed for packed install');
  }
  verifyInstalledHooks(homeDir, 'claude');
  verifyInstalledHooks(homeDir, 'codex');

  const lintOut = run(lint, ['--json', path.join(ROOT, 'tests', 'fixtures', 'valid-flow.md')]);
  const parsed = JSON.parse(lintOut) as { issues: unknown[] };
  if (!Array.isArray(parsed.issues) || parsed.issues.length !== 0) {
    throw new Error('feynman-lint smoke expected zero issues');
  }

  console.log(`release smoke OK (${path.basename(tarball)})`);
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
