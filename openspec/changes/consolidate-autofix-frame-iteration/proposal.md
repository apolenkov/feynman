## Why

`lib/lint/frames.ts` exports `nextFrame`, the one canonical helper that decides
what a `┌─…─┐` frame is — every lint rule (L08, L11, L12, L15) uses it.
`lib/lint/autofix.ts` does **not**: it open-codes its own frame-scanning loop
with subtly different rules. So the linter and the autofixer disagree on what
counts as a frame, and the duplicated loop is a second place any frame-detection
fix has to be made. This is the lint frame-seam left undone by ADR-0004's
consolidation pattern.

## What Changes

- Replace the hand-written frame loop in `autofix.ts` with `nextFrame` from
  `frames.ts`, so autofix and the lint rules share one frame definition.
- **BREAKING (output)**: on a frame with a "hole" — an inner line that is not a
  `│ … │` row (blank line, stray prose) — behaviour changes. The old autofix
  loop stopped at the first non-`indent+│` line and left the frame untouched;
  `nextFrame` scans to the closer past the hole and the frame becomes eligible
  for alignment. Two divergences drive this and are pinned by regression tests:
  1. **closer search** — `nextFrame` scans to end-of-file skipping non-inner
     lines; the old loop broke at the first line without `indent + │`.
  2. **inner-row set** — `nextFrame` collects `│ … │` rows (both borders); the
     old loop collected any line starting with `indent + │` (left border only).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `diagram-lint`: add a requirement that autofix (`--fix`) aligns exactly the
  frames the linter detects — both use the canonical frame definition
  (`nextFrame`), including how a holed frame is treated.

## Impact

- Code: `lib/lint/autofix.ts` (frame loop removed), `lib/lint/frames.ts`
  (canonical helper, unchanged unless a shared gap surfaces).
- Tests: `tests/autofix.test.ts` — new regression cases for both divergences
  (holed frame; left-border-only inner rows) to lock the new behaviour.
- No CLI flags, no dependencies, no other modules.
- Non-goals: this change does not touch the `bin/feynman.ts` decomposition (a
  separate seam), does not alter any L-rule detection, and does not add or
  rename autofix CLI options.
