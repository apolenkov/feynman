// bin/cli/targets.ts — target config helpers
// targetNames, parseTarget, hookCommandFor, readIntensityRules

import fs from 'node:fs';
import path from 'node:path';
import { readRulesForIntensity } from '../../lib/feynman-state.ts';
import { targetConfig } from './settings.ts';

// ROOT_DIR: two levels up from bin/cli/ → repo root
const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');

// Hook script lives relative to this file.
// Prefer .ts (dev with strip-types); fall back to .js (installed npm package).
const _hookExt = fs.existsSync(path.resolve(import.meta.dirname, '..', '..', 'hooks', 'feynman-activate.ts')) ? '.ts' : '.js';
const HOOK_PATH = path.resolve(import.meta.dirname, '..', '..', 'hooks', `feynman-activate${_hookExt}`);

const TARGET_ALIASES: Record<string, string> = {};
const VALID_TARGETS = ['claude', 'codex', 'opencode', 'both', 'all', '*'];

export function targetNames(target: string): string[] {
  if (target === 'both') return ['claude', 'codex'];
  if (target === 'all' || target === '*') return ['claude', 'codex', 'opencode'];
  return [target];
}

export function parseTarget(args: string[], fallback = 'codex'): { target: string; args: string[] } {
  let target = fallback;
  const keep: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--target') {
      target = args[++i] ?? target;
    } else if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length);
    } else {
      keep.push(arg);
    }
  }
  if (!VALID_TARGETS.includes(target)) {
    console.error(`feynman: invalid --target '${target}' (expected claude, codex, opencode, both, all, or *)`);
    process.exit(2);
  }
  target = TARGET_ALIASES[target] ?? target;
  return { target, args: keep };
}

// Read rules content at a given intensity level from feynman-activate.md.
// Delegates to shared readRulesForIntensity; falls back to the whole file on miss.
export function readIntensityRules(intensity: string): string {
  const rulesPath = path.resolve(ROOT_DIR, 'rules', 'feynman-activate.md');
  const content = fs.readFileSync(rulesPath, 'utf8');
  const block = readRulesForIntensity(content, intensity);
  return block || content;
}

export function hookCommandFor(target: string): string {
  const cfg = targetConfig(target);
  return `FEYNMAN_HOME="${cfg.rootDir}" node "${HOOK_PATH}"`;
}
