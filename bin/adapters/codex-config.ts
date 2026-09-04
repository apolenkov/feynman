// bin/adapters/codex-config.ts — Codex filesystem and hook-config adapter.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { reconcileState, statePaths } from './state-store.ts';
import { atomicWrite } from './fs.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validSettings(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (!('hooks' in value)) return true;
  if (!isRecord(value['hooks'])) return false;
  return Object.values(value['hooks']).every(
    (groups: unknown) =>
      Array.isArray(groups) &&
      groups.every(
        (group: unknown) =>
          isRecord(group) &&
          Array.isArray(group['hooks']) &&
          group['hooks'].every((hook: unknown) => isRecord(hook)),
      ),
  );
}

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return fatal(
      `refusing to touch ${filePath}: file exists but is not valid JSON ` +
        `(trailing comma, comment, or truncated write?). Fix it by hand and re-run.`,
    );
  }
  if (!validSettings(parsed)) {
    return fatal(`refusing to touch ${filePath}: expected a JSON object with valid hook groups`);
  }
  return parsed;
}

export function readSettings(): Record<string, unknown> {
  return readJsonConfig(codexConfig().settingsPath);
}

export function writeSettings(settings: Record<string, unknown>): void {
  const cfg = codexConfig();
  fs.mkdirSync(cfg.rootDir, { recursive: true });
  atomicWrite(cfg.settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export function isFeynmanHookCommand(command: string): boolean {
  return (
    isSessionStartHookCommand(command) ||
    ownsScript(command, 'feynman-lint.ts') ||
    ownsScript(command, 'feynman-lint.js')
  );
}

function ownsScript(command: string, scriptName: string): boolean {
  return extractHookScriptPath(command, scriptName) !== null;
}

// The SessionStart hook is the one doctor and install introspection look for.
// Centralised so renaming the script touches one place, not five inline literals.
export function isSessionStartHookCommand(command: unknown): boolean {
  return (
    typeof command === 'string' &&
    (ownsScript(command, 'feynman-session-start.ts') ||
      ownsScript(command, 'feynman-session-start.js'))
  );
}

export function hasFeynmanHook(settings: Record<string, unknown>): boolean {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  return ((hooks?.['SessionStart'] ?? []) as Array<Record<string, unknown>>).some((g) => {
    const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
    return hs?.some((h) => isSessionStartHookCommand(h['command']));
  });
}

export function hasAnyFeynmanHook(settings: Record<string, unknown>): boolean {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  if (!hooks) return false;
  return ['SessionStart', 'UserPromptSubmit', 'Stop'].some((eventName) =>
    ((hooks[eventName] ?? []) as Array<Record<string, unknown>>).some((g) => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(
        (h) => typeof h['command'] === 'string' && isFeynmanHookCommand(h['command']),
      );
    }),
  );
}

/** Read literal shell words without executing expansions or accepting compound commands. */
function literalShellWords(command: string): string[] | null {
  const words: string[] = [];
  let word = '';
  let quote: string | null = null;
  let escaped = false;
  let started = false;
  for (const character of command.trim()) {
    if (escaped) {
      if (quote === '"' && !'$`"\\\n'.includes(character)) word += '\\';
      if (character !== '\n') word += character;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
      else word += character;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      started = true;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = null;
      else if ('$`'.includes(character)) return null;
      else word += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
      continue;
    }
    if ('$`;&|<>(){}*?[]~\n\r'.includes(character)) return null;
    if (/\s/.test(character)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += character;
      started = true;
    }
  }
  if (quote !== null || escaped) return null;
  if (started) words.push(word);
  return words;
}

export function extractHookScriptPath(command: string, scriptName: string): string | null {
  const words = literalShellWords(command);
  if (!words) return null;
  const offset = words[0]?.startsWith('FEYNMAN_HOME=') ? 1 : 0;
  const executable = words[offset];
  const script = words[offset + 1];
  return executable !== undefined &&
    path.basename(executable) === 'node' &&
    script !== undefined &&
    path.basename(script) === scriptName
    ? script
    : null;
}

export function removeFeynmanHooks(settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  if (!hooks) return settings;
  for (const eventName of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
    if (!Array.isArray(hooks[eventName])) continue;
    const groups = hooks[eventName] as Array<Record<string, unknown>>;
    hooks[eventName] = groups
      .map((g) => {
        const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(hs)) return g;
        return {
          ...g,
          hooks: hs.filter(
            (h) => !(typeof h['command'] === 'string' && isFeynmanHookCommand(h['command'])),
          ),
        };
      })
      .filter((g) => {
        const hs = g['hooks'] as Array<unknown> | undefined;
        return !Array.isArray(hs) || hs.length > 0;
      });
    if (hooks[eventName].length === 0) {
      delete hooks[eventName];
    }
  }
  if (Object.keys(hooks).length === 0) {
    delete settings['hooks'];
  }
  return settings;
}

export function bootstrapState(): void {
  reconcileState(codexConfig().rootDir);
}
