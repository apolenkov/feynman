import { flowArrowIndex, hasFlowArrow, hasExactlyOneArrow } from './arrows.ts';
import { visualWidth } from './width.ts';

// ---------------------------------------------------------------------------
// Pattern A — arrow column alignment
// Detects regions of ≥2 consecutive lines each containing exactly one arrow
// symbol (→ / --> / ──> / ─→) within ±3 visual columns of each other, then
// pads left-side text so all arrows line up in one column.
// ---------------------------------------------------------------------------

function arrowColPos(line: string): number {
  const index = flowArrowIndex(line);
  return index >= 0 ? visualWidth(line.slice(0, index)) : -1;
}

// Build a set of line indices that should be skipped for new-pattern fixes:
// fenced-block lines (when processFenced=false) and frame border/inner lines.
function buildSkipSet(lines: readonly string[], processFenced: boolean): ReadonlySet<number> {
  const skip = new Set<number>();
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === undefined) break;
    if (/^\s*```/.test(l)) {
      inFence = !inFence;
      skip.add(i);
      continue;
    }
    if (inFence && !processFenced) {
      skip.add(i);
      continue;
    }
    if (/^\s*[┌└│]/.test(l)) skip.add(i); // frame lines
  }
  return skip;
}

export function detectAndFixArrows(text: string, processFenced: boolean): string {
  if (!hasFlowArrow(text)) return text;
  const lines = text.split('\n');
  const n = lines.length;
  const skip = buildSkipSet(lines, processFenced);
  const result = [...lines];
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (line === undefined) break;
    if (skip.has(i) || !hasExactlyOneArrow(line)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n && !skip.has(j)) {
      const candidate = lines[j];
      if (candidate === undefined || !hasExactlyOneArrow(candidate)) break;
      j++;
    }
    const regionEnd = j - 1;
    if (regionEnd - i >= 1) {
      const regionLines = lines.slice(i, regionEnd + 1);
      const positions = regionLines.map(arrowColPos);
      const minPos = Math.min(...positions);
      const maxPos = Math.max(...positions);
      if (maxPos - minPos <= 3) {
        const parts = regionLines.map((l) => {
          const index = flowArrowIndex(l);
          if (index < 0) return { left: l, rest: '' };
          return { left: l.slice(0, index).trimEnd(), rest: l.slice(index) };
        });
        const maxLeft = Math.max(...parts.map((p) => visualWidth(p.left)));
        for (let k = 0; k < parts.length; k++) {
          const part = parts[k];
          if (part === undefined) break;
          const { left, rest } = part;
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

export const JUNCTION_RE = /──[┐┤┘]/;

function hasExactlyOneJunction(line: string): boolean {
  return (line.match(/──[┐┤┘]/g) ?? []).length === 1;
}

function junctionColPos(line: string): number {
  const m = /──[┐┤┘]/.exec(line);
  return m?.index !== undefined ? visualWidth(line.slice(0, m.index)) : -1;
}

export function detectAndFixJunctions(text: string, processFenced: boolean): string {
  if (!JUNCTION_RE.test(text)) return text;
  const lines = text.split('\n');
  const n = lines.length;
  const skip = buildSkipSet(lines, processFenced);
  const result = [...lines];
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (line === undefined) break;
    if (skip.has(i) || !hasExactlyOneJunction(line)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n && !skip.has(j)) {
      const candidate = lines[j];
      if (candidate === undefined || !hasExactlyOneJunction(candidate)) break;
      j++;
    }
    const regionEnd = j - 1;
    if (regionEnd - i >= 1) {
      const regionLines = lines.slice(i, regionEnd + 1);
      const positions = regionLines.map(junctionColPos);
      const minPos = Math.min(...positions);
      const maxPos = Math.max(...positions);
      if (maxPos - minPos <= 3) {
        const parts = regionLines.map((l) => {
          const m = /──[┐┤┘]/.exec(l);
          if (m?.index === undefined) return { left: l, rest: '' };
          return { left: l.slice(0, m.index).trimEnd(), rest: l.slice(m.index) };
        });
        const maxLeft = Math.max(...parts.map((p) => visualWidth(p.left)));
        for (let k = 0; k < parts.length; k++) {
          const part = parts[k];
          if (part === undefined) break;
          const { left, rest } = part;
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

export function detectAndFixSeparators(text: string, processFenced: boolean): string {
  if (!text.includes('─')) return text;
  const lines = text.split('\n');
  const skip = buildSkipSet(lines, processFenced);
  const sepIndices = lines.flatMap((line, index) =>
    !skip.has(index) && isSeparatorLine(line) ? [index] : [],
  );
  if (sepIndices.length < 2) return text;
  const maxLen = Math.max(...sepIndices.map((i) => visualWidth(lines[i]?.trim() ?? '')));
  const result = [...lines];
  for (const i of sepIndices) {
    const indent = lines[i]?.match(/^(\s*)/)?.[1] ?? '';
    result[i] = indent + '─'.repeat(maxLen);
  }
  return result.join('\n');
}
