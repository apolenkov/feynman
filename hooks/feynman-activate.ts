#!/usr/bin/env node
// feynman — UserPromptSubmit hook — injects ASCII diagram rules on every prompt
// Zero dependencies. ESM + TypeScript (Node.js v22.6+ strip-types — runs .ts directly).
// Bug workarounds: #13912 (JSON stdout), #35713 (flag file), #8810 (os.homedir), #10225 (no hooks in plugin.json)

import fs from 'fs';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';
import { type FeynmanState, DEFAULT_STATE, OUTPUT_STYLE_SUFFIX, readRulesForIntensity } from '../lib/feynman-state.ts';

// Path constants — use os.homedir(), never tilde strings (bug #8810).
// FEYNMAN_HOME lets the same hook serve Claude Code (~/.claude) and Codex (~/.codex).
const HOME        = os.homedir();
const CLIENT_HOME = process.env['FEYNMAN_HOME'] || path.join(HOME, '.claude');
const FEYNMAN_DIR = path.join(CLIENT_HOME, '.feynman');
const STATE_PATH  = path.join(FEYNMAN_DIR, 'state.json');
const FLAG_PATH   = path.join(CLIENT_HOME, '.feynman-active');
const RULES_PATH  = process.env['FEYNMAN_RULES_PATH'] || path.join(import.meta.dirname, '..', 'rules', 'feynman-activate.md');

// Sanity-check: opening and closing <intensity> tags must balance (WR-01/02/03).
// Called before block extraction to prevent lazy-quantifier cross-contamination.
// Returns true when counts match (including 0===0 for non-XML files).
export function assertTagPairs(content: string): boolean {
  const opens  = (content.match(/<intensity\s+name\s*=/gi) || []).length;
  const closes = (content.match(/<\/intensity>/gi)         || []).length;
  return opens === closes;
}

// Fallback injected when rules file is malformed (WR-02).
// Short enough to stay well under the 10 000-char additionalContext cap.
export const MALFORMED_FALLBACK = 'Classify structure → choose smallest visual: prose<glyph<dot-leader<tree<table<frame.';

// --- main script: stdin accumulator — buffer all input before processing ---
// ESM equivalent of require.main === module (guards stdin so named imports don't hang tests)
// fs.realpathSync normalises macOS /var → /private/var symlink so comparison is stable
const isMain = import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1]!)).href;
if (isMain) {
let input = '';
process.stdin.on('data', (chunk: Buffer | string) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // Step 1: session_id path-traversal guard (verified from gsd-context-monitor.js)
    const sessionId: string = data.session_id || '';
    if (sessionId && /[/\\]|\.\./.test(sessionId)) process.exit(0);

    // Step 2: flag file + first-run bootstrap (D-05, D-07, bug #35713)
    // True first run: neither flag nor state exists -> bootstrap default full mode.
    // Intentionally disabled: flag absent + state.enabled=false -> exit 0.
    const flagExists  = fs.existsSync(FLAG_PATH);
    const stateExists = fs.existsSync(STATE_PATH);
    if (!flagExists) {
      if (!stateExists) {
        // First install: bootstrap and activate full mode.
        fs.mkdirSync(FEYNMAN_DIR, { recursive: true });
        fs.writeFileSync(STATE_PATH, JSON.stringify(DEFAULT_STATE, null, 2));
        fs.writeFileSync(FLAG_PATH, DEFAULT_STATE.intensity);
      } else {
        let existingState: FeynmanState;
        try {
          existingState = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
        } catch (_) {
          process.exit(0);
        }
        if (!existingState!.enabled) process.exit(0);
        fs.writeFileSync(FLAG_PATH, existingState!.intensity || DEFAULT_STATE.intensity);
      }
    }

    // Step 3: read state.json
    let state: FeynmanState;
    try {
      state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch (e) {
      // Corrupt state — fail safe per D-07
      process.exit(0);
    }

    // Step 4: enabled check
    if (!state!.enabled) process.exit(0);

    // Step 5: read rules file and extract the correct intensity variant (D-01, D-02, HOOK-04)
    // Dual-format: tries XML <intensity name="..."> first, falls back to HTML comments.
    // Fallback kept until Plan 02 rule-file rewrite lands (CONTEXT.md Area G migration).
    let rulesText: string;
    try {
      const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

      // Sanity: <intensity> tag pairs must balance (WR-01/02/03).
      // On mismatch: mark state malformed, inject short fallback, continue (no silent disable).
      if (!assertTagPairs(rulesContent)) {
        state!.malformed_rules = true;
        try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); } catch (_) {}
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: MALFORMED_FALLBACK,
          }
        }));
        process.exit(0);
      }
      // Rules file is well-formed — clear any previous malformed_rules flag.
      if (state!.malformed_rules) {
        delete state!.malformed_rules;
      }

      // Delegate intensity-block extraction to shared core (lib/feynman-state.ts).
      rulesText = readRulesForIntensity(rulesContent, state!.intensity);
      // Empty means the block was not found (no XML or legacy marker) — exit silently.
      if (!rulesText) process.exit(0);
    } catch (e) {
      // Rules file missing — self-heal silently (pitfall 6 in RESEARCH.md)
      process.exit(0);
    }

    // Step 5.5: append output_style suffix (Phase 10 STYLE-03)
    // Orthogonal axis to intensity: intensity controls rules-file SIZE,
    // output_style controls visual verbosity in the model's response.
    // Invalid values fall back to 'full' (no suffix) for safety.
    const styleValue = (typeof state!.output_style === 'string') ? state!.output_style : 'full';
    const styleSuffix = OUTPUT_STYLE_SUFFIX[styleValue]; // undefined for 'full' or invalid
    if (styleSuffix) {
      rulesText = rulesText + styleSuffix;
    }

    // Step 6: increment injection counter and write state back (HOOK-05)
    // Backward-compat: read legacy count field on first migration cycle
    state!.injections = (state!.injections ?? state!.count ?? 0) + 1;
    delete state!.count;
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
} // end isMain
