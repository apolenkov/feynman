## Context

Two places scan text for `┌─…─┐` frames. `lib/lint/frames.ts` exports the
canonical `nextFrame(lines, startLi)`; the lint rules (L08/L11/L12/L15) all go
through it. `lib/lint/autofix.ts` open-codes a second loop with different
acceptance rules. The two have drifted, so the linter and the autofixer can
disagree on what a frame is — and any future frame-detection fix must be made
twice. This is the lint frame-seam noted but deferred during the ADR-0004 review.

## Goals / Non-Goals

**Goals:**
- One frame definition shared by detection and autofix (`nextFrame`).
- Delete the duplicated loop in `autofix.ts`.
- Pin the resulting behaviour change with regression tests before it ships.

**Non-Goals:**
- No change to any L-rule detection logic.
- No `bin/feynman.ts` decomposition (separate seam).
- No new or renamed autofix CLI options; `--fix` / `convertL11` / `convertL15`
  dispatch stays as-is.

## Decisions

**Adopt `nextFrame` as the single frame iterator.** The autofix loop is replaced
by the documented `nextFrame` usage pattern (advance to `closeLi + 1` when a
closer is found, else `topLi + 1`). The per-frame dispatch (L15 plain → L11
dot-leader → alignment) is unchanged; only how frames are *found* changes.

**Accept the two semantic divergences as the new behaviour, do not paper over
them.** `nextFrame` differs from the old loop in two ways:
1. *Closer search* — `nextFrame` scans to end-of-file, skipping non-inner lines;
   the old loop broke at the first line lacking `indent + │`.
2. *Inner-row set* — `nextFrame` collects fully-bordered `│ … │` rows; the old
   loop collected any line starting with `indent + │`.

Rather than re-add the old loop's early-break to preserve byte-identical output,
we let autofix inherit `nextFrame`'s definition. Rationale: the linter already
treats a holed frame as a frame, so aligning it makes fix and lint agree — the
point of the change. The alternative (parameterise `nextFrame` with an
early-break flag) would move the divergence inside the seam instead of removing
it, exactly the anti-pattern ADR-0004 rejected.

**Bound the `nextFrame` scan to the current non-fence segment.** `nextFrame`
scans to end-of-input, but `autofix` runs on the whole document (the linter,
by contrast, receives one fence-free block at a time from the parser). Left
unbounded, an opener *outside* a ` ``` ` fence would let detection scan across
the fence and align a frame whose closer lives inside fenced sample content —
silently violating the "fenced frames are deliberate samples, leave them alone"
contract. So before each call we cap the scan at the next fence line
(`nextFenceLine`); this keeps fence behaviour byte-identical to the old loop and
makes autofix and the linter agree on segment boundaries, not just frame shape.
This bounds *where* `nextFrame` looks — it does not parameterise the helper or
re-add the old per-hole early-break, so the frame definition stays single.

## Risks / Trade-offs

- **A real diagram with an intentional blank separator line inside a frame now
  gets its inner rows aligned where it previously stayed untouched** → Mitigation:
  regression tests assert the new output explicitly, so the change is visible and
  reviewed, not silent. If a concrete diagram regresses in dogfooding, revisit.
- **`nextFrame` only collects `│ … │` rows, so a runaway row missing its right
  border is no longer treated as inner** → Mitigation: covered by a regression
  test; this matches what the linter already does, so it is the correct reading.
- **Output drift in existing fixtures** → Mitigation: run the full
  `tests/autofix.test.ts` suite; update any fixture whose new output is correct,
  flag any that look wrong.
