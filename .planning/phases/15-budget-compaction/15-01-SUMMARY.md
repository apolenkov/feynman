---
phase: 15-budget-compaction
plan: 01
status: complete
commit: pending
---

# Summary: Phase 15 — Budget Compaction

## What was done

Single cut applied to `rules/feynman-activate.md`:

**Cut 1**: Removed the `note` column from `full/triggers` table (3-column → 2-column).
The note column contained explanations like "A → B → C", "├── └──", "yes/no paths", etc.
Also removed "Secondary visuals only for orthogonal information." trailing line.

## Results

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| bytes | 4443 | 4049 | ≤4147 |
| slack | 37 B | 431 B | ≥333 B |
| ├── count | 7 | 6 | ≥6 |
| → count | 26 | 26 | ≥6 |
| vocabulary tokens | 4 | 4 | 4 |
| suppression words | 4 | 4 | 4 |
| npm test | — | 364/364 | all pass |

## Success criteria

- [x] COMP-01: ≥333 bytes freed (431 bytes freed, slack = 431 B)
- [x] COMP-02: npm test exits 0 (364/364 pass)
- [x] COMP-03: slack ≥333 bytes confirmed (4480 − 4049 = 431)

## Notes

The `├──` count dropped from 7 to 6 (exactly at minimum) because the note column
contained one `├── └──` example string. This means no further cuts can remove
any `├──` occurrence without failing tests. The `full/examples` second tree must
be preserved.

Phase 16 now has 431 bytes available for candidate interventions A, B, C, ABC.
