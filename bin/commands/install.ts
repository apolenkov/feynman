import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_STATE, readState } from '../../lib/feynman-state.ts';
import type { InstallResult, UninstallResult, TargetAdapter } from '../cli/types.ts';
import { ensureDir } from '../cli/fs-utils.ts';
import { readJsonConfig, readSettings, writeSettings, hasFeynmanHook, hasAnyFeynmanHook, removeFeynmanHooks, bootstrapState, installClaudeCommand, targetConfig } from '../cli/settings.ts';
import { targetNames, hookCommandFor, readIntensityRules } from '../cli/targets.ts';

// Resolve paths using os.homedir() — never tilde literal (bug #8810)
const HOME = os.homedir();

// Hook script lives relative to this file.
// Prefer .ts (dev with strip-types); fall back to .js (installed npm package).
const _hookExt = fs.existsSync(path.resolve(import.meta.dirname, '..', '..', 'hooks', 'feynman-activate.ts')) ? '.ts' : '.js';
const HOOK_PATH         = path.resolve(import.meta.dirname, '..', '..', 'hooks', `feynman-activate${_hookExt}`);
const SESSION_HOOK_PATH = path.resolve(import.meta.dirname, '..', '..', 'hooks', `feynman-session-start${_hookExt}`);

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

export function cmdInstall(opts: { force: boolean; target: string }): void {
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

export function readOpenCodeSettings(settingsPath: string): Record<string, unknown> {
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

export function cmdUninstall(opts: { target: string }): void {
  const results = targetNames(opts.target).map(uninstallOne);
  const labels = results.map(r => targetConfig(r.target).label).join(' + ');
  if (results.every(r => r.missing || !r.hadHook)) {
    console.log(`feynman: no hook found for ${labels} — nothing to uninstall.`);
  } else {
    console.log(`feynman disabled for ${labels}. State preserved. Re-enable: npx @albinocrabs/feynman install --target ${opts.target}`);
  }
  process.exit(0);
}
