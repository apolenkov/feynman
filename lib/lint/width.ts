// lib/lint/width.ts — single source of truth for visual-width calculations.
// Used by rules.ts (L08, L09) and autofix.ts. Zero deps. ESM only.
//
// Folded together from rules.js displayWidth (CJK East Asian wide) and
// autofix.js visualWidth (ANSI strip + combining/ZWJ strip). The unified
// function is the canonical "how many terminal columns does this string
// occupy" — used everywhere a frame border must align.

// ANSI CSI sequences (SGR color codes etc.). Hex-escape ESC to keep the
// file free of literal control bytes.
const ANSI_RE = /\x1b\[[0-9;]*m/g;

// Zero-width: combining marks (Mn) U+0300..U+036F, zero-width joiners
// U+200B..U+200F (ZWSP, ZWNJ, ZWJ, LRM, RLM), and BOM U+FEFF.
const ZERO_WIDTH_RE = /[̀-ͯ​-‏﻿]/g;
// Non-global twin for single-char membership testing (avoids lastIndex drift).
const ZERO_WIDTH_TEST_RE = /[̀-ͯ​-‏﻿]/;

// East-Asian Wide / Fullwidth code-point ranges. These render as 2
// terminal columns in most monospace fonts. Box-drawing chars
// (U+2500..U+257F) are intentionally NOT in this list — they render as
// width 1.
export function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115F) ||
    (code >= 0x2E80 && code <= 0x303E) ||
    (code >= 0x3040 && code <= 0x33FF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0x4E00 && code <= 0xA4CF) ||
    (code >= 0xA960 && code <= 0xA97F) ||
    (code >= 0xAC00 && code <= 0xD7FF) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFE10 && code <= 0xFE1F) ||
    (code >= 0xFE30 && code <= 0xFE4F) ||
    (code >= 0xFF00 && code <= 0xFF60) ||
    (code >= 0xFFE0 && code <= 0xFFE6) ||
    (code >= 0x1F300 && code <= 0x1F64F) ||
    (code >= 0x1F900 && code <= 0x1F9FF) ||
    (code >= 0x20000 && code <= 0x2FFFD) ||
    (code >= 0x30000 && code <= 0x3FFFD)
  );
}

export function visualWidth(line: string | undefined | null): number {
  if (!line) return 0;
  const stripped = String(line).replace(ANSI_RE, '').replace(ZERO_WIDTH_RE, '');
  let w = 0;
  for (const ch of stripped) {
    w += isWide(ch.codePointAt(0)!) ? 2 : 1;
  }
  return w;
}

// Find the visual column (1-based) where the LAST occurrence of `ch` in
// `line` lands. Returns -1 if not found. Wide chars before the target
// count for 2 columns; combining marks and ANSI escapes count for 0.
// Used by L09 to compare actual closing-│ position against the anchor.
export function lastVisualColumnOf(line: string, ch: string): number {
  if (!line) return -1;
  // Walk left→right while accumulating visual width; remember the column
  // of the last matching codepoint.
  let col = 0;
  let last = -1;
  // We need to skip ANSI escapes and zero-width chars without advancing
  // the column counter — so walk the original string and detect runs.
  let i = 0;
  const s = String(line);
  while (i < s.length) {
    // Skip ANSI CSI sequence (\x1b[...m)
    if (s.charCodeAt(i) === 0x1b && s[i + 1] === '[') {
      const m = s.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (m) { i += m[0].length; continue; }
    }
    const code = s.codePointAt(i)!;
    const charLen = code > 0xFFFF ? 2 : 1; // surrogate pair occupies 2 UTF-16 units
    // Zero-width: do not advance col
    if (ZERO_WIDTH_TEST_RE.test(String.fromCodePoint(code))) {
      if (String.fromCodePoint(code) === ch) last = col;
      i += charLen;
      continue;
    }
    const w = isWide(code) ? 2 : 1;
    col += w;
    if (String.fromCodePoint(code) === ch) last = col;
    i += charLen;
  }
  return last;
}

export function firstVisualColumnOf(line: string, ch: string): number {
  if (!line) return -1;
  let col = 0;
  let i = 0;
  const s = String(line);
  while (i < s.length) {
    if (s.charCodeAt(i) === 0x1b && s[i + 1] === '[') {
      const m = s.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (m) { i += m[0].length; continue; }
    }
    const code = s.codePointAt(i)!;
    const charLen = code > 0xFFFF ? 2 : 1;
    if (ZERO_WIDTH_RE.test(String.fromCodePoint(code))) {
      ZERO_WIDTH_RE.lastIndex = 0;
      if (String.fromCodePoint(code) === ch) return col;
      i += charLen;
      continue;
    }
    ZERO_WIDTH_RE.lastIndex = 0;
    const w = isWide(code) ? 2 : 1;
    col += w;
    if (String.fromCodePoint(code) === ch) return col;
    i += charLen;
  }
  return -1;
}
