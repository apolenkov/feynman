// lib/feynman-state.ts — canonical FeynmanState store: schema, defaults, style map,
// and the single owner of state.json + .feynman-active flag I/O (ADR-0004).
// Imported by hooks/feynman-activate.ts, hooks/feynman-session-start.ts, bin/feynman.ts.
// Zero runtime dependencies (node: builtins only). ESM + TypeScript (Node.js v22.6+ strip-types).

import fs from 'node:fs';
import path from 'node:path';

export interface FeynmanState {
  enabled: boolean;
  intensity: string;
  output_style?: string;
  injections: number;
  malformed_rules?: boolean;
  /** @deprecated legacy field, migrated to injections */
  count?: number;
}

export const DEFAULT_STATE: FeynmanState = {
  enabled: true,
  intensity: 'full',
  output_style: 'full',
  injections: 0,
};

// One-line suffix per output_style. `full` is the default — no suffix.
// Suffix is appended to additionalContext after the rules text (Phase 10
// STYLE-03). Keeps rules-file 4480-byte budget intact — pure runtime hint.
export const OUTPUT_STYLE_SUFFIX: Record<string, string> = {
  short:  '\n\nOutput style: short — dot-leader and inline glyphs only; no frames, no ASCII art, no trees.',
  middle: '\n\nOutput style: middle — frame blocks only for ≥6 items; prefer trees and markdown tables.',
};

// ─── Rules extraction ─────────────────────────────────────────────────────────

const VALID_INTENSITIES = ['lite', 'full', 'ultra'];

