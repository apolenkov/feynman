// lib/lint/autofix.ts — pure-function autofix for ASCII frame blocks.
// Repairs misaligned │ / ┌─┐ / └─┘ borders so the right edge lines up.
// Zero deps. ESM only. No I/O — text in, text out.

import { visualWidth } from './width.ts';
import { STATE_MARKER_RE } from './markers.ts';
import { nextFrame } from './frames.ts';

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
  // Compute target inner width using full topInner visual width so titled tops
  // like `┌─ Title ─┐` don't collapse to a dash-count that ignores the title.
  const topInner = node.top.slice(node.top.indexOf('┌') + 1, node.top.lastIndexOf('┐'));
  const topWidth = visualWidth(topInner);
  const W = Math.max(1, topWidth, ...inner.map(visualWidth));
  const dash = '─'.repeat(W);
  // Rebuild top bar: preserve title when present (Pattern D — titled top).
  const titleMatch = topInner.match(/^─+\s+(.+?)\s+─+$/);
  const title = titleMatch ? titleMatch[1] : null;
  let top: string;
  if (title) {
    const titleSegment = `─ ${title} `;
    const remainingDashes = '─'.repeat(Math.max(1, W - visualWidth(titleSegment)));
    top = indent + '┌' + titleSegment + remainingDashes + '┐';
  } else {
    top = indent + '┌' + dash + '┐';
  }
  const bot = indent + '└' + dash + '┘';
  const fixed = inner.map(content => {
    const pad = ' '.repeat(Math.max(0, W - visualWidth(content)));
    return indent + '│' + content + pad + '│';
  });
  return [top, ...fixed, bot].join('\n');
}

// STATE-marker allowlist (per D-09-04-03 in PLAN frontmatter, see also
// .planning/notes/autonomous-log-2026-05-11.md). A trailing token in an inner
// line counts as a "state" if it matches STATE_MARKER_RE, shared with L15 via
// ./markers.ts so the detector and the fixer can never drift.

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
    const label = content.slice(0, stateIdx).replace(/[\s.]+$/, '');
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
  convertL15?: boolean;
}

// ---------------------------------------------------------------------------
// Pattern L15 — homogeneous frame → plain format
// Detects frames where ALL inner lines are the same content type and the frame
// adds no structural value. Converts to the lightest pretty format:
//   kv      → key: value lines
//   bullet  → - item lines
//   prose   → plain text lines
// Status frames (state markers) → handled by L11 (dot-leader). Complex frames
// (nested tree, embedded table, arrows) → kept as-is.
// ---------------------------------------------------------------------------

type FrameContentType = 'kv' | 'bullet' | 'prose' | 'status' | 'complex';

function detectFrameContentType(stripped: string[]): FrameContentType {
  if (stripped.length === 0) return 'complex';
  // Complex guards first
  if (stripped.some(l => /[├└]──/.test(l))) return 'complex';
  if (stripped.some(l => (l.match(/│/g) || []).length >= 2)) return 'complex';
  if (stripped.some(l => /─→|→|──>|-->/.test(l))) return 'complex';
  // Status markers (let L11 handle)
  const stateRe = new RegExp(STATE_MARKER_RE.source, STATE_MARKER_RE.flags);
  if (stripped.every(l => stateRe.test(l))) return 'status';
  // Bullet: every line starts with a bullet char after trim
  if (stripped.every(l => /^[-•*◦▸▹·]/.test(l))) return 'bullet';
  // K:V: every line has `word(s): value` or `word(s) — value` pattern
  if (stripped.every(l => /^[^:\n]+:\s+\S/.test(l) || /^[^—\n]+—\s+\S/.test(l))) return 'kv';
  // Prose: at least 2 chars, no special ASCII-diagram syntax
  if (stripped.every(l => l.length >= 2 && !/[├└┬┴┼]/.test(l))) return 'prose';
  return 'complex';
}

