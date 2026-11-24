// lib/lint/frames.ts — canonical frame-iteration helper
// Provides shared frame detection for lint rules and autofix.
// Zero deps. ESM only.
//
// Design:
//   - Opener: /^(\s*)┌─[^┌\n]*┐\s*$/ — title-aware (superset of /^(\s*)┌─+┐\s*$/).
//     Matches both  ┌────┐  (untitled)  and  ┌─ Title ─┐  (titled).
//   - Closer: /^(\s*)└─*┘\s*$/ — includes └┘ (zero dashes) used in L15.
//   - Indent equality: botMatch indent must equal top indent.
//   - inner: fully bordered │ … │ rows strictly between opener and closer.
//   - Caller advances past closeLi, or to topLi+1 when no closer was found.

export interface FrameInfo {
  /** 0-based index of the opening ┌ line in the supplied lines array. */
  readonly topLi: number;
  /** 0-based index of the closing └ line. -1 if no matching closer found. */
  readonly closeLi: number;
  /** Whitespace-only prefix of the opener (the indent string). */
  readonly indent: string;
  /** Fully bordered rows strictly between opener and closer. */
  readonly inner: readonly string[];
}

// Title-aware opener: ┌─ followed by anything that isn't ┌ or newline, ending ┐.
// This matches both ┌──────┐ (untitled) and ┌─ Some Title ─┐ (titled).
const TOP_RE = /^(\s*)┌─[^┌\n]*┐\s*$/;

// Closer: └ followed by zero or more dashes, then ┘ (with optional leading indent/trailing space).
const BOT_RE = /^(\s*)└─*┘\s*$/;
const INNER_RE = /^\s*│.*│\s*$/;

/**
 * Find the first frame in `lines` starting from `startLi`.
 * A frame is a pair of matching opener / closer lines plus the inner content.
 *
 * Use iterateFrames when traversing more than one frame.
 *
 * @param lines   The split lines of the content string.
 * @param startLi 0-based line index to start scanning from.
 * @returns       FrameInfo for the FIRST frame found at or after startLi,
 *                or null if no opener is found.
 */
export function nextFrame(lines: readonly string[], startLi: number): FrameInfo | null {
  for (let li = startLi; li < lines.length; li++) {
    const top = lines[li];
    if (top === undefined) break;
    const topMatch = TOP_RE.exec(top);
    if (!topMatch) continue;

    const indent = topMatch[1] ?? '';

    // Search for the matching closer at the same indent.
    let closeLi = -1;
    const inner: string[] = [];

    for (let lj = li + 1; lj < lines.length; lj++) {
      const next = lines[lj];
      if (next === undefined) break;
      const botMatch = BOT_RE.exec(next);
      if (botMatch?.[1] === indent) {
        closeLi = lj;
        break;
      }
      // Collect lines that are fully bordered (start AND end with │),
      // matching the original /^\s*│.*│\s*$/ predicate used by L11, L12,
      // and explainFrames. This keeps inner-set semantics byte-identical
      // with the pre-migration code for all well-formed frames.
      if (INNER_RE.test(next)) {
        inner.push(next);
      }
    }

    return { topLi: li, closeLi, indent, inner };
  }

  return null;
}

/** Iterate frames in source order using one index of closers and bordered rows. */
export function* iterateFrames(lines: readonly string[]): Generator<FrameInfo, void, unknown> {
  const firstMissing = lines.findIndex((line: string | undefined) => line === undefined);
  const end = firstMissing === -1 ? lines.length : firstMissing;
  const closers = new Map<string, { readonly line: number; readonly rowCount: number }>();
  const rows: string[] = [];
  const frames: FrameInfo[] = [];

  // Walking backwards makes the closest later closer available for each indent.
  for (let li = end - 1; li >= 0; li--) {
    const line = lines[li];
    if (line === undefined) break;
    const bottomIndent = BOT_RE.exec(line)?.[1];
    if (bottomIndent !== undefined) closers.set(bottomIndent, { line: li, rowCount: rows.length });
    if (INNER_RE.test(line)) rows.push(line);

    const indent = TOP_RE.exec(line)?.[1];
    if (indent === undefined) continue;
    const closer = closers.get(indent);
    const firstRow = closer?.rowCount ?? 0;
    const lastRow = rows.length;
    let inner: readonly string[] | undefined;
    frames.push({
      topLi: li,
      closeLi: closer?.line ?? -1,
      indent,
      // Unclosed frames can share overlapping suffixes. Copy the rows only
      // when a caller actually requests that frame's contents.
      get inner() {
        inner ??= rows.slice(firstRow, lastRow).reverse();
        return inner;
      },
    });
  }

  let cursor = 0;
  for (const frame of frames.toReversed()) {
    if (frame.topLi < cursor) continue;
    yield frame;
    cursor = frame.closeLi === -1 ? frame.topLi + 1 : frame.closeLi + 1;
  }
}
