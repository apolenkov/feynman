// bin/adapters/codex-config.ts — Codex filesystem and hook-config adapter.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { reconcileState, statePaths } from './state-store.ts';
import { atomicWrite } from './fs.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type ValidatedHook = Readonly<Record<string, unknown>>;
export type ValidatedHookGroup = Readonly<
  Record<string, unknown> & { hooks: readonly ValidatedHook[] }
>;
export type ValidatedHookGroups = Readonly<Record<string, readonly ValidatedHookGroup[]>>;
export type ValidatedCodexConfig = Readonly<
  Record<string, unknown> & { hooks?: ValidatedHookGroups }
>;

function validSettings(value: unknown): value is ValidatedCodexConfig {
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
  readonly rootDir: string;
  readonly settingsPath: string;
  readonly feynmanDir: string;
  readonly statePath: string;
  readonly flagPath: string;
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
function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type FileReadResult =
  | { readonly kind: 'contents'; readonly text: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'error'; readonly message: string };

export type ConfigReadResult =
  | { readonly kind: 'ok'; readonly config: ValidatedCodexConfig }
  | { readonly kind: 'error'; readonly message: string };

function readOptionalFile(filePath: string): FileReadResult {
  try {
    return { kind: 'contents', text: fs.readFileSync(filePath, 'utf8') };
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return { kind: 'absent' };
    return { kind: 'error', message: `cannot read ${filePath}: ${errorMessage(err)}` };
  }
}

function parseJson(text: string): { readonly kind: 'ok'; readonly value: unknown } | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return { kind: 'ok', value: parsed };
  } catch {
    return null;
  }
}

export function inspectJsonConfig(filePath: string): ConfigReadResult {
  const read = readOptionalFile(filePath);
  if (read.kind === 'error') return read;
  if (read.kind === 'absent' || read.text.trim() === '') return { kind: 'ok', config: {} };
  const parsed = parseJson(read.text);
  if (parsed === null) {
    return {
      kind: 'error',
      message:
        `refusing to touch ${filePath}: file exists but is not valid JSON ` +
        `(trailing comma, comment, or truncated write?). Fix it by hand and re-run.`,
    };
  }
  return validSettings(parsed.value)
    ? { kind: 'ok', config: parsed.value }
    : {
        kind: 'error',
        message: `refusing to touch ${filePath}: expected a JSON object with valid hook groups`,
      };
}

export function readJsonConfig(filePath: string): ValidatedCodexConfig {
  const result = inspectJsonConfig(filePath);
  return result.kind === 'ok' ? result.config : fatal(result.message);
}

export function readSettings(): ValidatedCodexConfig {
  return readJsonConfig(codexConfig().settingsPath);
}

export function writeSettings(settings: ValidatedCodexConfig): void {
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

export function hasFeynmanHook(settings: ValidatedCodexConfig): boolean {
  return (settings.hooks?.['SessionStart'] ?? []).some((group) =>
    group.hooks.some((hook) => isSessionStartHookCommand(hook['command'])),
  );
}

export function hasAnyFeynmanHook(settings: ValidatedCodexConfig): boolean {
  const { hooks } = settings;
  if (!hooks) return false;
  return ['SessionStart', 'UserPromptSubmit', 'Stop'].some((eventName) =>
    (hooks[eventName] ?? []).some((group) =>
      group.hooks.some(
        (hook) => typeof hook['command'] === 'string' && isFeynmanHookCommand(hook['command']),
      ),
    ),
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
  if (words === null) return null;
  const offset = words[0]?.startsWith('FEYNMAN_HOME=') === true ? 1 : 0;
  const executable = words[offset];
  const script = words[offset + 1];
  return executable !== undefined &&
    path.basename(executable) === 'node' &&
    script !== undefined &&
    path.basename(script) === scriptName
    ? script
    : null;
}

const FEYNMAN_HOOK_EVENTS = new Set(['SessionStart', 'UserPromptSubmit', 'Stop']);

function removeFeynmanGroups(groups: readonly ValidatedHookGroup[]): readonly ValidatedHookGroup[] {
  return groups
    .map((group) => ({
      ...group,
      hooks: group.hooks.filter(
        (hook) => !(typeof hook['command'] === 'string' && isFeynmanHookCommand(hook['command'])),
      ),
    }))
    .filter((group) => group.hooks.length > 0);
}

export function removeFeynmanHooks(settings: ValidatedCodexConfig): ValidatedCodexConfig {
  if (!settings.hooks) return { ...settings };
  const hooks = Object.fromEntries(
    Object.entries(settings.hooks).flatMap(([eventName, groups]) => {
      const nextGroups = FEYNMAN_HOOK_EVENTS.has(eventName) ? removeFeynmanGroups(groups) : groups;
      return nextGroups.length === 0 ? [] : [[eventName, nextGroups]];
    }),
  );
  return Object.keys(hooks).length === 0
    ? Object.fromEntries(Object.entries(settings).filter(([key]) => key !== 'hooks'))
    : { ...settings, hooks };
}

export function bootstrapState(): void {
  reconcileState(codexConfig().rootDir);
}
