import { visualWidth } from './width.ts';
import { STATE_MARKER_RE } from './markers.ts';
import { hasFlowArrow } from './arrows.ts';
import {
  JUNCTION_RE,
  detectAndFixArrows,
  detectAndFixJunctions,
  detectAndFixSeparators,
} from './align-rows.ts';
import { iterateFrames } from './frames.ts';

// Strip indent prefix and the outer │ chars from an inner line. Returns the
// raw cell content without trailing space.
function unwrapInner(line: string, indent: string): string {
  const withoutIndent = indent && line.startsWith(indent) ? line.slice(indent.length) : line;
  // Drop leading │ and trailing │ (the latter may have padding before it).
  return withoutIndent.replace(/^│/, '').replace(/\s*│\s*$/, '');
}

export interface FrameNodeFull {
  readonly kind?: string;
  readonly top: string;
  readonly inner: readonly string[];
  readonly bottom: string;
  readonly indent: string;
}

function titleFromTop(top: string): string | null {
  const left = top.indexOf('┌');
  const right = top.lastIndexOf('┐');
  if (left === -1 || right <= left) return null;
  const topInner = top.slice(left + 1, right);
  if (/^─+$/.test(topInner)) return null;
  const title = topInner.replace(/^─+/, '').replace(/─+$/, '').trim();
  return title.length === 0 ? null : title;
}

