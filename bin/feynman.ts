#!/usr/bin/env node
// bin/feynman.ts — feynman unified CLI
// Subcommands: install, uninstall, doctor, lint, examples, bootstrap, version, help
// Zero runtime deps. ESM TypeScript. Node >= 22.6.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { DEFAULT_STATE, readState } from '../lib/feynman-state.ts';
import type { InstallResult, UninstallResult, TargetAdapter } from './cli/types.ts';
import { c } from './cli/ansi.ts';
import { HELP, BOOTSTRAP_HELP, INSTALL_HELP, UNINSTALL_HELP, DOCTOR_HELP, LINT_HELP, VERSION_HELP, cmdHelp } from './cli/help.ts';
import { ensureDir, copyFileIfExists, copyMarkdownDir } from './cli/fs-utils.ts';
import { readJsonConfig, readSettings, writeSettings, isSessionStartHookCommand, hasFeynmanHook, hasAnyFeynmanHook, extractHookScriptPath, removeFeynmanHooks, bootstrapState, installClaudeCommand, targetConfig } from './cli/settings.ts';
import { targetNames, parseTarget, hookCommandFor, readIntensityRules } from './cli/targets.ts';
import { cmdExamples } from './commands/examples.ts';

const require = createRequire(import.meta.url);
const PKG = require('../package.json') as { version: string; name: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const VERSION   = PKG.version;
const ROOT_DIR  = path.resolve(import.meta.dirname, '..');

// Resolve paths using os.homedir() — never tilde literal (bug #8810)
const HOME = os.homedir();

// Hook script lives relative to this file.
// Prefer .ts (dev with strip-types); fall back to .js (installed npm package).
const _hookExt = fs.existsSync(path.resolve(import.meta.dirname, '..', 'hooks', 'feynman-activate.ts')) ? '.ts' : '.js';
const HOOK_PATH         = path.resolve(import.meta.dirname, '..', 'hooks', `feynman-activate${_hookExt}`);
const SESSION_HOOK_PATH = path.resolve(import.meta.dirname, '..', 'hooks', `feynman-session-start${_hookExt}`);
const RULES_PATH        = path.resolve(import.meta.dirname, '..', 'rules', 'feynman-activate.md');

// ─── Help text ────────────────────────────────────────────────────────────────
// Moved to bin/cli/help.ts; imported above.

const EXAMPLES_DIR = path.resolve(import.meta.dirname, '..', 'examples');
const SKILL_SRC    = path.resolve(ROOT_DIR, 'skills', 'feynman', 'SKILL.md');
const CLAUDE_PLUGIN  = path.resolve(ROOT_DIR, '.claude-plugin', 'plugin.json');
const CODEX_PLUGIN   = path.resolve(ROOT_DIR, '.codex-plugin', 'plugin.json');
const PACKAGE_HOOKS  = path.resolve(ROOT_DIR, 'hooks', 'hooks.json');
const DEFAULT_BOOTSTRAP_DIR = 'feynman-package';
const ACTIVATOR_JS   = HOOK_PATH;   // activate hook path (dev: .ts, package: .js)
const CLI_JS         = path.resolve(ROOT_DIR, 'bin', `feynman${_hookExt}`);
const PACKAGE_JSON   = path.resolve(ROOT_DIR, 'package.json');

function cmdBootstrap(args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(BOOTSTRAP_HELP);
    process.exit(0);
  }

  let out = path.resolve(process.cwd(), DEFAULT_BOOTSTRAP_DIR);
  let force = false;
  const unknown: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--out') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        console.error('feynman bootstrap: --out requires a value');
        process.exit(2);
      }
      out = path.resolve(process.cwd(), value);
      i += 1;
      continue;
    }

    if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length);
      if (!value) {
        console.error('feynman bootstrap: invalid --out argument');
        process.exit(2);
      }
      out = path.resolve(process.cwd(), value);
      continue;
    }

    if (arg.startsWith('-')) {
      unknown.push(arg);
      continue;
    }

    unknown.push(arg);
  }

  if (unknown.length > 0) {
    console.error(`feynman bootstrap: unexpected arguments "${unknown.join(' ')}"`);
    console.error('Run `feynman bootstrap --help` for usage.');
    process.exit(2);
  }

  if (fs.existsSync(out) && !force) {
    console.log(`feynman bootstrap: output already exists at ${out}`);
    console.log('Use `--force` to recreate it.');
    process.exit(0);
  }

  if (fs.existsSync(out)) {
    fs.rmSync(out, { recursive: true, force: true });
  }

  const counts = {
    examples:        copyMarkdownDir(EXAMPLES_DIR, path.join(out, 'examples')),
    rules:           copyFileIfExists(RULES_PATH, path.join(out, 'rules', 'feynman-activate.md')) ? 1 : 0,
    hooks:           copyFileIfExists(PACKAGE_HOOKS, path.join(out, 'hooks', 'hooks.json')) ? 1 : 0,
    hookRuntime:     copyFileIfExists(ACTIVATOR_JS, path.join(out, 'hooks', `feynman-activate${_hookExt}`)) ? 1 : 0,
    cliRuntime:      copyFileIfExists(CLI_JS, path.join(out, 'bin', `feynman${_hookExt}`)) ? 1 : 0,
    packageManifest: copyFileIfExists(PACKAGE_JSON, path.join(out, 'package.json')) ? 1 : 0,
    plugins:
      (copyFileIfExists(CLAUDE_PLUGIN, path.join(out, '.claude-plugin', 'plugin.json')) ? 1 : 0) +
      (copyFileIfExists(CODEX_PLUGIN,  path.join(out, '.codex-plugin',  'plugin.json')) ? 1 : 0),
    skill: copyFileIfExists(SKILL_SRC, path.join(out, 'skills', 'feynman', 'SKILL.md')) ? 1 : 0,
  };

  ensureDir(out);
  fs.writeFileSync(
    path.join(out, 'feynman-bootstrap.json'),
    JSON.stringify({
      version: VERSION,
      createdAt: new Date().toISOString(),
      outputDir: out,
      counts,
    }, null, 2) + '\n'
  );

  const total = Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 1);
  console.log('');
  console.log('┌─ feynman bootstrap ────────────────────────────────────────┐');
  console.log(`│ output:   ${out}`);
  console.log(`│ examples: ${counts.examples}`);
  console.log(`│ rules:    ${counts.rules}`);
  console.log(`│ hooks:    ${counts.hooks}`);
  console.log(`│ runtime:  ${counts.hookRuntime + counts.cliRuntime + counts.packageManifest}`);
  console.log(`│ plugins:  ${counts.plugins}`);
  console.log(`│ skill:    ${counts.skill}`);
  console.log(`│ files:    ${total}`);
  console.log('└───────────────────────────────────────────────────────────┘');
  process.exit(0);
}

