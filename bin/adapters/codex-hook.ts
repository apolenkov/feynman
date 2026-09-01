// bin/adapters/codex-hook.ts — Codex SessionStart command adapter.

import fs from 'node:fs';
import path from 'node:path';
import { codexConfig } from './codex-config.ts';

// Prefer .ts in development and .js in the published package.
const _hookExt = fs.existsSync(path.resolve(import.meta.dirname, '..', '..', 'hooks', 'feynman-session-start.ts')) ? '.ts' : '.js';
const HOOK_PATH = path.resolve(import.meta.dirname, '..', '..', 'hooks', `feynman-session-start${_hookExt}`);

export function sessionStartHookCommand(): string {
  return `FEYNMAN_HOME="${codexConfig().rootDir}" node "${HOOK_PATH}"`;
}
