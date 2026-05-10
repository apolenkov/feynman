# Plan 09-02 Summary: L12_token_budget + estimateFrameCost helper

**Completed:** 2026-05-10
**Status:** ✓ Done
**Plan:** [09-02-PLAN.md](./09-02-PLAN.md)
**Requirements satisfied:** LINT-12

## What shipped

`L12_token_budget` detects frames where padding chars exceed content chars (padding-dominated visual). Severity `warn`. Tree-whitelist preserved consistent with L11.

`estimateFrameCost(node)` helper exported as the single-source cost-computation primitive. Consumed by L12 detection AND by the `--explain` CLI flag (Plan 09-05 dependency).

## Implementation

| Artifact | Location | Notes |
|---|---|---|
| Detection rule | `lib/lint/rules.js:716-770` (approx) | matches L11 frame-walker shape |
| Cost helper | `lib/lint/rules.js:670-714` (approx) | exported in module.exports |
| Registration | `lib/lint/index.js:42` | appended after L11 |
| Module exports | `lib/lint/rules.js` registry | `L12_token_budget`, `estimateFrameCost` |
| Fixtures | `tests/lint-cases.json` | 6 added (3 pass + 3 fail) |
| Coverage check | `tests/lint.test.js:65` | `'L12'` added to `ruleIds` |
| Unit tests | `tests/lint.test.js` | 4 unit tests |

## estimateFrameCost shape

```javascript
estimateFrameCost({ top, inner: string[], bottom }) => {
  framing_chars,       // visualWidth(top) + visualWidth(bottom) + Σ visualWidth(inner_lines)
  content_chars,       // Σ visualWidth(strip_outer_pipes_and_trim(inner_line))
  border_chars,        // visualWidth(top) + visualWidth(bottom)
  padding_chars,       // inner_chars - content_chars  (clamped ≥ 0)
  dotleader_equivalent,// content_chars + inner.length  (estimated)
  saving,              // framing_chars - dotleader_equivalent  (clamped ≥ 0)
}
```

All width arithmetic uses `lib/lint/width.js#visualWidth` — single visual-width source preserved.

## L12 threshold

Fires `warn` when `padding_chars > content_chars`. Tightly-packed frames where content dominates (real diagrams) pass cleanly. Wide frames with tiny labels (the common overdecoration anti-pattern) fail.

## Test totals

- Baseline before Plan 09-02: 293 / 293 (from Plan 09-01)
- After 09-02: **305 / 305 pass**
- Delta: +12 tests (6 fixtures + 2 coverage + 4 unit)
- Zero regressions in L01-L11

## Commits

```
c8c1727 test(09-02): add L12 unit tests for cost-shape and threshold
695878a feat(09-02): implement L12_token_budget + estimateFrameCost helper
cba79a8 test(09-02): add failing fixtures for L12_token_budget (RED)
```

## Notes for downstream consumers

- **Plan 09-05 (--explain CLI flag):** import `estimateFrameCost` from `lib/lint/rules`. The shape is stable across this milestone — adding fields is backward-compatible; renaming requires a coordinated migration.
- **Plan 09-04 (LINT-14 autofix):** shares the frame-walker logic with L11/L12. When designing the autofix, reusing `estimateFrameCost` for the token-saving annotation in the autofix's "before/after" output is recommended.

## Deviations from plan

1. **First fixture (tight frame) needed width adjustment.** Plan provided a 49-char-wide inner line for a 51-char top border — produced L08/L09 width-mismatch errors that blocked `expected=pass`. Regenerated the fixture with a width-50 frame and 48-char inner content (zero L08/L09 errors). Semantically identical to the planned case.

2. **Unit test ordering.** Plan said "append to lint.test.js after the L11 unit-test block" — implemented as a separate `describe('L12 token-budget — unit tests')` block immediately before `Parser: standalone diagram detection` (where L11's block also lives). Same effective placement.

## Verification

```bash
$ npm test 2>&1 | grep -E "^ℹ"
ℹ tests 305
ℹ pass 305
ℹ fail 0

$ grep -c "function L12_token_budget" lib/lint/rules.js
1

$ grep -c "function estimateFrameCost" lib/lint/rules.js
1

$ node -e "console.log(typeof require('./lib/lint/rules').estimateFrameCost)"
function
```

## Next

→ Plan 09-03: L13_double_wrap (detect tree inside frame; warn — note this triggers ONLY when L11/L12 do NOT fire, because L11/L12 already whitelist trees-in-frames).
