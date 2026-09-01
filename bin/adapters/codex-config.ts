// bin/adapters/codex-config.ts — Codex filesystem and hook-config adapter.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { type FeynmanState, DEFAULT_STATE, normalizeState } from '../../lib/state/index.ts';
import { flagContent, readState, statePaths, writeState } from './state-store.ts';

export interface CodexConfig {
  rootDir: string;
  settingsPath: string;
  feynmanDir: string;
  statePath: string;
  flagPath: string;
}

// Resolve paths using os.homedir() — never tilde literal (bug #8810)
const HOME = os.homedir();

export function codexConfig(): CodexConfig {
  const rootDir = path.join(HOME, '.codex');
  return { rootDir, settingsPath: path.join(rootDir, 'hooks.json'), ...statePaths(rootDir) };
}

// Print a clean error and abort. Used where continuing would corrupt user data.
export function fatal(message: string): never {
  console.error(`feynman: ${message}`);
  process.exit(2);
}

// Read a JSON config file we may later REWRITE. The whole point is to merge our
// hook entry into the user's existing config and write it back — so we must
// distinguish "file absent" (safe to start from {}) from "file present but
// unparseable" (a trailing comma, a comment, or a truncated write). Returning {}
// in the latter case would silently DESTROY the user's settings on the next
// write, so we refuse and exit instead.
export function readJsonConfig(filePath: string): Record<string, unknown> {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return fatal(`cannot read ${filePath}: ${(err as Error).message}`);
  }
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (_) {
    return fatal(
      `refusing to touch ${filePath}: file exists but is not valid JSON ` +
      `(trailing comma, comment, or truncated write?). Fix it by hand and re-run.`,
    );
  }
}

export function readSettings(): Record<string, unknown> {
  return readJsonConfig(codexConfig().settingsPath);
}

export function writeSettings(settings: Record<string, unknown>): void {
  const cfg = codexConfig();
  fs.mkdirSync(cfg.rootDir, { recursive: true });
  fs.writeFileSync(cfg.settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export function isFeynmanHookCommand(command: string): boolean {
  return isSessionStartHookCommand(command) || command.includes('feynman-lint.ts') || command.includes('feynman-lint.js');
}

// The SessionStart hook is the one doctor and install introspection look for.
// Centralised so renaming the script touches one place, not five inline literals.
export function isSessionStartHookCommand(command: unknown): boolean {
  return typeof command === 'string' && (
    command.includes('feynman-session-start.ts') ||
    command.includes('feynman-session-start.js')
  );
}

export function hasFeynmanHook(settings: Record<string, unknown>): boolean {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  return ((hooks?.['SessionStart'] ?? []) as Array<Record<string, unknown>>).some(g => {
    const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
    return hs?.some(h => isSessionStartHookCommand(h['command']));
  });
}

export function hasAnyFeynmanHook(settings: Record<string, unknown>): boolean {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  if (!hooks) return false;
  return ['SessionStart', 'UserPromptSubmit', 'Stop'].some(eventName =>
    ((hooks[eventName] ?? []) as Array<Record<string, unknown>>).some(g => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(h => typeof h['command'] === 'string' && isFeynmanHookCommand(h['command'] as string));
    })
  );
}

export function extractHookScriptPath(command: string, scriptName: string): string | null {
  if (typeof command !== 'string') return null;
  const escaped = scriptName.replace(/\./g, '\\.');
  const quotedPattern = new RegExp("[\"']([^\"']*" + escaped + ")[\"']");
  const quoted = command.match(quotedPattern);
  if (quoted) return quoted[1] ?? null;

  const unquotedPattern = new RegExp("(?:^|\\s)(/[^\\s\"';&|<>]*" + escaped + ")(?=$|\\s)");
  const unquoted = command.match(unquotedPattern);
  return unquoted ? (unquoted[1] ?? null) : null;
}

export function removeFeynmanHooks(settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  if (!hooks) return settings;
  for (const eventName of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
    if (!Array.isArray(hooks[eventName])) continue;
    const groups = hooks[eventName] as Array<Record<string, unknown>>;
    hooks[eventName] = groups
      .map(g => {
        const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(hs)) return g;
        return {
          ...g,
          hooks: hs.filter(h => !(typeof h['command'] === 'string' && isFeynmanHookCommand(h['command'] as string))),
        };
      })
      .filter(g => {
        const hs = g['hooks'] as Array<unknown> | undefined;
        return !Array.isArray(hs) || hs.length > 0;
      });
    if ((hooks[eventName] as unknown[]).length === 0) {
      delete hooks[eventName];
    }
  }
  if (Object.keys(hooks).length === 0) {
    delete settings['hooks'];
  }
  return settings;
}

export function bootstrapState(): void {
  const cfg = codexConfig();
  // Absent or corrupt state.json → (re)write default; otherwise merge with defaults.
  const raw = readState(cfg.rootDir);
  let state: FeynmanState = { ...DEFAULT_STATE };
  if (raw === null) {
    writeState(cfg.rootDir, state);
  } else {
    state = normalizeState(raw);
  }
  if (state.enabled) {
    fs.writeFileSync(cfg.flagPath, flagContent(state));
  } else if (fs.existsSync(cfg.flagPath)) {
    fs.unlinkSync(cfg.flagPath);
  }
}