// XML matcher map: tolerate trailing attributes (WR-01) and case (WR-03).
const XML_MATCHERS: Record<string, RegExp> = {
  lite:  /<intensity\s+name\s*=\s*["']lite["'][^>]*>([\s\S]*?)<\/intensity>/i,
  full:  /<intensity\s+name\s*=\s*["']full["'][^>]*>([\s\S]*?)<\/intensity>/i,
  ultra: /<intensity\s+name\s*=\s*["']ultra["'][^>]*>([\s\S]*?)<\/intensity>/i,
};

/**
 * Extract the intensity-gated block from rules file content.
 *
 * Supports XML format (<intensity name="X">…</intensity>) and legacy
 * HTML-comment format (<!-- X --> … <!-- /X -->). Returns the extracted block
 * as a trimmed string, or '' if the intensity block is not found.
 *
 * Callers are responsible for their own policy (malformed-rules handling,
 * tag-pair sanity checks, fallback to whole file, etc.).
 */
export function readRulesForIntensity(rulesContent: string, intensity: string): string {
  const selected = VALID_INTENSITIES.includes(intensity) ? intensity : 'full';

  const xmlMatch = XML_MATCHERS[selected]!.exec(rulesContent);
  if (xmlMatch) return xmlMatch[1]!.trim();

  // Legacy HTML-comment fallback (kept until Plan 02 rule-file rewrite lands).
  const openMarker  = '<!-- ' + selected + ' -->';
  const closeMarker = '<!-- /' + selected + ' -->';
  const i1 = rulesContent.indexOf(openMarker);
  const i2 = rulesContent.indexOf(closeMarker, i1);
  if (i1 !== -1 && i2 !== -1) return rulesContent.slice(i1 + openMarker.length, i2).trim();

  return '';
}

// ─── State store (ADR-0004) ───────────────────────────────────────────────────
// The single owner of state.json + .feynman-active flag I/O. All three callers
// (both hooks via FEYNMAN_HOME, the CLI via targetConfig(t).rootDir) cross this
// seam instead of open-coding JSON.parse(fs.readFileSync(statePath)).

interface StatePaths {
  feynmanDir: string;
  statePath: string;
  flagPath: string;
}

// Path layout is identical across hooks and CLI: <rootDir>/.feynman/state.json
// for state, <rootDir>/.feynman-active for the presence flag. Exported so the CLI
// (targetConfig) derives the same paths instead of re-hardcoding the literals.
export function statePaths(rootDir: string): StatePaths {
  const feynmanDir = path.join(rootDir, '.feynman');
  return {
    feynmanDir,
    statePath: path.join(feynmanDir, 'state.json'),
    flagPath: path.join(rootDir, '.feynman-active'),
  };
}

function unlinkFlag(flagPath: string): void {
  try { fs.unlinkSync(flagPath); } catch (_) { /* already absent — fine */ }
}

// The .feynman-active flag stores the active intensity; fall back to the default.
export function flagContent(state: FeynmanState): string {
  return state.intensity || DEFAULT_STATE.intensity;
}

/**
 * Raw read of state.json — pure, no side effects, **no** DEFAULT_STATE merge.
 * Returns `null` on a missing, corrupt, or non-object file (a bare JSON primitive
 * like `42` is treated as corrupt — callers can safely `'enabled' in state`).
 *
 * Kept raw on purpose: `doctor` check #4 (`'enabled' in state`) must be able to
 * see a state object that lacks `enabled`. A defaulted merge would always inject
 * `enabled` and silently make that check always-pass. For doctor and install
 * introspection only — hooks use reconcileState, which merges.
 */
export function readState(rootDir: string): FeynmanState | null {
  const { statePath } = statePaths(rootDir);
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as FeynmanState;
  } catch (_) {
    return null;
  }
}

/** Write state.json (creating <rootDir>/.feynman if needed). Trailing newline (POSIX). */
export function writeState(rootDir: string, state: FeynmanState): void {
  const { feynmanDir, statePath } = statePaths(rootDir);
  fs.mkdirSync(feynmanDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

/**
 * The mutating policy shared by both injection hooks: bootstrap default state if
 * absent, merge with DEFAULT_STATE, reconcile the flag with `enabled`, and
 * fail-safe on corrupt JSON. The name signals the side effects (it writes and
 * deletes files), unlike a plain `loadState`.
 *
 * One canonical rule for both hooks: **not active + flag present → unlink the
 * flag**. This preserves #35713 (flag absent + enabled=false → flag not
 * recreated, active=false) and self-heals the two cases the legacy activate hook
 * used to leave dangling (corrupt JSON; valid enabled=false). It also converges
 * the legacy activate hook onto session-start's first-run self-heal: a missing
 * state.json now bootstraps and activates regardless of the flag (the legacy
 * activate hook skipped bootstrap when the flag was present). See ADR-0004.
 *
 * Returns the merged state and whether the caller should inject (`active`). When
 * `active` is false the returned `state` is not meant to be used.
 */
export function reconcileState(rootDir: string): { state: FeynmanState; active: boolean } {
  const { statePath, flagPath } = statePaths(rootDir);
  const stateExists = fs.existsSync(statePath);
  const flagPresent = fs.existsSync(flagPath);

  // First run: no state.json → bootstrap default full mode and activate.
  if (!stateExists) {
    const state = { ...DEFAULT_STATE };
    writeState(rootDir, state);
    if (!flagPresent) fs.writeFileSync(flagPath, flagContent(state));
    return { state, active: true };
  }

  // State exists — raw read distinguishes corrupt (null) from present.
  const raw = readState(rootDir);
  if (raw === null) {
    // Corrupt JSON → fail-safe: not active, unlink a dangling flag (canonical rule).
    unlinkFlag(flagPath);
    return { state: { ...DEFAULT_STATE }, active: false };
  }

  const state = { ...DEFAULT_STATE, ...raw };
  // Preserve the legacy count→injections migration from the RAW value: the merge
  // would otherwise default injections to 0 and hide an absent field, breaking
  // the fallback. Read from raw so absence is still detectable.
  state.injections = raw.injections ?? raw.count ?? DEFAULT_STATE.injections;
  delete state.count;

  // Disabled → canonical rule: not active + flag present → unlink. Not active.
  if (!state.enabled) {
    unlinkFlag(flagPath);
    return { state, active: false };
  }

  // Enabled → ensure the flag is present, then active.
  if (!flagPresent) {
    fs.writeFileSync(flagPath, flagContent(state));
  }
  return { state, active: true };
}
