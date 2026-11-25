import { type ASTNode, type Issue, issue } from './lint-diagnostics.ts';
import { iterateFrames } from './frames.ts';
import { visualWidth } from './width.ts';
import { hasFlowArrow } from './arrows.ts';
import { STATE_MARKER_RE } from './markers.ts';

// ---------------------------------------------------------------------------
// L11 — Overdecoration (frame for ≤5 items)
// Severity: warn. Trigger-table prescribes dot-leader for ≤5 items; frame
// wastes ~50% on padding/borders. Whitelist: nested tree (├──/└──) or
// embedded table column (≥3 │ chars on a single inner line) inside the frame.
// ---------------------------------------------------------------------------
export function L11_overdecoration(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  return Array.from(iterateFrames(lines)).flatMap((frame) => {
    if (frame.closeLi === -1) return [];
    const { topLi, closeLi, indent, inner } = frame;
    const top = lines[topLi] ?? '';

    const innerCount = inner.length;
    if (innerCount < 1 || innerCount > 5) return [];

    const hasTree = inner.some((line) => /[├└]──/.test(line));
    const hasEmbeddedTable = inner.some((line) => (line.match(/│/g) ?? []).length >= 3);
    if (hasTree || hasEmbeddedTable) return [];

    const frameChars =
      visualWidth(top) +
      visualWidth(lines[closeLi]) +
      inner.reduce((total, line) => total + visualWidth(line), 0);
    const dotLeaderChars = inner.reduce(
      (total, line) =>
        total +
        visualWidth(
          line
            .replace(/^\s*│/, '')
            .replace(/\s*│\s*$/, '')
            .trim(),
        ) +
        1,
      0,
    );
    const saving = Math.max(0, frameChars - dotLeaderChars);

    return [
      issue(
        'L11',
        'warn',
        baseLineNum + topLi,
        indent.length + 1,
        `frame used for ${innerCount} items; consider dot-leader list (saves ~${saving} chars)`,
        `Replace frame with dot-leader list — see docs/lint-rules.md#l11`,
      ),
    ];
  });
}

// ---------------------------------------------------------------------------
// L12 — Token budget (padding-dominated visual)
// Severity: warn. For each frame, compute padding/content ratio. Warn if
// padding_chars > content_chars. estimateFrameCost is exported for the
// --explain CLI flag (Plan 09-05).
// ---------------------------------------------------------------------------

export interface FrameCost {
  readonly framing_chars: number;
  readonly content_chars: number;
  readonly border_chars: number;
  readonly padding_chars: number;
  readonly dotleader_equivalent: number;
  readonly saving: number;
}

export interface FrameNode {
  readonly top?: string;
  readonly bottom?: string;
  readonly inner?: readonly string[];
}

/**
 * Estimate token-cost breakdown of a single frame block.
 * Used by L12 detection AND by the --explain CLI flag (Plan 09-05).
 * @param {{top:string, inner:string[], bottom:string}} node
 * @returns {FrameCost}
 */
export function estimateFrameCost(node: FrameNode): FrameCost {
  const top = node.top ?? '';
  const bottom = node.bottom ?? '';
  const inner = node.inner ?? [];

  const border_chars = visualWidth(top) + visualWidth(bottom);

  const { content_chars, inner_chars } = inner.reduce(
    (totals, line) => ({
      inner_chars: totals.inner_chars + visualWidth(line),
      content_chars:
        totals.content_chars +
        visualWidth(
          line
            .replace(/^\s*│/, '')
            .replace(/\s*│\s*$/, '')
            .trim(),
        ),
    }),
    { content_chars: 0, inner_chars: 0 },
  );

  const framing_chars = border_chars + inner_chars;
  const padding_chars = Math.max(0, inner_chars - content_chars);
  const dotleader_equivalent = content_chars + inner.length;
  const saving = Math.max(0, framing_chars - dotleader_equivalent);

  return {
    framing_chars,
    content_chars,
    border_chars,
    padding_chars,
    dotleader_equivalent,
    saving,
  };
}

export function L12_token_budget(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  return Array.from(iterateFrames(lines)).flatMap((frame) => {
    if (frame.closeLi === -1) return [];
    const { topLi, closeLi, indent, inner } = frame;
    const top = lines[topLi] ?? '';

    // Whitelist: tree composition inside frame (consistent with L11)
    if (inner.some((line) => /[├└]──/.test(line))) return [];
    if (inner.length === 0) return [];

    const cost = estimateFrameCost({ top, inner, bottom: lines[closeLi] ?? '' });

    return cost.padding_chars > cost.content_chars
      ? [
          issue(
            'L12',
            'warn',
            baseLineNum + topLi,
            indent.length + 1,
            `frame is padding-dominated (padding=${cost.padding_chars} > content=${cost.content_chars}); consider lighter visual`,
            `Use --explain for full cost breakdown; consider dot-leader or trimmed frame`,
          ),
        ]
      : [];
  });
}