// ─── Install ──────────────────────────────────────────────────────────────────

function installHookTarget(target: string, opts: { force: boolean }): InstallResult {
  const force = opts.force ?? false;

  // Read or create settings
  const cfg = readSettings(target) as Record<string, Record<string, unknown[]>>;
  cfg['hooks'] = cfg['hooks'] ?? {};
  cfg['hooks']['SessionStart'] = cfg['hooks']['SessionStart'] ?? [];

  // Idempotency check must happen BEFORE removeFeynmanHooks (v0.7.0+: SessionStart-only)
  const already = hasFeynmanHook(cfg as Record<string, unknown>);

  if (already && !force) {
    bootstrapState(target);
    if (target === 'claude') installClaudeCommand();
    return { target, already: true };
  }

  // Migration: clean up all legacy feynman hooks (UserPromptSubmit from v0.6.x and existing SessionStart)
  removeFeynmanHooks(cfg as Record<string, unknown>);
  cfg['hooks'] = cfg['hooks'] ?? {};
  cfg['hooks']['SessionStart'] = cfg['hooks']['SessionStart'] ?? [];

  // Append SessionStart hook entry (matcher fires on startup, resume, compact, and clear)
  const sessionEntry: Record<string, unknown> = {
    matcher: 'startup|resume|compact|clear',
    hooks: [{
      type: 'command',
      command: hookCommandFor(target).replace(HOOK_PATH, SESSION_HOOK_PATH),
      timeout: 5,
    }]
  };
  cfg['hooks']['SessionStart'].push(sessionEntry);

  // Write settings
  writeSettings(target, cfg as Record<string, unknown>);

  // Bootstrap state dir + state.json
  bootstrapState(target);

  // Install /feynman command to ~/.claude/commands/ (preserves user's existing skill)
  if (target === 'claude') installClaudeCommand();

  return { target, already: false, tc: targetConfig(target) };
}

