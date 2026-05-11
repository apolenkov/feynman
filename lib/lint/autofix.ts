// lib/lint/autofix.ts — pure-function autofix for ASCII frame blocks.
// Repairs misaligned │ / ┌─┐ / └─┘ borders so the right edge lines up.
// Zero deps. ESM only. No I/O — text in, text out.

import { visualWidth } from './width.ts';

// Strip indent prefix and the outer │ chars from an inner line. Returns the
// raw cell content without trailing space.
function unwrapInner(line: string, indent: string): string {
  let s = line;
  if (indent && s.startsWith(indent)) s = s.slice(indent.length);
  // Drop leading │ and trailing │ (the latter may have padding before it).
  s = s.replace(/^│/, '').replace(/\s*│\s*$/, '');
  return s;
}

export interface FrameNodeFull {
  kind?: string;
  top: string;
  inner: string[];
  bottom: string;
  indent: string;
}

export function autofixFrame(node: FrameNodeFull): string {
  const indent = node.indent || '';
  const inner = node.inner.map(line => unwrapInner(line, indent));
  // Compute target inner width. Floor on the top border's dash count so a
  // deliberately-wide clean frame stays idempotent (we don't squeeze it down
  // to the smallest content width). Min 1 to avoid degenerate ┌┐.
  const topDashes = (node.top && node.top.match(/─/g) || []).length;
  const W = Math.max(1, topDashes, ...inner.map(visualWidth));
  const dash = '─'.repeat(W);
  const top = indent + '┌' + dash + '┐';
  const bot = indent + '└' + dash + '┘';
  const fixed = inner.map(content => {
    const pad = ' '.repeat(Math.max(0, W - visualWidth(content)));
    return indent + '│' + content + pad + '│';
  });
  return [top, ...fixed, bot].join('\n');
}

// STATE-marker allowlist (per D-09-04-03 in PLAN frontmatter, see also
// .planning/notes/autonomous-log-2026-05-11.md). A trailing token in an
// inner line counts as a "state" if it matches one of these patterns.
// Cyrillic literals + ASCII glyphs; case-insensitive for ASCII.
const STATE_MARKER_RE = /(← (?:готов|решение|заморожено|в работе|блок:[^│\n]+))|((?:✓|✗|◐|⌛|→) \S+)|\b(done|pending|wip|ok|fail|wait)\b\s*$/i;

type RowKind =
  | { kind: 'pattern'; label: string; state: string }
  | { kind: 'bullet'; content: string };

/**
 * Convert a frame node (≤5 inner lines, no tree, no embedded table) to a
 * dot-leader list. Each inner line becomes one row:
 *   - "<label>  <state>" pattern → "<label> <dots> <state>" column-aligned
 *   - free-form prose             → "- <content>" bullet
 * Border lines stripped. Indentation preserved.
 * @param {{top:string, inner:string[], bottom:string, indent:string}} node
 * @returns {string}
 */
export function autofixFrameToDotLeader(node: FrameNodeFull): string {
  const indent = node.indent || '';
  const stripped = node.inner.map(line => unwrapInner(line, indent).trim());

  // Classify each row: pattern (label + state) or free-form
  const rows: RowKind[] = stripped.map(content => {
    // Match trailing STATE marker.
    const re = new RegExp(STATE_MARKER_RE.source, STATE_MARKER_RE.flags);
    const stateMatch = content.match(re);
    if (!stateMatch) return { kind: 'bullet' as const, content };
    const state = stateMatch[0].trim();
    const stateIdx = content.lastIndexOf(state);
    // Label = everything before state, with trailing dots/whitespace stripped.
    let label = content.slice(0, stateIdx).replace(/[\s.]+$/, '');
    if (!label) return { kind: 'bullet' as const, content };
    return { kind: 'pattern' as const, label, state };
  });

  // Mixed mode: if ANY row is bullet, emit ALL as bullets.
  const allPattern = rows.every(r => r.kind === 'pattern');
  if (!allPattern) {
    return rows.map(r => {
      const text = r.kind === 'pattern' ? `${r.label} ${r.state}` : r.content;
      return indent + '- ' + text;
    }).join('\n');
  }

  // Dot-leader mode (D-09-04-01: auto-detect, cap at 80).
  // Convention: each row pads its LABEL to labelMax so the dot block starts at
  // the same column on every row, then a fixed-count dot run, then a single
  // space, then the state. Result: all rows have equal dot-counts AND the
  // state column is aligned. State width may differ across rows, so total row
  // width can differ — that is fine and matches conventional dot-leader.
  const patternRows = rows as Array<{ kind: 'pattern'; label: string; state: string }>;
  const labelMax = Math.max(...patternRows.map(r => visualWidth(r.label)));
  const stateMax = Math.max(...patternRows.map(r => visualWidth(r.state)));
  const indentW = visualWidth(indent);
  // Want at least 4 dots so the leader is visible; expand on wide content,
  // capped so the row fits a typical 80-col terminal accounting for indent.
  const wantW = labelMax + 4 + stateMax; // legacy hint
  const maxRowW = Math.min(80 - indentW, Math.max(wantW, labelMax + stateMax + 6));
  const dotsCount = Math.max(3, maxRowW - labelMax - stateMax - 2);

  return patternRows.map(r => {
    const labelW = visualWidth(r.label);
    const labelPad = ' '.repeat(Math.max(0, labelMax - labelW));
    const dots = '.'.repeat(dotsCount);
    return indent + r.label + labelPad + ' ' + dots + ' ' + r.state;
  }).join('\n');
}

