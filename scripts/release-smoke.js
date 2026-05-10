#!/usr/bin/env node
// scripts/release-smoke.js — verify the packed npm artifact installs and runs.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const NPM_CACHE = process.env.FEYNMAN_NPM_CACHE || path.join(os.tmpdir(), 'npm-cache-feynman');

function run(cmd, args, opts = {}) {
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

function binPath(projectDir, name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(projectDir, 'node_modules', '.bin', `${name}${suffix}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runtimeConfigPath(homeDir, target) {
  return path.join(homeDir, target === 'codex' ? '.codex/hooks.json' : '.claude/settings.json');
}

function runtimeHome(homeDir, target) {
  return path.join(homeDir, target === 'codex' ? '.codex' : '.claude');
}

function findHookCommand(config, eventName, scriptName) {
  const groups = (config.hooks && config.hooks[eventName]) || [];
  for (const group of groups) {
    for (const hook of group.hooks || []) {
      if (hook.command && hook.command.includes(scriptName)) {
        return hook.command;
      }
    }
  }
  throw new Error(`${scriptName} command missing in ${eventName}`);
}

function runHookCommand(command, homeDir, stdin) {
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

function verifyInstalledHooks(homeDir, target) {
  const cfg = readJson(runtimeConfigPath(homeDir, target));
  const sessionCommand = findHookCommand(cfg, 'SessionStart', 'feynman-session-start.js');
  const promptCommand = findHookCommand(cfg, 'UserPromptSubmit', 'feynman-activate.js');

  const expectedHome = runtimeHome(homeDir, target);
  if (!sessionCommand.includes(expectedHome) || !promptCommand.includes(expectedHome)) {
    throw new Error(`${target} hook command missing expected FEYNMAN_HOME`);
  }

  const sessionOut = runHookCommand(sessionCommand, homeDir, {
    hook_event_name: 'SessionStart',
    session_id: `${target}-release-smoke`,
  });
  if (!/<triggers>|<contract>|→|├──/.test(sessionOut)) {
    throw new Error(`${target} SessionStart did not emit rule-file diagram tokens`);
  }

  const promptOut = runHookCommand(promptCommand, homeDir, {
    session_id: `${target}-release-smoke`,
    prompt: 'Explain deploy pipeline stages.',
  });
  if (promptOut.endsWith('\n')) {
    throw new Error(`${target} UserPromptSubmit emitted trailing newline`);
  }
  const parsed = JSON.parse(promptOut);
  const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
  if (parsed.hookSpecificOutput?.hookEventName !== 'UserPromptSubmit' ||
      typeof ctx !== 'string' ||
      !/<triggers>|<contract>|→|├──/.test(ctx)) {
    throw new Error(`${target} UserPromptSubmit did not emit valid additionalContext`);
  }

  const state = readJson(path.join(expectedHome, '.feynman', 'state.json'));
  if (state.injections !== 1) {
    throw new Error(`${target} prompt hook did not increment injections once`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-release-smoke-'));

try {
  const packOut = run('npm', ['pack', '--pack-destination', tmp, '--json']);
  const packed = JSON.parse(packOut)[0];
  const tarball = path.join(tmp, packed.filename);
  if (!fs.existsSync(tarball)) {
    throw new Error(`tarball missing after npm pack: ${tarball}`);
  }

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
  const parsed = JSON.parse(lintOut);
  if (!Array.isArray(parsed.issues) || parsed.issues.length !== 0) {
    throw new Error('feynman-lint smoke expected zero issues');
  }

  console.log(`release smoke OK (${packed.filename})`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