// ---------------------------------------------------------------------------
// L13 — Double wrap (tree inside frame)
// Severity: warn. A tree's indentation already conveys hierarchy; wrapping
// it in a frame adds zero information at full border cost.
// ---------------------------------------------------------------------------
export function L13_double_wrap(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];
  if (!/[├└]──/.test(content)) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  return Array.from(iterateFrames(lines)).flatMap((frame) => {
    const { topLi, closeLi, indent } = frame;

    if (closeLi === -1) return [];

    // Check all between-lines (not just │-bearing ones) for tree chars,
    // since L13 cares about any line between top and close.
    const hasTree = lines.slice(topLi + 1, closeLi).some((line) => /[├└]──/.test(line));

    return hasTree
      ? [
          issue(
            'L13',
            'warn',
            baseLineNum + topLi,
            indent.length + 1,
            `tree inside frame block — the tree already conveys hierarchy; drop the frame`,
            `Remove the surrounding ┌─...─┐ / └─...─┘ borders; tree indentation suffices`,
          ),
        ]
      : [];
  });
}

// ---------------------------------------------------------------------------
// L14 — Blank-line separation
// Severity: warn. A fenced ASCII/diagram block should have a blank line before
// and after it (monospace equivalent of vertical margin; improves scannability).
// Only applies to fenced blocks (opening ``` is at startLine-1 in 1-based terms).
// Conservative: only warn on a clear prose-line directly touching the fence.
// Skips: indented/list-adjacent blocks, blocks at file boundaries.
// ---------------------------------------------------------------------------

// Regex: at least one box-drawing, arrow, or tree char in the content.
export const DIAGRAM_CHAR_RE = /[┌┐└┘│─├┤┬┴┼]/;

// ---------------------------------------------------------------------------
// L15 — Homogeneous frame → plain format
// Severity: warn. A frame whose inner lines are ALL the same content type
// (k:v pairs, bullet list, or plain prose) adds visual weight without
// structural value. autofix --fix can convert to plain text.
// Whitelist: complex frames (nested trees ├──, arrows →/-->, embedded tables
//            with ≥2 inner │ chars) and status frames (← / ✓/✗ markers)
//            which are handled by L11.
// Requires ≥2 inner lines to avoid false-positives on single-item wraps.
// ---------------------------------------------------------------------------
export function L15_homogeneous_frame(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  if (!ast.content.includes('┌')) return [];

  const lines = ast.content.split('\n');
  const baseLineNum = ast.startLine;

  return Array.from(iterateFrames(lines)).flatMap((frame) => {
    const { topLi, closeLi, indent } = frame;
    const top = lines[topLi] ?? '';

    if (closeLi === -1) return [];

    // L15 uses startsWith(indent + '│') for inner collection (leading bar only).
    const inner = lines.slice(topLi + 1, closeLi).filter((line) => line.startsWith(indent + '│'));

    if (inner.length < 2) return [];

    // Strip inner lines to bare content for type detection.
    const stripped = inner.map((line) =>
      (indent.length > 0 && line.startsWith(indent) ? line.slice(indent.length) : line)
        .replace(/^│/, '')
        .replace(/\s*│\s*$/, '')
        .trim(),
    );

    // Complex guards — skip (structural frames stay as frames).
    if (stripped.some((l) => /[├└]──/.test(l))) {
      return [];
    }
    if (stripped.some((l) => (l.match(/│/g) ?? []).length >= 2)) {
      return [];
    }
    if (stripped.some(hasFlowArrow)) {
      return [];
    }
    // Status frames — let L11 handle.
    if (stripped.every((l) => STATE_MARKER_RE.test(l))) {
      return [];
    }

    // Detect homogeneous content type.
    const type = stripped.every((line) => /^[-•*◦▸▹·]/.test(line))
      ? 'bullet'
      : stripped.every((line) => /^[^:\n]+:\s+\S/.test(line) || /^[^—\n]+—\s+\S/.test(line))
        ? 'kv'
        : stripped.every((line) => line.length >= 2 && !/[├└┬┴┼]/.test(line))
          ? 'prose'
          : null;

    if (type === null) {
      return [];
    }

    // Savings estimate: frame chars vs plain content chars.
    const frameChars =
      visualWidth(top) +
      visualWidth(lines[closeLi]) +
      inner.reduce((acc, l) => acc + visualWidth(l), 0);
    const plainChars = stripped.reduce((acc, l) => acc + l.length, 0);
    const saving = Math.max(0, frameChars - plainChars);

    return [
      issue(
        'L15',
        'warn',
        baseLineNum + topLi,
        indent.length + 1,
        `frame wraps homogeneous ${type} content; consider plain format (saves ~${saving} chars)`,
        'Use feynman-lint --fix to convert to plain text — see docs/lint-rules.md#l15',
      ),
    ];
  });
}
