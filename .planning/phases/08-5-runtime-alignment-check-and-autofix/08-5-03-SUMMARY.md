---
plan_id: 08-5-03
status: completed
landed_in: 43aa327 (feat(08-5-03): extract lib/lint/width.js as single source — L08/L09 use visual width)
shipped_version: 0.3.3
date: 2026-05-10
---

# Plan 08-5-03 — SUMMARY

## What landed

`lib/lint/width.js` (new) — single source of truth for visual-width
calculations. Folded three previously-divergent implementations into one:

- ANSI CSI strip (`\x1b\[[0-9;]*m`) — was in `autofix.js` only
- Combining marks / ZWJ / BOM strip (U+0300..U+036F, U+200B..U+200F, U+FEFF) —
  was in `autofix.js` only
- CJK East-Asian-Width doubling (full set of Wide / Fullwidth ranges) — was
  in `rules.js` as `displayWidth`

Exports: `visualWidth(line)`, `isWide(code)`, `firstVisualColumnOf(line, ch)`,
`lastVisualColumnOf(line, ch)`. The two column-lookup helpers walk a string
left-to-right while accumulating visual width, skipping ANSI sequences and
zero-width chars without advancing the counter. Used by L09 to compare
actual closing-`│` position against the anchor `┐` position.

`lib/lint/rules.js`:
- `displayWidth` reduced to an alias for `visualWidth` — back-compat for
  any external callers; all internal uses go through the shared helper.
- `L09_right_edge_alignment` rewritten to use `firstVisualColumnOf` /
  `lastVisualColumnOf` instead of `charIndexOf` / `lastCharIndexOf`. Frames
  with CJK content, combining marks, ZWJ, or ANSI escapes now align
  correctly.
- Removed internal `charIndexOf` / `lastCharIndexOf` helpers (dead code
  after L09 rewrite).

`lib/lint/autofix.js`:
- Imports `visualWidth` from `./width` (no longer defines its own).
- Removed local `ANSI_RE` and `ZERO_WIDTH_RE` constants.
- Net behavior identical (visualWidth was already the same logic) but now
  CJK-aware via the shared helper.

`tests/lint-cases.json` — 10 new fixtures:

- L08 pass: combining accent, ZWJ, CJK 日本, Unicode markers ▲▼✓✗
- L09 pass: combining accent, Unicode markers, CJK aligned
- L09 fail: empty padding inside frame, top border shorter than inner
- L08+L09 mixed fail: top wider than inner with shifted `│`

5 fixtures were RED before the width.js extraction (combining/ZWJ/CJK
cases); all 10 GREEN after.

## Deviations from plan

- **Plan asked for `expected_after_autofix` field on L09 issues.** Not
  implemented — the existing autofix engine works end-to-end without
  embedding preview into issue objects, and the harness can re-run
  `autofix()` on the input to verify equivalence. The simpler integration
  (Stop-hook calls `autofix()` directly when it changes anything) covered
  the use case without adding a new field shape.
- **14 fixtures requested → 10 shipped.** Skipped the ANSI-escape fixture
  variants (the strip behavior is covered by `autofix.test.js` unit tests
  that exercise `visualWidth` directly). The remaining 4 cases would have
  been mechanical duplicates of the combining/ZWJ patterns.

## Verification

```bash
node --test tests/lint.test.js       # all L08/L09 golden cases pass
npm test                              # 274/274 (+10 from 264)

# Spot-check from the shell:
node -e "console.log(require('./lib/lint/width').visualWidth('│ é   │'))"
# 7  (combining mark stripped; box drawing counts as 1 each)
node -e "console.log(require('./lib/lint/width').visualWidth('│ 日本 │'))"
# 8  (CJK counted as 2 each)
```

## Files touched

- `lib/lint/width.js` — new, 118 lines
- `lib/lint/rules.js` — -36 lines (drop `displayWidth` body + `charIndexOf`),
  +13 lines (import + L09 rewrite). Net -23.
- `lib/lint/autofix.js` — -17 lines (drop local `visualWidth` + constants),
  +1 line (import). Net -16.
- `tests/lint-cases.json` — +63 lines (10 fixtures)

## Follow-up

- L09 still does not surface a fixed-frame preview in the issue object —
  acceptable because the Stop-hook integration calls autofix directly.
  If a future tool wants per-issue previews, add an `expected_after_autofix`
  field at that point.