function cmdInstall(opts: { force: boolean; target: string }): void {
  const results = targetNames(opts.target).map(t => installOne(t, opts));

  if (results.every(r => r.already)) {
    const labels = results.map(r => targetConfig(r.target).label).join(' + ');
    console.log(`hook: already installed (${labels})`);
    process.exit(0);
  }

  // Print status frame
  console.log('');
  console.log('┌─ feynman installed ──────────────────────────────────────────┐');
  console.log(`│ hook:     ${SESSION_HOOK_PATH}`);
  for (const result of results) {
    const tc = targetConfig(result.target);
    console.log(`│ target:   ${tc.label}${result.already ? ' (already installed)' : ''}`);
    console.log(`│ config:   ${tc.settingsPath.replace(HOME, '~')}`);
    console.log(`│ state:    ${tc.statePath.replace(HOME, '~')}`);
    console.log(`│ flag:     ${tc.flagPath.replace(HOME, '~')}`);
  }
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('Restart Claude Code, Codex, or OpenCode to activate feynman full mode.');

  process.exit(0);
}

function uninstallHookTarget(target: string): UninstallResult {
  const tc = targetConfig(target);
  if (!fs.existsSync(tc.settingsPath)) {
    if (fs.existsSync(tc.flagPath)) fs.unlinkSync(tc.flagPath);
    return { target, missing: true };
  }

  const cfg = readSettings(target);
  const hadHook = hasAnyFeynmanHook(cfg);
  removeFeynmanHooks(cfg);
  writeSettings(target, cfg);

  // Remove flag file (NOT state.json — user data per D-11)
  if (fs.existsSync(tc.flagPath)) {
    fs.unlinkSync(tc.flagPath);
  }

  return { target, missing: false, hadHook };
}

// ─── OpenCode adapter ─────────────────────────────────────────────────────────

function readOpenCodeSettings(settingsPath: string): Record<string, unknown> {
  return readJsonConfig(settingsPath);
}

