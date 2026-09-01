// Filesystem adapter for local Feynman state.
// The core model stays in lib/state; this module is the only owner of state I/O.

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE, normalizeState, type FeynmanState } from '../../lib/state/model.ts';

export interface StatePaths {
  feynmanDir: string;
  statePath: string;
  flagPath: string;
}

export function statePaths(rootDir: string): StatePaths {
  const feynmanDir = path.join(rootDir, '.feynman');
  return {
    feynmanDir,
    statePath: path.join(feynmanDir, 'state.json'),
    flagPath: path.join(rootDir, '.feynman-active'),
  };
}

export function flagContent(state: FeynmanState): string {
  return state.intensity || DEFAULT_STATE.intensity;
}

/** Read JSON without trusting it; normalize it before making a state decision. */
export function readState(rootDir: string): Record<string, unknown> | null {
  const { statePath } = statePaths(rootDir);
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch (_) {
    return null;
  }
}

export function writeState(rootDir: string, state: FeynmanState): void {
  const { feynmanDir, statePath } = statePaths(rootDir);
  fs.mkdirSync(feynmanDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

function unlinkFlag(flagPath: string): void {
  try { fs.unlinkSync(flagPath); } catch (_) { /* already absent */ }
}

function backupCorruptState(statePath: string): void {
  try { fs.renameSync(statePath, statePath + '.bak'); } catch (_) { /* overwrite below */ }
}

function bootstrapDefault(rootDir: string, flagPath: string, flagPresent: boolean): { state: FeynmanState; active: boolean } {
  const state = { ...DEFAULT_STATE };
  writeState(rootDir, state);
  if (!flagPresent) fs.writeFileSync(flagPath, flagContent(state));
  return { state, active: true };
}

/** Bootstrap, migrate, and reconcile state with the active flag. */
export function reconcileState(rootDir: string): { state: FeynmanState; active: boolean } {
  const { statePath, flagPath } = statePaths(rootDir);
  const stateExists = fs.existsSync(statePath);
  const flagPresent = fs.existsSync(flagPath);
  if (!stateExists) return bootstrapDefault(rootDir, flagPath, flagPresent);

  const raw = readState(rootDir);
  if (raw === null) {
    backupCorruptState(statePath);
    return bootstrapDefault(rootDir, flagPath, flagPresent);
  }

  const state = normalizeState(raw);

  if (!state.enabled) {
    unlinkFlag(flagPath);
    return { state, active: false };
  }
  if (!flagPresent) fs.writeFileSync(flagPath, flagContent(state));
  return { state, active: true };
}