export function autofixFrameToPlain(node: FrameNodeFull): string {
  const indent = node.indent || '';
  const stripped = node.inner.map(l => unwrapInner(l, indent).trim());
  // Require ≥2 inner lines — single-item frames are too ambiguous to convert.
  if (stripped.length < 2) return autofixFrame(node);
  const type = detectFrameContentType(stripped);
  if (type === 'complex' || type === 'status') return autofixFrame(node);

  const topInner = node.top.slice(node.top.indexOf('┌') + 1, node.top.lastIndexOf('┐'));
  const titleMatch = topInner.match(/^─+\s+(.+?)\s+─+$/);
  const title = titleMatch ? titleMatch[1] : null;

  const out: string[] = [];
  if (title) out.push(indent + title);
  for (const line of stripped) {
    if (type === 'bullet') {
      const content = line.replace(/^[-•*◦▸▹·]\s*/, '');
      out.push(indent + '- ' + content);
    } else {
      out.push(indent + line);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Pattern A — arrow column alignment
// Detects regions of ≥2 consecutive lines each containing exactly one arrow
// symbol (→ / --> / ──> / ─→) within ±3 visual columns of each other, then
// pads left-side text so all arrows line up in one column.
// ---------------------------------------------------------------------------

const ARROW_RE = /─→|→|──>|-->/;

function hasExactlyOneArrow(line: string): boolean {
  return (line.match(/─→|→|──>|-->/g) || []).length === 1;
}

function arrowColPos(line: string): number {
  const m = line.match(/─→|→|──>|-->/);
  return m && m.index !== undefined ? visualWidth(line.slice(0, m.index)) : -1;
}

// Build a set of line indices that should be skipped for new-pattern fixes:
// fenced-block lines (when processFenced=false) and frame border/inner lines.
function buildSkipSet(lines: string[], processFenced: boolean): Set<number> {
  const skip = new Set<number>();
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*```/.test(l)) { inFence = !inFence; skip.add(i); continue; }
    if (inFence && !processFenced) { skip.add(i); continue; }
    if (/^\s*[┌└│]/.test(l)) skip.add(i); // frame lines
  }
  return skip;
}

function detectAndFixArrows(text: string, processFenced: boolean): string {
  if (!ARROW_RE.test(text)) return text;
  const lines = text.split('\n');
  const n = lines.length;
  const skip = buildSkipSet(lines, processFenced);
  const result = [...lines];
  let i = 0;
  while (i < n) {
    if (skip.has(i) || !hasExactlyOneArrow(lines[i]!)) { i++; continue; }
    let j = i + 1;
    while (j < n && !skip.has(j) && hasExactlyOneArrow(lines[j]!)) j++;
    const regionEnd = j - 1;
    if (regionEnd - i >= 1) {
      const regionLines = lines.slice(i, regionEnd + 1);
      const positions = regionLines.map(arrowColPos);
      const minPos = Math.min(...positions);
      const maxPos = Math.max(...positions);
      if (maxPos - minPos <= 3) {
        const parts = regionLines.map(l => {
          const m = l.match(/─→|→|──>|-->/);
          if (!m || m.index === undefined) return { left: l, rest: '' };
          return { left: l.slice(0, m.index).trimEnd(), rest: l.slice(m.index) };
        });
        const maxLeft = Math.max(...parts.map(p => visualWidth(p.left)));
        for (let k = 0; k < parts.length; k++) {
          const { left, rest } = parts[k]!;
          const pad = ' '.repeat(maxLeft - visualWidth(left));
          result[i + k] = left + pad + ' ' + rest;
        }
      }
      i = regionEnd + 1;
    } else {
      i++;
    }
  }
  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Pattern B — junction fan alignment
// Detects regions of ≥2 consecutive lines each having the form
//   [label] ──┐ / ──┤ / ──┘  (the label may be any non-empty string)
// within ±3 visual columns of each other, then pads label text so the
// `──` connector starts at the same column on every line.
// ---------------------------------------------------------------------------

const JUNCTION_RE = /──[┐┤┘]/;

function hasExactlyOneJunction(line: string): boolean {
  return (line.match(/──[┐┤┘]/g) || []).length === 1;
}

function junctionColPos(line: string): number {
  const m = line.match(/──[┐┤┘]/);
  return m && m.index !== undefined ? visualWidth(line.slice(0, m.index)) : -1;
}

function detectAndFixJunctions(text: string, processFenced: boolean): string {
  if (!JUNCTION_RE.test(text)) return text;
  const lines = text.split('\n');
  const n = lines.length;
  const skip = buildSkipSet(lines, processFenced);
  const result = [...lines];
  let i = 0;
  while (i < n) {
    if (skip.has(i) || !hasExactlyOneJunction(lines[i]!)) { i++; continue; }
    let j = i + 1;
    while (j < n && !skip.has(j) && hasExactlyOneJunction(lines[j]!)) j++;
    const regionEnd = j - 1;
    if (regionEnd - i >= 1) {
      const regionLines = lines.slice(i, regionEnd + 1);
      const positions = regionLines.map(junctionColPos);
      const minPos = Math.min(...positions);
      const maxPos = Math.max(...positions);
      if (maxPos - minPos <= 3) {
        const parts = regionLines.map(l => {
          const m = l.match(/──[┐┤┘]/);
          if (!m || m.index === undefined) return { left: l, rest: '' };
          return { left: l.slice(0, m.index).trimEnd(), rest: l.slice(m.index) };
        });
        const maxLeft = Math.max(...parts.map(p => visualWidth(p.left)));
        for (let k = 0; k < parts.length; k++) {
          const { left, rest } = parts[k]!;
          const pad = ' '.repeat(maxLeft - visualWidth(left));
          result[i + k] = left + pad + ' ' + rest;
        }
      }
      i = regionEnd + 1;
    } else {
      i++;
    }
  }
  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Pattern C — separator length normalization
// Collects all `─`-only lines (≥3 chars) in the document (global pass).
// Requires ≥2 such lines; normalizes all to the document-maximum length.
// Guards: skips fenced blocks and frame border lines.
// ---------------------------------------------------------------------------

const SEP_RE = /^─{3,}$/;

function isSeparatorLine(line: string): boolean {
  return SEP_RE.test(line.trim()) && line.trim().length >= 3;
}

function detectAndFixSeparators(text: string, processFenced: boolean): string {
  if (text.indexOf('─') === -1) return text;
  const lines = text.split('\n');
  const skip = buildSkipSet(lines, processFenced);
  const sepIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!skip.has(i) && isSeparatorLine(lines[i]!)) sepIndices.push(i);
  }
  if (sepIndices.length < 2) return text;
  const maxLen = Math.max(...sepIndices.map(i => visualWidth(lines[i]!.trim())));
  const result = [...lines];
  for (const i of sepIndices) {
    const indent = (lines[i]!.match(/^(\s*)/) || ['', ''])[1]!;
    result[i] = indent + '─'.repeat(maxLen);
  }
  return result.join('\n');
}

// Index of the next ``` fence line at or after `from`, or lines.length if none.
// Used to bound frame detection to one fence-free segment so a frame can never
// span a ``` boundary — fenced blocks are out of scope by default.
function nextFenceLine(lines: string[], from: number): number {
  for (let k = from; k < lines.length; k++) {
    if (/^\s*```/.test(lines[k]!)) return k;
  }
  return lines.length;
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
  const convertL15    = !!(opts && opts.convertL15);
  if (!text) return text;
  const hasFrames    = text.indexOf('┌') !== -1;
  const hasArrows    = ARROW_RE.test(text);
  const hasJunctions = JUNCTION_RE.test(text);
  const hasSeps      = text.indexOf('─') !== -1;
  if (!hasFrames && !hasArrows && !hasJunctions && !hasSeps) return text;
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
    const topMatch = line.match(/^(\s*)┌─[^┌\n]*┐\s*$/);
    if (!topMatch) {
      out.push(line);
      i++;
      continue;
    }
    // Detect the frame with the canonical nextFrame helper so autofix and the
    // lint rules (L08/L11/L12/L15) share ONE frame definition: the closer is the
    // first └─…─┘ found scanning forward past any hole (blank line / stray
    // prose), and inner is the fully-bordered │ … │ rows. The scan is bounded to
    // the current non-fence segment (nextFenceLine) so a frame never spans a ```
    // boundary, mirroring how the parser feeds the linter one fence-free block.
    const segEnd = nextFenceLine(lines, i + 1);
    const frame = nextFrame(lines.slice(i, segEnd), 0);
    if (!frame || frame.closeLi === -1) {
      out.push(line);
      i++;
      continue;
    }
    const { indent, inner } = frame;
    const closeLi = i + frame.closeLi;
    if (inner.length === 0) {
      out.push(line);
      out.push(lines[closeLi]!);
      i = closeLi + 1;
      continue;
    }
    const node: FrameNodeFull = {
      kind: 'frame',
      top: line,
      inner,
      bottom: lines[closeLi]!,
      indent,
    };
    // Dispatch priority: L15 (plain) > L11 (dot-leader) > alignment.
    // If L15 declines (complex/status/single — result still contains ┌),
    // fall through to L11 so status frames still get dot-leader conversion.
    if (convertL15) {
      const l15 = autofixFrameToPlain(node);
      if (!l15.includes('┌')) {
        out.push(l15);
      } else if (convertL11 && isL11Eligible(inner)) {
        out.push(autofixFrameToDotLeader(node));
      } else {
        out.push(l15);
      }
    } else if (convertL11 && isL11Eligible(inner)) {
      out.push(autofixFrameToDotLeader(node));
    } else {
      out.push(autofixFrame(node));
    }
    i = closeLi + 1;
  }
  let result = detectAndFixArrows(out.join('\n'), processFenced);
  result = detectAndFixJunctions(result, processFenced);
  result = detectAndFixSeparators(result, processFenced);
  return result;
}

// Re-export visualWidth for backward compatibility (autofix.js exported it)
export { visualWidth };
