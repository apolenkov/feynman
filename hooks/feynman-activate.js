#!/usr/bin/env node
// feynman — UserPromptSubmit hook — injects ASCII diagram rules on every prompt
// Zero dependencies. CJS only (no ESM — matches caveman pattern).
// Bug workarounds: #13912 (JSON stdout), #35713 (flag file), #8810 (os.homedir), #10225 (no hooks in plugin.json)
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Path constants — use os.homedir(), never tilde strings (bug #8810)
const HOME        = os.homedir();
const FEYNMAN_DIR = path.join(HOME, '.claude', '.feynman');
const STATE_PATH  = path.join(FEYNMAN_DIR, 'state.json');
const FLAG_PATH   = path.join(HOME, '.claude', '.feynman-active');
const RULES_PATH  = path.join(__dirname, '..', 'rules', 'feynman-activate.md');

const DEFAULT_STATE = { enabled: true, intensity: 'full', count: 0 };

// --- stdin accumulator — exact caveman-mode-tracker.js pattern ---
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // Step 1: session_id path-traversal guard (verified from gsd-context-monitor.js)
    const sessionId = data.session_id || '';
    if (sessionId && /[/\\]|\.\./.test(sessionId)) process.exit(0);

    // Step 2: flag file + first-run bootstrap (D-05, D-07, bug #35713)
    // True first run: neither flag nor state exists → bootstrap both, then fall through
    // Intentionally disabled: flag absent but state exists → exit 0 (user ran /feynman off)
    const flagExists  = fs.existsSync(FLAG_PATH);
    const stateExists = fs.existsSync(STATE_PATH);
    if (!flagExists) {
      if (!stateExists) {
        // First install — bootstrap everything and activate
        fs.mkdirSync(FEYNMAN_DIR, { recursive: true });
        fs.writeFileSync(STATE_PATH, JSON.stringify(DEFAULT_STATE, null, 2));
        fs.writeFileSync(FLAG_PATH, DEFAULT_STATE.intensity);
      } else {
        process.exit(0); // disabled intentionally by user
      }
    }

    // Step 3: read state.json
    let state;
    try {
      state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch (e) {
      // Corrupt state — fail safe per D-07
      process.exit(0);
    }

    // Step 4: enabled check
    if (!state.enabled) process.exit(0);

    // Step 5: read rules file and extract the correct intensity variant (D-01, D-02, HOOK-04)
    let rulesText;
    try {
      const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');
      const validIntensities = ['lite', 'full', 'ultra'];
      const intensity = validIntensities.includes(state.intensity) ? state.intensity : 'full';
      const openMarker  = '<!-- ' + intensity + ' -->';
      const closeMarker = '<!-- /' + intensity + ' -->';
      const i1 = rulesContent.indexOf(openMarker);
      const i2 = rulesContent.indexOf(closeMarker, i1);
      if (i1 === -1 || i2 === -1) process.exit(0); // marker not found — malformed rules file
      rulesText = rulesContent.slice(i1 + openMarker.length, i2).trim();
    } catch (e) {
      // Rules file missing — self-heal silently (pitfall 6 in RESEARCH.md)
      process.exit(0);
    }

    if (!rulesText) process.exit(0);

    // Step 6: increment session counter and write state back (HOOK-05)
    state.count = (state.count || 0) + 1;
    try {
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
      // Counter write failure is non-fatal — still inject rules
    }

    // Step 7: output rules as additionalContext (bug #13912 — JSON only, no trailing newline)
    // Plain text stdout triggers "UserPromptSubmit hook error" red banner in Claude Code UI
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: rulesText
      }
    }));

  } catch (e) {
    // Silent fail — never surface hook errors in Claude Code UI
    process.exit(0);
  }
});
