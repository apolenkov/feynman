# Plan 09-03 Summary: L13_double_wrap detection rule

**Completed:** 2026-05-10
**Status:** ✓ Done
**Plan:** [09-03-PLAN.md](./09-03-PLAN.md)
**Requirements satisfied:** LINT-13

## What shipped

`L13_double_wrap` detects tree characters (`├──` / `└──`) inside a frame block — a redundant wrap because tree indentation already conveys hierarchy. Severity `warn`.

## Implementation

| Artifact | Location | Notes |
|---|---|---|
| Detection rule | `lib/lint/rules.js` (after L12) | matches L11/L12 frame-walker shape |
| Registration | `lib/lint/index.js:43` | appended after L12 |
| Module export | `lib/lint/rules.js` registry | `L13_double_wrap` |
| Fixtures | `tests/lint-cases.json` | 6 added (3 pass + 3 fail) |
| Coverage check | `tests/lint.test.js:65` | `'L13'` added to `ruleIds` |
| Unit tests | `tests/lint.test.js` | 4 unit tests (including L11/L13 complementarity check) |

## L11 / L13 split of concerns

Both rules fire on tree-in-frame, but communicate different fixes:

| Rule | Trigger | Message | Fix proposed |
|---|---|---|---|
| L11 | frame ≤5 lines, no tree, no embedded table | "frame used for N items; consider dot-leader" | Replace frame with dot-leader |
| L13 | tree (├──/└──) inside any frame | "tree inside frame block — drop the frame" | Drop borders, keep tree |

Tree-in-frame: L11 whitelists (silent), L13 fires. Pinned by unit test `L11 and L13 are complementary on tree-in-frame: L11 silent, L13 fires`.

Plain-frame-≤5: L11 fires, L13 silent. Plain-tree (no frame): both silent. The matrix is clean.

## Test totals

- Baseline before Plan 09-03: 305 / 305 (from Plan 09-02)
- After 09-03: **317 / 317 pass**
- Delta: +12 tests (6 fixtures + 2 coverage + 4 unit)

## Commits

```
1faaaca test(09-03): add L13 unit tests + L11/L13 complementarity check
b74c840 feat(09-03): implement L13_double_wrap detection rule
7f368a3 test(09-03): add failing fixtures for L13_double_wrap (RED)
```

## Phase 9 detection-rules progress

```
Wave 1: 09-01 (L11) ────► ✓ done
Wave 2: 09-02 (L12) ────► ✓ done
Wave 3: 09-03 (L13) ────► ✓ done
Wave 4: 09-04 (LINT-14 autofix) ← HUMAN GATE
        09-05 (--explain CLI)
Wave 5: 09-06 (docs L01-L13)
```

3 of 5 plans complete. 317 tests, +38 from milestone baseline (279).

## Next

**HUMAN GATE before Wave 4:** Plan 09-04 (LINT-14 autofix from frame to dot-leader) carries 4 design decision points that need operator confirmation before execution. See `09-04-PLAN.md` frontmatter `must_haves.decision_points`. Plan 09-05 (`--explain` CLI flag) is parallel to 09-04 (different files) and carries no HUMAN gate — could proceed independently.
