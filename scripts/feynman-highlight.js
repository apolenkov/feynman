#!/usr/bin/env node
// scripts/feynman-highlight.js — apply highlight convention to rules/feynman-activate.md.
// Adds: **markdown bold** for key nouns/verbs in prose, plus ▲▼ priority and
// ✓ ✗ ⌛ status markers (for terminal contrast — Claude Code renders bold via ANSI).
//
// Idempotent: detects existing marker line and skips if present. Verifies the
// 4480-byte budget after the edit.
//
// Usage:
//   node scripts/feynman-highlight.js              apply
//   node scripts/feynman-highlight.js --dry-run    print proposed edits, no write
//   node scripts/feynman-highlight.js --revert     remove highlight lines
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const RULES = path.join(ROOT, 'rules', 'feynman-activate.md');
const BUDGET = 4480;

const MARKER_LINE = '**bold** keys; ▲▼ priority; ✓✗ status.';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const revert = args.includes('--revert');

function loadRules() {
  return fs.readFileSync(RULES, 'utf8');
}

function applyHighlight(text) {
  if (text.includes(MARKER_LINE)) {
    return { text, added: 0, note: 'marker line already present — no change' };
  }
  // Insert the marker as a new line at the end of each <contract> block,
  // before the closing tag. Single insertion per block.
  let added = 0;
  const updated = text.replace(/(<\/contract>)/g, (m) => {
    added += 1;
    return `${MARKER_LINE}\n${m}`;
  });
  return { text: updated, added, note: `added marker to ${added} <contract> blocks` };
}

function revertHighlight(text) {
  const escaped = MARKER_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\n`, 'g');
  const removed = (text.match(re) || []).length;
  return { text: text.replace(re, ''), added: -removed, note: `removed ${removed} marker lines` };
}

function checkBudget(text, label) {
  const size = Buffer.byteLength(text, 'utf8');
  console.log(`  ${label}: ${size} bytes (budget ≤${BUDGET}, slack ${BUDGET - size})`);
  if (size > BUDGET) {
    throw new Error(`size ${size} exceeds budget ${BUDGET} — refusing to write`);
  }
  return size;
}

function runTests() {
  const r = spawnSync('npm', ['test', '--silent'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || '');
    throw new Error('npm test failed after edit — reverting');
  }
}

function main() {
  const original = loadRules();
  checkBudget(original, 'before');

  const op = revert ? revertHighlight : applyHighlight;
  const { text, added, note } = op(original);
  console.log(`  ${note}`);

  if (text === original) {
    console.log('no changes needed');
    return;
  }

  checkBudget(text, 'after');

  if (dryRun) {
    console.log(`  dry-run — not writing. ${added > 0 ? '+' : ''}${added} marker line(s) ${revert ? 'would be removed' : 'would be added'}.`);
    return;
  }

  fs.writeFileSync(RULES, text);
  console.log(`  wrote ${RULES}`);

  runTests();
  console.log('  npm test: pass');
}

try { main(); }
catch (e) { console.error('error:', e.message); process.exit(1); }