export function autofixFrame(node: FrameNodeFull): string {
  const indent = node.indent;
  const inner = node.inner.map((line) => unwrapInner(line, indent));
  // Compute target inner width using full topInner visual width so titled tops
  // like `┌─ Title ─┐` don't collapse to a dash-count that ignores the title.
  const topInner = node.top.slice(node.top.indexOf('┌') + 1, node.top.lastIndexOf('┐'));
  const topWidth = visualWidth(topInner);
  // Rebuild top bar: preserve title when present (Pattern D — titled top).
  const title = titleFromTop(node.top);
  const titleSegment = title === null ? null : `─ ${title} `;
  const W = Math.max(
    1,
    topWidth,
    titleSegment === null ? 0 : visualWidth(titleSegment) + 1,
    ...inner.map(visualWidth),
  );
  const dash = '─'.repeat(W);
  const top =
    titleSegment !== null
      ? indent + '┌' + titleSegment + '─'.repeat(Math.max(1, W - visualWidth(titleSegment))) + '┐'
      : indent + '┌' + dash + '┐';
  const bot = indent + '└' + dash + '┘';
  const fixed = inner.map((content) => {
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
  { kind: 'pattern'; label: string; state: string } | { kind: 'bullet'; content: string };

function frameTitle(node: FrameNodeFull): string | null {
  return titleFromTop(node.top);
}

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
  const indent = node.indent;
  const stripped = node.inner.map((line) => unwrapInner(line, indent).trim());

  // Classify each row: pattern (label + state) or free-form
  const rows: RowKind[] = stripped.map((content) => {
    // Match trailing STATE marker.
    const re = new RegExp(STATE_MARKER_RE.source, STATE_MARKER_RE.flags);
    const stateMatch = content.match(re);
    if (!stateMatch) return { kind: 'bullet', content };
    const matchedState = stateMatch[0].trim();
    const glyphIndex = content.search(/[✓✗◐⌛→←]/u);
    const stateIdx = glyphIndex === -1 ? content.lastIndexOf(matchedState) : glyphIndex;
    const state = content.slice(stateIdx).trim();
    // Label = everything before state, with trailing dots/whitespace stripped.
    const label = content.slice(0, stateIdx).replace(/[\s.]+$/, '');
    if (!label) return { kind: 'bullet', content };
    return { kind: 'pattern', label, state };
  });

  // Mixed mode: if ANY row is bullet, emit ALL as bullets.
  const allPattern = rows.every((r) => r.kind === 'pattern');
  const title = frameTitle(node);
  const titleLine = title === null ? [] : [indent + title];
  if (!allPattern) {
    return [
      ...titleLine,
      ...rows.map((r) => {
        const text = r.kind === 'pattern' ? `${r.label} ${r.state}` : r.content;
        return indent + '- ' + text;
      }),
    ].join('\n');
  }

  // Dot-leader mode (D-09-04-01: auto-detect, cap at 80).
  // Convention: each row pads its LABEL to labelMax so the dot block starts at
  // the same column on every row, then a fixed-count dot run, then a single
  // space, then the state. Result: all rows have equal dot-counts AND the
  // state column is aligned. State width may differ across rows, so total row
  // width can differ — that is fine and matches conventional dot-leader.
  const patternRows: readonly Extract<RowKind, { kind: 'pattern' }>[] = rows;
  const labelMax = Math.max(...patternRows.map((r) => visualWidth(r.label)));
  const stateMax = Math.max(...patternRows.map((r) => visualWidth(r.state)));
  const indentW = visualWidth(indent);
  // Want at least 4 dots so the leader is visible; expand on wide content,
  // capped so the row fits a typical 80-col terminal accounting for indent.
  const wantW = labelMax + 4 + stateMax; // legacy hint
  const maxRowW = Math.min(80 - indentW, Math.max(wantW, labelMax + stateMax + 6));
  const dotsCount = Math.max(3, maxRowW - labelMax - stateMax - 2);

  return [
    ...titleLine,
    ...patternRows.map((r) => {
      const labelW = visualWidth(r.label);
      const labelPad = ' '.repeat(Math.max(0, labelMax - labelW));
      const dots = '.'.repeat(dotsCount);
      return indent + r.label + labelPad + ' ' + dots + ' ' + r.state;
    }),
  ].join('\n');
}

// Eligibility check for L11 dot-leader autofix. Matches L11_overdecoration
// whitelist exactly (lib/lint/rules.ts).
function isL11Eligible(inner: readonly string[]): boolean {
  const n = inner.length;
  if (n < 1 || n > 5) return false;
  if (inner.some((l) => /[├└]──/.test(l))) return false; // nested tree
  if (inner.some((l) => (l.match(/│/g) ?? []).length >= 3)) return false; // embedded table
  return true;
}

export interface AutofixOptions {
  readonly processFenced?: boolean;
  readonly convertL11?: boolean;
  readonly convertL15?: boolean;
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

function detectFrameContentType(stripped: readonly string[]): FrameContentType {
  if (stripped.length === 0) return 'complex';
  // Complex guards first
  if (stripped.some((l) => /[├└]──/.test(l))) return 'complex';
  if (stripped.some((l) => (l.match(/│/g) ?? []).length >= 2)) return 'complex';
  if (stripped.some(hasFlowArrow)) return 'complex';
  // Status markers (let L11 handle)
  const stateRe = new RegExp(STATE_MARKER_RE.source, STATE_MARKER_RE.flags);
  if (stripped.every((l) => stateRe.test(l))) return 'status';
  // Bullet: every line starts with a bullet char after trim
  if (stripped.every((l) => /^[-•*◦▸▹·]/.test(l))) return 'bullet';
  // K:V: every line has `word(s): value` or `word(s) — value` pattern
  if (stripped.every((l) => /^[^:\n]+:\s+\S/.test(l) || /^[^—\n]+—\s+\S/.test(l))) return 'kv';
  // Prose: at least 2 chars, no special ASCII-diagram syntax
  if (stripped.every((l) => l.length >= 2 && !/[├└┬┴┼]/.test(l))) return 'prose';
  return 'complex';
}

export function autofixFrameToPlain(node: FrameNodeFull): string {
  const indent = node.indent;
  const stripped = node.inner.map((l) => unwrapInner(l, indent).trim());
  // Require ≥2 inner lines — single-item frames are too ambiguous to convert.
  if (stripped.length < 2) return autofixFrame(node);
  const type = detectFrameContentType(stripped);
  if (type === 'complex' || type === 'status') return autofixFrame(node);

  const title = frameTitle(node);

  const titleLine = title === null ? [] : [indent + title];
  const contentLines = stripped.map((line) => {
    const content = type === 'bullet' ? line.replace(/^[-•*◦▸▹·]\s*/, '') : line;
    return type === 'bullet' ? indent + '- ' + content : indent + content;
  });
  return [...titleLine, ...contentLines].join('\n');
}

// Index of the next ``` fence line at or after `from`, or lines.length if none.
// Used to bound frame detection to one fence-free segment so a frame can never
// span a ``` boundary — fenced blocks are out of scope by default.
function nextFenceLine(lines: readonly string[], from: number): number {
  for (let k = from; k < lines.length; k++) {
    const line = lines[k];
    if (line !== undefined && /^\s*```/.test(line)) return k;
  }
  return lines.length;
}

// Walk text, locate frame regions (sequence of lines starting with ┌ … ending
// with └), build node objects, and rewrite each region in place.
//
// Two orthogonal opt-ins, both default OFF to keep programmatic use conservative:
//   - opts.processFenced — also process frames inside ``` fenced code blocks.
//     CLI --fix opts in; default callers preserve fenced author samples.
//   - opts.convertL11 — for L11-eligible frames (1-5 inner lines, no nested
//     tree, no embedded table column), convert to dot-leader list instead of
//     just aligning. CLI --fix opts in; default callers avoid semantic rewrites.
//
// Empty frames (┌┐ next to └┘ with no inner lines) — return unchanged.
// Each frame is matched by indent: top and bottom lines share leading
// whitespace; inner lines start with `indent + │`.
//
// @param {string} text
// @param {AutofixOptions} [opts]
export function autofix(text: string, opts?: AutofixOptions): string {
  const processFenced = opts?.processFenced === true;
  const convertL11 = opts?.convertL11 === true;
  const convertL15 = opts?.convertL15 === true;
  if (!text) return text;
  const hasFrames = text.includes('┌');
  const hasArrows = hasFlowArrow(text);
  const hasJunctions = JUNCTION_RE.test(text);
  const hasSeps = text.includes('─');
  if (!hasFrames && !hasArrows && !hasJunctions && !hasSeps) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  let inFence = false;
  let segmentStart = 0;
  let frames: ReturnType<typeof iterateFrames> | undefined;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    // Fenced code block toggle — opt-out by default to preserve author intent.
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      frames = undefined;
      out.push(line);
      i++;
      continue;
    }
    if (inFence && !processFenced) {
      out.push(line);
      i++;
      continue;
    }
    const topMatch = /^(\s*)┌─[^┌\n]*┐\s*$/.exec(line);
    if (!topMatch) {
      out.push(line);
      i++;
      continue;
    }
    // Index each fence-free segment once so frames cannot span a fence.
    if (frames === undefined) {
      segmentStart = i;
      frames = iterateFrames(lines.slice(i, nextFenceLine(lines, i + 1)));
    }
    const frame = frames.next().value;
    if (frame === undefined || frame.closeLi === -1) {
      out.push(line);
      i++;
      continue;
    }
    const { indent, inner } = frame;
    const closeLi = segmentStart + frame.closeLi;
    // Do not discard text that the canonical frame parser cannot classify.
    const borderedRows = new Set(inner);
    const unclassifiedText = lines
      .slice(i + 1, closeLi)
      .some((row) => row.trim() !== '' && !borderedRows.has(row));
    if (unclassifiedText) {
      out.push(...lines.slice(i, closeLi + 1));
      i = closeLi + 1;
      continue;
    }
    if (inner.length === 0) {
      out.push(line);
      const bottom = lines[closeLi];
      if (bottom !== undefined) out.push(bottom);
      i = closeLi + 1;
      continue;
    }
    const bottom = lines[closeLi];
    if (bottom === undefined) break;
    const node: FrameNodeFull = {
      kind: 'frame',
      top: line,
      inner,
      bottom,
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
  const arrowsFixed = detectAndFixArrows(out.join('\n'), processFenced);
  const junctionsFixed = detectAndFixJunctions(arrowsFixed, processFenced);
  return detectAndFixSeparators(junctionsFixed, processFenced);
}

// Re-export visualWidth for backward compatibility (autofix.js exported it)
export { visualWidth };
