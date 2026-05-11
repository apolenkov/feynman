---
phase: 16-candidate-rule-sets
plan: 01
status: complete
commit: pending
---

# Summary: Phase 16 — Candidate Rule Sets

## What was done

Created four candidate rule files in `eval/v0.5.0-compliance/`:

| File | Intervention | Bytes |
|------|-------------|-------|
| rules-v05-A.md | Caption brevity (H1) | 4252 |
| rules-v05-B.md | No-narration (H2) | 4249 |
| rules-v05-C.md | Length budget (H3) | 4341 |
| rules-v05-ABC.md | A+B+C combined | 4480 |

Each file = compacted base (4049 B from Phase 15) + one `<verbosity name="X">` block.

## Intervention texts

**A (caption brevity)**: `prefer shortest noun phrase for labels. No articles, no verbs.
Example: "auth flow" instead of "authentication flow diagram".`

**B (no-narration)**: `classify shape silently. Prefer diagram-first; add prose only when
diagram alone is ambiguous. Instead of "Here is the sequence:", just show the diagram.`

**C (length budget)**: `prefer ≤50 prose words (structural) / ≤120 (general).
Word count excludes code-fenced and ASCII blocks. Prose supplements; instead of duplicating,
prefer cutting commentary that the diagram already shows.`

**ABC**: All three as labeled items A/B/C in one block; trimmed to fit exactly 4480 bytes.

## Success criteria

- [x] CAND-01: rules-v05-A.md ≤4480 bytes, positive example ✓ (4252 B, 6 matches)
- [x] CAND-02: rules-v05-B.md ≤4480 bytes, positive framing ✓ (4249 B, 4 matches)
- [x] CAND-03: rules-v05-C.md ≤4480 bytes, excludes code-fenced/ASCII ✓ (4341 B, 1 grep match)
- [x] CAND-04: rules-v05-ABC.md ≤4480 bytes ✓ (exactly 4480 B)
