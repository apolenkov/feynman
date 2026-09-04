#!/usr/bin/env node
// feynman — SessionStart hook — injects active diagram rules at session start.
// This is the primary injection hook (ADR 0003); it primes fresh, resumed,
// compacted, and cleared sessions.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { applyOutputStyle, assertTagPairs, readRulesForIntensity } from '../lib/state/index.ts';
import { reconcileState, recordInjection } from '../bin/adapters/state-store.ts';

// state.json / .feynman-active I/O now lives behind the store (ADR-0004), keyed by CLIENT_HOME.
const HOME = os.homedir();
const CLIENT_HOME = process.env['FEYNMAN_HOME'] || path.join(HOME, '.codex');
const RULES_PATH =
  process.env['FEYNMAN_RULES_PATH'] ||
  path.join(import.meta.dirname, '..', 'rules', 'feynman-contract.md');

function readRules(intensity: string): string {
  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

  // Sanity: <intensity> tag pairs must balance (WR-02).
  if (!assertTagPairs(rulesContent)) return '';

  return readRulesForIntensity(rulesContent, intensity);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    if (input.trim()) {
      const data: unknown = JSON.parse(input);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) process.exit(0);
      const sessionId = 'session_id' in data ? data.session_id : '';
      if (typeof sessionId !== 'string' || /[/\\]|\.\./.test(sessionId)) process.exit(0);
    }

    // Reconcile state + flag via the store (ADR-0004): first-run bootstrap,
    // flag/enabled reconcile, corrupt-JSON fail-safe (self-heals a dangling flag).
    const { state, active } = reconcileState(CLIENT_HOME);
    if (!active) process.exit(0);

    let rulesText = readRules(state.intensity);
    if (!rulesText) process.exit(0);

    // Apply output_style suffix (Phase 10 STYLE-03).
    // Shared helper: invalid values fall back to 'full' (no suffix) for safety.
    rulesText = applyOutputStyle(rulesText, state.output_style);

    // Count only successful rule injections. The write is advisory: a read-only
    // state directory must not prevent an otherwise valid SessionStart hook from
    // supplying its rules.
    try {
      recordInjection(CLIENT_HOME);
    } catch (_) {
      // Keep injection available when local state bookkeeping cannot be updated.
    }

    // SessionStart accepts plain stdout as context, matching caveman's hook shape.
    process.stdout.write(rulesText);
  } catch (_) {
    process.exit(0);
  }
});
