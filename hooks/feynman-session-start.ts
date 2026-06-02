#!/usr/bin/env node
// feynman — SessionStart hook — injects active diagram rules at session start.
// This is the primary injection hook (ADR 0003); it primes fresh, resumed,
// compacted, and cleared sessions.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { type FeynmanState, DEFAULT_STATE, OUTPUT_STYLE_SUFFIX, readRulesForIntensity } from '../lib/feynman-state.ts';

const HOME        = os.homedir();
const CLIENT_HOME = process.env['FEYNMAN_HOME'] || path.join(HOME, '.claude');
const FEYNMAN_DIR = path.join(CLIENT_HOME, '.feynman');
const STATE_PATH  = path.join(FEYNMAN_DIR, 'state.json');
const FLAG_PATH   = path.join(CLIENT_HOME, '.feynman-active');
const RULES_PATH  = process.env['FEYNMAN_RULES_PATH'] || path.join(import.meta.dirname, '..', 'rules', 'feynman-activate.md');

function writeState(state: FeynmanState): void {
  fs.mkdirSync(FEYNMAN_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

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

    const stateExists = fs.existsSync(STATE_PATH);
    const flagExists = fs.existsSync(FLAG_PATH);
    let state: FeynmanState = { ...DEFAULT_STATE };

    if (stateExists) {
      try {
        state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
      } catch (_) {
        try { fs.unlinkSync(FLAG_PATH); } catch (_) {}
        process.exit(0);
      }
    } else {
      writeState(state);
    }

    if (!state.enabled) {
      try { fs.unlinkSync(FLAG_PATH); } catch (_) {}
      process.exit(0);
    }

    if (!flagExists) {
      fs.writeFileSync(FLAG_PATH, state.intensity || DEFAULT_STATE.intensity);
    }

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
