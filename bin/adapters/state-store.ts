// Filesystem adapter for local Feynman state.
// The core model stays in lib/state; this module is the only owner of state I/O.

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE, normalizeState, type FeynmanState } from '../../lib/state/model.ts';
import { atomicWrite } from './fs.ts';

export interface StatePaths {
  feynmanDir: string;
  statePath: string;
  flagPath: string;
  injectionsPath: string;
}

export function statePaths(rootDir: string): StatePaths {
  const feynmanDir = path.join(rootDir, '.feynman');
  return {
    feynmanDir,
    statePath: path.join(feynmanDir, 'state.json'),
    flagPath: path.join(rootDir, '.feynman-active'),
    injectionsPath: path.join(feynmanDir, 'injections'),
  };
}

export function flagContent(state: FeynmanState): string {
  return state.intensity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function readStateFiles({ statePath, injectionsPath }: StatePaths): Record<string, unknown> | null {
  const preferences = fs.readFileSync(statePath, 'utf8');
  try {
    const state: unknown = JSON.parse(preferences);
    if (!isRecord(state)) return null;
    try {
      const text = fs.readFileSync(injectionsPath, 'utf8').trim();
      const injections = Number(text);
      if (/^\d+$/.test(text) && Number.isSafeInteger(injections)) return { ...state, injections };
    } catch {
      /* Bookkeeping is optional; preferences remain readable. */
    }
    return state;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/** Read JSON without trusting it; normalize it before making a state decision. */
export function readState(rootDir: string): Record<string, unknown> | null {
  try {
    return readStateFiles(statePaths(rootDir));
  } catch {
    return null;
  }
}

/** Advisory bookkeeping must never write a stale snapshot of user preferences. */
export function recordInjection(rootDir: string): void {
  const raw = readState(rootDir);
  if (raw === null) return;
  const state = normalizeState(raw);
  if (!state.enabled || state.injections === Number.MAX_SAFE_INTEGER) return;
  atomicWrite(statePaths(rootDir).injectionsPath, String(state.injections + 1) + '\n');
}

export function writeState(rootDir: string, state: FeynmanState): void {
  const { feynmanDir, statePath } = statePaths(rootDir);
  fs.mkdirSync(feynmanDir, { recursive: true });
  atomicWrite(statePath, JSON.stringify(state, null, 2) + '\n');
}

export function removeActiveFlag(rootDir: string): void {
  try {
    fs.unlinkSync(statePaths(rootDir).flagPath);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
}

function backupCorruptState(statePath: string): void {
  // A failed backup is not permission to overwrite the only remaining copy.
  fs.renameSync(statePath, statePath + '.bak');
}

function bootstrapDefault(
  rootDir: string,
  flagPath: string,
): { state: FeynmanState; active: boolean } {
  const state = { ...DEFAULT_STATE };
  writeState(rootDir, state);
  atomicWrite(flagPath, flagContent(state));
  return { state, active: true };
}

/** Bootstrap, migrate, and reconcile state with the active flag. */
export function reconcileState(rootDir: string): { state: FeynmanState; active: boolean } {
  const paths = statePaths(rootDir);
  const { statePath, flagPath } = paths;
  if (fs.lstatSync(statePath, { throwIfNoEntry: false }) === undefined)
    return bootstrapDefault(rootDir, flagPath);

  const raw = readStateFiles(paths);
  if (raw === null) {
    backupCorruptState(statePath);
    return bootstrapDefault(rootDir, flagPath);
  }

  const state = normalizeState(raw);

  if (!state.enabled) {
    removeActiveFlag(rootDir);
    return { state, active: false };
  }
  let activeFlag: string | undefined;
  try {
    activeFlag = fs.readFileSync(flagPath, 'utf8');
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  if (activeFlag !== flagContent(state)) atomicWrite(flagPath, flagContent(state));
  return { state, active: true };
}

/** Keep preference and active-flag mutations in the same filesystem adapter. */
export function changeState(
  rootDir: string,
  change: Readonly<Partial<FeynmanState>>,
): FeynmanState {
  const state = { ...reconcileState(rootDir).state, ...change };
  writeState(rootDir, state);
  if (state.enabled) atomicWrite(statePaths(rootDir).flagPath, flagContent(state));
  else removeActiveFlag(rootDir);
  return state;
}