// Eligibility check for L11 dot-leader autofix. Matches L11_overdecoration
// whitelist exactly (lib/lint/rules.ts).
function isL11Eligible(inner: string[]): boolean {
  const n = inner.length;
  if (n < 1 || n > 5) return false;
  if (inner.some(l => /[├└]──/.test(l))) return false;   // nested tree
  if (inner.some(l => (l.match(/│/g) || []).length >= 3)) return false; // embedded table
  return true;
}

export interface AutofixOptions {
  processFenced?: boolean;
  convertL11?: boolean;
}

// Walk text, locate frame regions (sequence of lines starting with ┌ … ending
// with └), build node objects, and rewrite each region in place.
//
// Two orthogonal opt-ins, both default OFF (Stop-hook Phase 8.5 contract):
//   - opts.processFenced — also process frames inside ``` fenced code blocks.
//     CLI --fix opts in; Stop-hook does NOT (fenced frames in model output
//     are deliberate samples).
//   - opts.convertL11 — for L11-eligible frames (1-5 inner lines, no nested
//     tree, no embedded table column), convert to dot-leader list instead of
//     just aligning. CLI --fix opts in; Stop-hook does NOT (silent semantic
//     rewrite would surprise the model and the user reading the response).
//
// Empty frames (┌┐ next to └┘ with no inner lines) — return unchanged.
// Each frame is matched by indent: top and bottom lines share leading
// whitespace; inner lines start with `indent + │`.
//
// @param {string} text
// @param {AutofixOptions} [opts]
export function autofix(text: string, opts?: AutofixOptions): string {
  const processFenced = !!(opts && opts.processFenced);
  const convertL11    = !!(opts && opts.convertL11);
  if (!text || text.indexOf('┌') === -1) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  let inFence = false;
  while (i < lines.length) {
    const line = lines[i]!;
    // Fenced code block toggle — opt-out by default (Stop-hook contract).
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      i++;
      continue;
    }
    if (inFence && !processFenced) {
      out.push(line);
      i++;
      continue;
    }
    const topMatch = line.match(/^(\s*)┌─*┐\s*$/);
    if (!topMatch) {
      out.push(line);
      i++;
      continue;
    }
    const indent = topMatch[1]!;
    let j = i + 1;
    const inner: string[] = [];
    let closed = false;
    while (j < lines.length) {
      const next = lines[j]!;
      const botMatch = next.match(/^(\s*)└─*┘\s*$/);
      if (botMatch && botMatch[1] === indent) {
        closed = true;
        break;
      }
      if (!next.startsWith(indent + '│')) {
        break;
      }
      inner.push(next);
      j++;
    }
    if (!closed) {
      out.push(line);
      i++;
      continue;
    }
    if (inner.length === 0) {
      out.push(line);
      out.push(lines[j]!);
      i = j + 1;
      continue;
    }
    const node: FrameNodeFull = {
      kind: 'frame',
      top: line,
      inner,
      bottom: lines[j]!,
      indent,
    };
    // Dispatch: L11-eligible AND opts.convertL11 → dot-leader; else → alignment.
    if (convertL11 && isL11Eligible(inner)) {
      out.push(autofixFrameToDotLeader(node));
    } else {
      out.push(autofixFrame(node));
    }
    i = j + 1;
  }
  return out.join('\n');
}

// Re-export visualWidth for backward compatibility (autofix.js exported it)
export { visualWidth };
