#!/usr/bin/env node
// feynman — SessionStart hook — injects active diagram rules at session start.
// UserPromptSubmit still reinforces rules every turn; this primes fresh sessions.
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const HOME        = os.homedir();
const CLIENT_HOME = process.env.FEYNMAN_HOME || path.join(HOME, '.claude');
const FEYNMAN_DIR = path.join(CLIENT_HOME, '.feynman');
const STATE_PATH  = path.join(FEYNMAN_DIR, 'state.json');
const FLAG_PATH   = path.join(CLIENT_HOME, '.feynman-active');
const RULES_PATH  = path.join(__dirname, '..', 'rules', 'feynman-activate.md');

const DEFAULT_STATE = { enabled: true, intensity: 'full', injections: 0 };
const VALID_INTENSITIES = ['lite', 'full', 'ultra'];

function readState() {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
  } catch (_) {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state) {
  fs.mkdirSync(FEYNMAN_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function readRules(intensity) {
  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');
  const selected = VALID_INTENSITIES.includes(intensity) ? intensity : 'full';
  const openMarker  = '<!-- ' + selected + ' -->';
  const closeMarker = '<!-- /' + selected + ' -->';
  const i1 = rulesContent.indexOf(openMarker);
  const i2 = rulesContent.indexOf(closeMarker, i1);
  if (i1 === -1 || i2 === -1) return '';
  return rulesContent.slice(i1 + openMarker.length, i2).trim();
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    if (input.trim()) {
      const data = JSON.parse(input);
      const sessionId = data.session_id || '';
      if (sessionId && /[/\\]|\.\./.test(sessionId)) process.exit(0);
    }

    const stateExists = fs.existsSync(STATE_PATH);
    const flagExists = fs.existsSync(FLAG_PATH);
    const state = readState();

    if (!stateExists) {
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
