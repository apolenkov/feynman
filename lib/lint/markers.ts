// lib/lint/markers.ts — shared lint detection patterns used by BOTH the rules
// (detection) and autofix (transformation), kept in one place so they cannot
// drift. A byte-identical copy previously lived in rules.ts and autofix.ts.
// Zero runtime dependencies. ESM + TypeScript (Node.js v22.6+ strip-types).

// A frame line that carries a status/state marker: a "← готов/решение/…"
// annotation, a leading status glyph (✓ ✗ ◐ ⌛ →), or a trailing English status
// word. Used by L15_homogeneous_frame (detection) and the autofix frame
// classifier (transformation). Non-global so callers may .test() it directly;
// autofix clones it via new RegExp(src, flags) where it needs a fresh lastIndex.
export const STATE_MARKER_RE =
  /(← (?:готов|решение|заморожено|в работе|блок:[^│\n]+))|((?:✓|✗|◐|⌛|→) \S+)|\b(done|pending|wip|ok|fail|wait)\b\s*$/i;
