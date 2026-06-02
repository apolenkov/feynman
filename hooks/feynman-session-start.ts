#!/usr/bin/env node
// feynman — SessionStart hook — injects active diagram rules at session start.
// This is the primary injection hook (ADR 0003); it primes fresh, resumed,
// compacted, and cleared sessions.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { OUTPUT_STYLE_SUFFIX, readRulesForIntensity, reconcileState } from '../lib/feynman-state.ts';

// state.json / .feynman-active I/O now lives behind the store (ADR-0004), keyed by CLIENT_HOME.
const HOME        = os.homedir();
const CLIENT_HOME = process.env['FEYNMAN_HOME'] || path.join(HOME, '.claude');
const RULES_PATH  = process.env['FEYNMAN_RULES_PATH'] || path.join(import.meta.dirname, '..', 'rules', 'feynman-activate.md');

function readRules(intensity: string): string {
  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

  // Sanity: opening/closing intensity tags must balance (WR-02 cross-block guard)
  const opens  = (rulesContent.match(/<intensity\b/gi) || []).length;
  const closes = (rulesContent.match(/<\/intensity>/gi) || []).length;
  if (opens === 0 || opens !== closes) return '';

  return readRulesForIntensity(rulesContent, intensity);
}

let input = '';
process.stdin.on('data', (chunk: Buffer | string) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    if (input.trim()) {
      const data = JSON.parse(input);
      const sessionId: string = data.session_id || '';
      if (sessionId && /[/\\]|\.\./.test(sessionId)) process.exit(0);
    }

    // Reconcile state + flag via the store (ADR-0004): first-run bootstrap,
    // flag/enabled reconcile, corrupt-JSON fail-safe (self-heals a dangling flag).
    const { state, active } = reconcileState(CLIENT_HOME);
    if (!active) process.exit(0);

    let rulesText = readRules(state.intensity);
    if (!rulesText) process.exit(0);

    // Apply output_style suffix (Phase 10 STYLE-03) — same axis as activate hook.
    // Invalid values fall back to 'full' (no suffix) for safety.
    const styleValue = (typeof state.output_style === 'string') ? state.output_style : 'full';
    const styleSuffix = OUTPUT_STYLE_SUFFIX[styleValue];
    if (styleSuffix) {
      rulesText = rulesText + styleSuffix;
    }

    // SessionStart accepts plain stdout as context, matching caveman's hook shape.
    process.stdout.write(rulesText);
  } catch (_) {
    process.exit(0);
  }
});
