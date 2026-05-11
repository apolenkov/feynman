#!/usr/bin/env node
// feynman — SessionStart hook — injects active diagram rules at session start.
// UserPromptSubmit still reinforces rules every turn; this primes fresh sessions.

import fs from 'fs';
import path from 'path';
import os from 'os';

interface FeynmanState {
  enabled: boolean;
  intensity: string;
  output_style?: string;
  injections: number;
}

const HOME        = os.homedir();
const CLIENT_HOME = process.env.FEYNMAN_HOME || path.join(HOME, '.claude');
const FEYNMAN_DIR = path.join(CLIENT_HOME, '.feynman');
const STATE_PATH  = path.join(FEYNMAN_DIR, 'state.json');
const FLAG_PATH   = path.join(CLIENT_HOME, '.feynman-active');
const RULES_PATH  = path.join(import.meta.dirname, '..', 'rules', 'feynman-activate.md');

const DEFAULT_STATE: FeynmanState = { enabled: true, intensity: 'full', injections: 0 };
const VALID_INTENSITIES = ['lite', 'full', 'ultra'];

function writeState(state: FeynmanState): void {
  fs.mkdirSync(FEYNMAN_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function readRules(intensity: string): string {
  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');
  const selected = VALID_INTENSITIES.includes(intensity) ? intensity : 'full';

  // Sanity: opening/closing intensity tags must balance (WR-02 cross-block guard)
  const opens  = (rulesContent.match(/<intensity\b/gi) || []).length;
  const closes = (rulesContent.match(/<\/intensity>/gi) || []).length;
  if (opens === 0 || opens !== closes) return '';

  // XML matcher map: tolerate trailing attributes (WR-01) and case (WR-03)
  const xmlMatchers: Record<string, RegExp> = {
    lite:  /<intensity\s+name\s*=\s*["']lite["'][^>]*>([\s\S]*?)<\/intensity>/i,
    full:  /<intensity\s+name\s*=\s*["']full["'][^>]*>([\s\S]*?)<\/intensity>/i,
    ultra: /<intensity\s+name\s*=\s*["']ultra["'][^>]*>([\s\S]*?)<\/intensity>/i,
  };
  const xmlMatch = xmlMatchers[selected].exec(rulesContent);
  if (xmlMatch) return xmlMatch[1].trim();

  // Legacy HTML-comment fallback
  const openMarker  = '<!-- ' + selected + ' -->';
  const closeMarker = '<!-- /' + selected + ' -->';
  const i1 = rulesContent.indexOf(openMarker);
  const i2 = rulesContent.indexOf(closeMarker, i1);
  if (i1 === -1 || i2 === -1) return '';
  return rulesContent.slice(i1 + openMarker.length, i2).trim();
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

    const rulesText = readRules(state.intensity);
    if (!rulesText) process.exit(0);

    // SessionStart accepts plain stdout as context, matching caveman's hook shape.
    process.stdout.write(rulesText);
  } catch (_) {
    process.exit(0);
  }
});
