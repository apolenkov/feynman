// lib/lint/frames.ts — canonical frame-iteration helper
// Provides ONE shared iterateFrames() that all lint rules and CLI tools use.
// Zero deps. ESM only.
//
// Design:
//   - Opener: /^(\s*)┌─[^┌\n]*┐\s*$/ — title-aware (superset of /^(\s*)┌─+┐\s*$/).
//     Matches both  ┌────┐  (untitled)  and  ┌─ Title ─┐  (titled).
//   - Closer: /^(\s*)└─*┘\s*$/ — matches ┌┘ (zero dashes) used in L15.
//   - Indent equality: botMatch indent must equal top indent.
//   - inner: lines strictly between top and close that contain │ (leading bar).
//   - titled: true when the opener has text between the dashes.
//   - Caller advances past closeLi or stays at topLi+1 depending on the 'found' flag.

export interface FrameInfo {
  /** 0-based index of the opening ┌ line in the supplied lines array. */
  topLi: number;
  /** 0-based index of the closing └ line. -1 if no matching closer found. */
  closeLi: number;
  /** Whitespace-only prefix of the opener (the indent string). */
  indent: string;
  /** Lines strictly between top and close that contain a │ character. */
  inner: string[];
  /** True when the opener has non-dash text in the title area. */
  titled: boolean;
}

// Title-aware opener: ┌─ followed by anything that isn't ┌ or newline, ending ┐.
// This matches both ┌──────┐ (untitled) and ┌─ Some Title ─┐ (titled).
const TOP_RE = /^(\s*)┌─[^┌\n]*┐\s*$/;

// Title detection: the opener contains non-dash / non-space visible chars after ┌─.
// Matches a titled frame like ┌─ Title ─┐ (has letter/digit/punctuation).
const TITLED_RE = /┌─[^─┐\s]/;

// Closer: └ followed by zero or more dashes, then ┘ (with optional leading indent/trailing space).
const BOT_RE = /^(\s*)└─*┘\s*$/;

/**
 * Yield every frame found in `lines` starting from `startIndex`.
 * A frame is a pair of matching opener / closer lines plus the inner content.
 *
 * Usage:
 *   let li = 0;
 *   while (li < lines.length) {
 *     const frame = nextFrame(lines, li);
 *     if (!frame) { li++; continue; }
 *     // process frame …
 *     li = frame.closeLi !== -1 ? frame.closeLi + 1 : frame.topLi + 1;
 *   }
 *
 * @param lines   The split lines of the content string.
 * @param startLi 0-based line index to start scanning from.
 * @returns       FrameInfo for the FIRST frame found at or after startLi,
 *                or null if no opener is found.
 */
export function nextFrame(lines: readonly string[], startLi: number): FrameInfo | null {
  for (let li = startLi; li < lines.length; li++) {
    const top = lines[li]!;
    const topMatch = top.match(TOP_RE);
    if (!topMatch) continue;

    const indent = topMatch[1]!;
    const titled = TITLED_RE.test(top);

    // Search for the matching closer at the same indent.
    let closeLi = -1;
    const inner: string[] = [];

    for (let lj = li + 1; lj < lines.length; lj++) {
      const next = lines[lj]!;
      const botMatch = next.match(BOT_RE);
      if (botMatch && botMatch[1] === indent) {
        closeLi = lj;
        break;
      }
      // Collect lines that are fully bordered (start AND end with │),
    // matching the original /^\s*│.*│\s*$/ predicate used by L11, L12,
    // and explainFrames. This keeps inner-set semantics byte-identical
    // with the pre-migration code for all well-formed frames.
      if (/^\s*│.*│\s*$/.test(next)) {
        inner.push(next);
      }
    }

    return { topLi: li, closeLi, indent, inner, titled };
  }

  return null;
}