function installOpenCodeTarget(opts: { force: boolean }): InstallResult {
  const tc = targetConfig('opencode');

  bootstrapState('opencode');

  // Read enabled and intensity from state.json
  let intensity = DEFAULT_STATE.intensity;
  let enabled = DEFAULT_STATE.enabled;
  const state = readState(tc.rootDir);
  if (state) {
    intensity = state.intensity ?? intensity;
    enabled = state.enabled ?? enabled;
  }

  // Write rules.md: empty if disabled, intensity content if enabled
  const rulesContent = enabled ? readIntensityRules(intensity) : '';
  const rulesDestPath = path.join(tc.feynmanDir, 'rules.md');
  fs.writeFileSync(rulesDestPath, rulesContent ? rulesContent + '\n' : '');

  // Read opencode.json (create {} if absent)
  const settings = readOpenCodeSettings(tc.settingsPath);
  const instructions = (settings['instructions'] as string[] | undefined) ?? [];

  // Check-before-append: add absolute path only if not already present
  const already = instructions.includes(rulesDestPath);
  if (!already || opts.force) {
    if (!already) {
      instructions.push(rulesDestPath);
    }
    settings['instructions'] = instructions;
    ensureDir(path.dirname(tc.settingsPath));
    fs.writeFileSync(tc.settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  return { target: 'opencode', already, tc };
}

function uninstallOpenCodeTarget(): UninstallResult {
  const tc = targetConfig('opencode');
  const rulesDestPath = path.join(tc.feynmanDir, 'rules.md');

  if (!fs.existsSync(tc.settingsPath) && !fs.existsSync(tc.flagPath)) {
    return { target: 'opencode', missing: true };
  }

  // Remove our path from instructions[] in opencode.json
  let hadHook = false;
  if (fs.existsSync(tc.settingsPath)) {
    const settings = readOpenCodeSettings(tc.settingsPath);
    const instructions = (settings['instructions'] as string[] | undefined) ?? [];
    const filtered = instructions.filter(p => p !== rulesDestPath);
    hadHook = filtered.length < instructions.length;
    if (hadHook) {
      settings['instructions'] = filtered.length > 0 ? filtered : undefined;
      if (settings['instructions'] === undefined) delete settings['instructions'];
      fs.writeFileSync(tc.settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }
  }

  // Delete rules.md
  if (fs.existsSync(rulesDestPath)) fs.unlinkSync(rulesDestPath);

  // Delete flag file (NOT state.json — preserved per D-11)
  if (fs.existsSync(tc.flagPath)) fs.unlinkSync(tc.flagPath);

  return { target: 'opencode', missing: false, hadHook };
}

// Render a doctor report: a titled frame around the check lines, then a status
// line. Shared by both doctor entry points (the only difference was the target
// name in the title). Frame width = longest stripped line + 2, min 48.
function renderDoctorReport(target: string, checks: string[], failCount: number): void {
  const strippedLines = checks.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
  const maxLen = Math.max(...strippedLines.map(l => l.length));
  const innerW = Math.max(maxLen + 2, 48); // +2 for one space on each side; min 48
  const titlePart = `feynman doctor ${target} `;
  const border = '─'.repeat(innerW);
  const topDashes = '─'.repeat(innerW - titlePart.length - 1);
  console.log(`┌─ ${titlePart}${topDashes}┐`);
  for (let i = 0; i < checks.length; i++) {
    const stripped = strippedLines[i] ?? '';
    const pad = innerW - 1 - stripped.length; // 1 for leading space
    console.log(`│ ${checks[i] ?? ''}${' '.repeat(Math.max(0, pad))}│`);
  }
  console.log(`└${border}┘`);

  const status = failCount === 0
    ? c.green('Status: OK')
    : c.red(`Status: ISSUES (${failCount})`);
  console.log(status);
}

function cmdDoctorOpenCode(): void {
  const tc = targetConfig('opencode');
  const rulesDestPath = path.join(tc.feynmanDir, 'rules.md');
  const checks: string[] = [];
  let failCount = 0;

  function check(label: string, pass: boolean): void {
    const marker = pass ? '[OK]  ' : '[FAIL]';
    const colorFn = pass ? c.green : c.red;
    checks.push(colorFn(`${marker} ${label}`));
    if (!pass) failCount++;
  }

  // 1. opencode.json exists
  const settingsExists = fs.existsSync(tc.settingsPath);
  check(`${tc.settingsPath.replace(HOME, '~')} present`, settingsExists);

  // 2. our path in instructions[]
  let pathInInstructions = false;
  if (settingsExists) {
    const settings = readOpenCodeSettings(tc.settingsPath);
    const instructions = (settings['instructions'] as string[] | undefined) ?? [];
    pathInInstructions = instructions.includes(rulesDestPath);
  }
  check(`rules path in instructions[] (${rulesDestPath.replace(HOME, '~')})`, pathInInstructions);

  // 3. rules.md exists and non-empty
  let rulesOk = false;
  try {
    const stat = fs.statSync(rulesDestPath);
    rulesOk = stat.size > 0;
  } catch (_) { /* intentionally empty */ }
  check('rules.md exists and non-empty', rulesOk);

  // 4. state.json valid
  // Raw read (no DEFAULT merge) so a state.json missing `enabled` correctly fails.
  const state = readState(tc.rootDir);
  const stateOk = state !== null && 'enabled' in state;
  const stateEnabled = state?.enabled === true;
  check('state.json valid (has enabled field)', stateOk);

  // ADR-0005: a leftover .bak means a corrupt state.json was self-healed — surface
  // it so the user knows their settings were reset to defaults. (This doctor's
  // check() has no INFO arg; the line always passes.)
  if (fs.existsSync(tc.statePath + '.bak')) {
    check('state.json recovered from corruption (backup: state.json.bak)', true);
  }

  // 5. flag matches state
  const flagPresent = fs.existsSync(tc.flagPath);
  check(
    stateEnabled ? '.feynman-active flag present when enabled' : '.feynman-active flag absent when disabled',
    stateEnabled ? flagPresent : !flagPresent
  );

  renderDoctorReport('opencode', checks, failCount);
}

// ─── Target adapters ──────────────────────────────────────────────────────────

function createHookAdapter(name: 'claude' | 'codex'): TargetAdapter {
  return {
    install: (opts) => installHookTarget(name, opts),
    uninstall: () => uninstallHookTarget(name),
  };
}

function createOpenCodeAdapter(): TargetAdapter {
  return {
    install: (opts) => installOpenCodeTarget(opts),
    uninstall: () => uninstallOpenCodeTarget(),
  };
}

const adapters: Record<string, TargetAdapter> = {
  claude:    createHookAdapter('claude'),
  codex:     createHookAdapter('codex'),
  opencode:  createOpenCodeAdapter(),
};

function installOne(target: string, opts: { force: boolean }): InstallResult {
  const adapter = adapters[target];
  if (!adapter) throw new Error(`feynman: no adapter for target '${target}'`);
  return adapter.install(opts);
}

function uninstallOne(target: string): UninstallResult {
  const adapter = adapters[target];
  if (!adapter) throw new Error(`feynman: no adapter for target '${target}'`);
  return adapter.uninstall();
}

// ─── Uninstall ────────────────────────────────────────────────────────────────

function cmdUninstall(opts: { target: string }): void {
  const results = targetNames(opts.target).map(uninstallOne);
  const labels = results.map(r => targetConfig(r.target).label).join(' + ');
  if (results.every(r => r.missing || !r.hadHook)) {
    console.log(`feynman: no hook found for ${labels} — nothing to uninstall.`);
  } else {
    console.log(`feynman disabled for ${labels}. State preserved. Re-enable: npx @albinocrabs/feynman install --target ${opts.target}`);
  }
  process.exit(0);
}

// ─── Doctor ───────────────────────────────────────────────────────────────────

function cmdDoctor(opts: { target?: string; noExit?: boolean } = {}): void {
  const target = opts.target ?? 'claude';

  if (target === 'opencode') {
    cmdDoctorOpenCode();
    process.exit(0);
  }

  if (target === 'both' || target === 'all' || target === '*') {
    targetNames(target).forEach(t => cmdDoctor({ target: t, noExit: true }));
    process.exit(0);
  }
  const tc = targetConfig(target);
  const checks: string[] = [];
  let failCount = 0;

  function check(label: string, pass: boolean, info = false): void {
    const marker = info ? '[INFO]' : (pass ? '[OK]  ' : '[FAIL]');
    const colorFn = info ? c.dim : (pass ? c.green : c.red);
    checks.push(colorFn(`${marker} ${label}`));
    if (!info && !pass) failCount++;
  }

  // 1. settings/hooks config exists
  const settingsExists = fs.existsSync(tc.settingsPath);
  check(`${tc.settingsPath.replace(HOME, '~')} present`, settingsExists);

  // 2. SessionStart hook references feynman-session-start script
  let sessionHookRegistered = false;
  let sessionHookAbsPath: string | null = null;
  if (settingsExists) {
    const cfg = readSettings(target);
    const hooks = cfg['hooks'] as Record<string, Array<Record<string, unknown>>> | undefined;
    const sessionEntries = hooks?.['SessionStart'] ?? [];
    const feynmanSessionEntry = sessionEntries.find(g => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(h => isSessionStartHookCommand(h['command']));
    });
    sessionHookRegistered = !!feynmanSessionEntry;
    if (feynmanSessionEntry) {
      const hs = feynmanSessionEntry['hooks'] as Array<Record<string, unknown>>;
      const hookCmd = hs.find(h => isSessionStartHookCommand(h['command']))?.['command'] as string | undefined;
      if (hookCmd) {
        sessionHookAbsPath =
          extractHookScriptPath(hookCmd, 'feynman-session-start.ts') ??
          extractHookScriptPath(hookCmd, 'feynman-session-start.js');
      }
    }
  }
  check('hook registered (feynman-session-start in SessionStart)', sessionHookRegistered);

  // 3. Hook script file exists + readable
  let sessionHookFileOk = false;
  if (sessionHookAbsPath) {
    try {
      fs.accessSync(sessionHookAbsPath, fs.constants.R_OK);
      sessionHookFileOk = true;
    } catch (_) { /* intentionally empty */ }
  }
  check('session hook script file exists and is readable', sessionHookFileOk);

  // 4. Rules file exists + non-empty
  let rulesOk = false;
  try {
    const stat = fs.statSync(RULES_PATH);
    rulesOk = stat.size > 0;
  } catch (_) { /* intentionally empty */ }
  check('rules/feynman-activate.md exists and non-empty', rulesOk);

  // 5. state.json valid JSON + has enabled field
  // Raw read (no DEFAULT merge) so a state.json missing `enabled` correctly fails.
  const state = readState(tc.rootDir);
  const stateOk = state !== null && 'enabled' in state;
  const stateEnabled = state?.enabled === true;
  check('state.json valid (has enabled field)', stateOk);

  // ADR-0005: a leftover .bak means a corrupt state.json was self-healed — surface
  // it so the user knows their settings were reset to defaults.
  if (fs.existsSync(tc.statePath + '.bak')) {
    check('state.json recovered from corruption (backup: state.json.bak)', true, true);
  }

  // 6. .feynman-active flag matches state
  const flagPresent = fs.existsSync(tc.flagPath);
  check(
    stateEnabled ? '.feynman-active flag present when enabled' : '.feynman-active flag absent when disabled',
    stateEnabled ? flagPresent : !flagPresent
  );

  // 7. (INFO) lint hook registered
  let lintHookRegistered = false;
  if (settingsExists) {
    const cfg = readSettings(target);
    const hooks = cfg['hooks'] as Record<string, Array<Record<string, unknown>>> | undefined;
    // Check Stop hooks too
    const allHookGroups = [
      ...(hooks?.['UserPromptSubmit'] ?? []),
      ...(hooks?.['Stop'] ?? []),
    ];
    lintHookRegistered = allHookGroups.some(g => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(h => typeof h['command'] === 'string' && (
        (h['command'] as string).includes('feynman-lint.ts') ||
        (h['command'] as string).includes('feynman-lint.js')
      ));
    });
  }
  const lintStatus = lintHookRegistered ? 'registered' : 'not registered (optional)';
  check(`lint hook: ${lintStatus}`, true, true); // always INFO

  renderDoctorReport(target, checks, failCount);

  if (!opts.noExit) process.exit(0);
}

// ─── Lint (delegate to feynman-lint.ts via spawnSync) ─────────────────────────

function cmdLint(args: string[]): void {
  const lintArgs = args.filter(a => a !== '--help');
  if (args.includes('--help') || lintArgs.length === 0) {
    console.log(LINT_HELP);
    process.exit(0);
  }

  const lintBin = path.resolve(import.meta.dirname, `feynman-lint${_hookExt}`);
  const result = spawnSync(process.execPath, [lintBin, ...lintArgs], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

// ─── Version ──────────────────────────────────────────────────────────────────

function cmdVersion(args: string[]): void {
  if (args.includes('--help')) {
    console.log(VERSION_HELP);
    process.exit(0);
  }
  console.log(VERSION);
  process.exit(0);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const sub  = argv[0];
const rest = argv.slice(1);

// Top-level --help / -h / no args
if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
  if (!sub) {
    // No args → help + exit 2
    console.log(HELP);
    process.exit(2);
  }
  cmdHelp();
}

switch (sub) {
  case 'install': {
    if (rest.includes('--help')) { console.log(INSTALL_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    const force = parsed.args.includes('--force');
    cmdInstall({ force, target: parsed.target });
    break;
  }
  case 'uninstall': {
    if (rest.includes('--help')) { console.log(UNINSTALL_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    cmdUninstall({ target: parsed.target });
    break;
  }
  case 'doctor': {
    if (rest.includes('--help')) { console.log(DOCTOR_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    cmdDoctor({ target: parsed.target });
    break;
  }
  case 'lint': {
    cmdLint(rest);
    break;
  }
  case 'examples': {
    cmdExamples(rest);
    break;
  }
  case 'bootstrap': {
    cmdBootstrap(rest);
    break;
  }
  case 'version': {
    cmdVersion(rest);
    break;
  }
  default: {
    console.error(`feynman: unknown subcommand '${sub}'`);
    console.log(HELP);
    process.exit(2);
  }
}
