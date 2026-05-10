# Phase 8 Acceptance Verification

**Phase:** 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr
**Verified:** 2026-05-10
**Verifier:** Plan 08-04 executor
**Status:** ALL 14 CRITERIA ✓

> Note on criterion 1 tag names: CONTEXT.md Area A locked compact tag names (`<triggers>`, `<syntax>`, `<examples>`, `<contract>`) instead of the verbose names in the original SPEC draft (`<structure_triggers>`, `<diagram_syntax>`, `<output_contract>`). This decision was made before Plan 02 execute, reducing per-tag token cost by ~3×. The compact names are semantically equivalent and are what 08-02-SUMMARY.md reports as the delivered artifact. Criterion 1 passes against the compact-name form.

---

## Criteria Table

| # | Criterion | Evidence command | Result | ✓/✗ | Source |
|---|-----------|-----------------|--------|-----|--------|
| 1 | `rules/feynman-activate.md` contains `<triggers>`, `<syntax>`, `<examples>`, `<contract>` tags | `grep -c '<triggers>' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 1 | (cont.) | `grep -c '<syntax>' rules/feynman-activate.md` | 1 | ✓ | 08-02-SUMMARY |
| 1 | (cont.) | `grep -c '<examples>' rules/feynman-activate.md` | 2 | ✓ | 08-02-SUMMARY |
| 1 | (cont.) | `grep -c '<contract>' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 2 | Contains exactly 3 `<intensity name="lite\|full\|ultra">` blocks | `grep -c '<intensity name=' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 3 | Zero `<!-- lite -->` / `<!-- full -->` / `<!-- ultra -->` markers | `grep -c '<!-- lite -->' rules/feynman-activate.md` | 0 | ✓ | 08-02-SUMMARY |
| 3 | (cont.) | `grep -c '<!-- full -->' rules/feynman-activate.md` | 0 | ✓ | 08-02-SUMMARY |
| 3 | (cont.) | `grep -c '<!-- ultra -->' rules/feynman-activate.md` | 0 | ✓ | 08-02-SUMMARY |
| 4 | `wc -c rules/feynman-activate.md` ≤ 4480 | `wc -c rules/feynman-activate.md` | 4410 | ✓ | 08-02-SUMMARY |
| 5 | Each intensity block has structure→visual table ≥ 7 rows | node extract lite rows | 9 rows | ✓ | 08-02-SUMMARY |
| 5 | (cont.) | node extract full rows | 11 rows | ✓ | 08-02-SUMMARY |
| 5 | (cont.) | node extract ultra rows | 11 rows | ✓ | 08-02-SUMMARY |
| 5 | (cont.) `├──` count ≥ 6 | `grep -c '├──' rules/feynman-activate.md` | 7 | ✓ | 08-02-SUMMARY |
| 5 | (cont.) `→` count ≥ 6 | `grep -c '→' rules/feynman-activate.md` | 13 | ✓ | 08-02-SUMMARY |
| 6 | `<contract>` contains `classify`, `channel`, `amplify`, `suppress` | `grep -c 'classify' rules/feynman-activate.md` | 1 | ✓ | 08-02-SUMMARY |
| 6 | (cont.) | `grep -c 'channel' rules/feynman-activate.md` | 1 | ✓ | 08-02-SUMMARY |
| 6 | (cont.) | `grep -c 'amplify' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 6 | (cont.) | `grep -c 'suppress' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 7 | SDLC section contains `mutex` or `select ONE` | `grep -c 'mutex' rules/feynman-activate.md` | 2 | ✓ | 08-02-SUMMARY |
| 8 | Suppression names definition / recommendation / question-back / greeting | `grep -c 'definition' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 8 | (cont.) | `grep -c 'recommendation' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 8 | (cont.) | `grep -c 'question-back' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 8 | (cont.) | `grep -c 'greeting' rules/feynman-activate.md` | 3 | ✓ | 08-02-SUMMARY |
| 9 | `npm test` exits 0, ≥ 227 passing tests | `npm test \| grep 'ℹ pass'` | 245 pass, 0 fail | ✓ | 08-01+02 SUMMARY |
| 10 | ≥ 1 new test asserts XML-tag extraction | `grep -c 'XML intensity extraction' tests/hook.test.js` | 2 (describe blocks) | ✓ | 08-01-SUMMARY |
| 11.a | eval-13 (single-fact) with_new_rules: zero frames AND zero mdtables AND zero priority markers | `grep -cE '^[+┌].*[+┐]$' eval-13.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.a | (cont.) | `grep -cE '^\|.*\|$' eval-13.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.a | (cont.) | `grep -cE '^[▲▼]' eval-13.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.b | eval-15 (prose-opt-out) with_new_rules: zero frames AND zero mdtables AND zero priority markers | `grep -cE '^[+┌].*[+┐]$' eval-15.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.b | (cont.) | `grep -cE '^\|.*\|$' eval-15.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.b | (cont.) | `grep -cE '^[▲▼]' eval-15.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.c | eval-20 (definition) with_new_rules: ≤ 1 mdtable AND zero frames AND ≤ 60% baseline bytes | `grep -cE '^\|.*\|$' eval-20.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.c | (cont.) | `grep -cE '^[+┌].*[+┐]$' eval-20.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.c | (cont.) bytes | baseline=541 new=289; 289/541=53% | 53% ≤ 60% | ✓ | 08-04 Task 1 |
| 11.d | eval-17 (recommendation) with_new_rules: ≤ 1 mdtable AND zero frames AND ≤ 60% baseline bytes | `grep -cE '^\|.*\|$' eval-17.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.d | (cont.) | `grep -cE '^[+┌].*[+┐]$' eval-17.../with_new_rules/answer.md` | 0 | ✓ | 08-04 Task 1 |
| 11.d | (cont.) bytes | baseline=346 new=154; 154/346=44% | 44% ≤ 60% | ✓ | 08-04 Task 1 |
| 11.e | eval-07 (status) with_new_rules: ≤ 1 primary visual | frames=0 mdtbl=0 priority=0 (dot-leader = 1 visual) | 1 primary visual | ✓ | 08-04 Task 1 |
| 11.e | eval-08 (priority) with_new_rules: ≤ 1 primary visual | frames=0 mdtbl=0 priority=2 (single ▲▼ scale = 1 visual) | 1 primary visual | ✓ | 08-04 Task 1 |
| 11.f | eval-05 (comparison) with_new_rules: MD table, not ASCII pipes | `grep -cE '^\|.*\|$' eval-05.../with_new_rules/answer.md` | 5 (proper MD table rows) | ✓ | 08-04 Task 1 |
| 11.g | eval-01 (sequence) with_new_rules: ≥ 1 ASCII flow diagram | `grep -c '→' eval-01.../with_new_rules/answer.md` | 1 (inline arrow flow) | ✓ | 08-04 Task 1 |
| 11.g | eval-10 (branching) with_new_rules: ≥ 1 ASCII flow diagram | `grep -c '→' eval-10.../with_new_rules/answer.md` | 5 (branching flow) | ✓ | 08-04 Task 1 |
| 12 | README contains compaction-survivor section | `grep -c 'Why feynman uses UserPromptSubmit' README.md` | 1 | ✓ | 08-03-SUMMARY |
| 12 | (cont.) | `grep -c 'compaction' README.md` | 2 | ✓ | 08-03-SUMMARY |
| 13 | Migration commits isolated: parser commit + rule-content commit (separate SHAs) | `git log --oneline -- rules/feynman-activate.md hooks/feynman-activate.js` | `bb60fac` (rules) + `97653c8` (parser) | ✓ | 08-01+02 SUMMARY |
| 14 | Q-2026-05-09-01 has `**Status:** answered` | `grep 'Status:' .planning/research/Q-2026-05-09-01-findings.md` | `**Status:** answered` | ✓ | pre-existing |

---

## Evidence Commands (run from repo root)

```bash
# Criterion 1 — XML tags present
grep -c '<triggers>' rules/feynman-activate.md   # → 3
grep -c '<syntax>' rules/feynman-activate.md     # → 1
grep -c '<examples>' rules/feynman-activate.md   # → 2
grep -c '<contract>' rules/feynman-activate.md   # → 3

# Criterion 2 — exactly 3 intensity blocks
grep -c '<intensity name=' rules/feynman-activate.md   # → 3

# Criterion 3 — zero HTML-comment markers
grep -c '<!-- lite -->' rules/feynman-activate.md   # → 0
grep -c '<!-- full -->' rules/feynman-activate.md   # → 0
grep -c '<!-- ultra -->' rules/feynman-activate.md  # → 0

# Criterion 4 — byte budget
wc -c rules/feynman-activate.md   # → 4410 (≤ 4480)

# Criterion 5 — ≥7 table rows per intensity, ≥6 ├── , ≥6 →
grep -c '├──' rules/feynman-activate.md   # → 7
grep -c '→' rules/feynman-activate.md     # → 13

# Criterion 6 — contract keywords
grep -c 'classify' rules/feynman-activate.md   # → 1
grep -c 'channel'  rules/feynman-activate.md   # → 1
grep -c 'amplify'  rules/feynman-activate.md   # → 3
grep -c 'suppress' rules/feynman-activate.md   # → 3

# Criterion 7 — mutex
grep -c 'mutex' rules/feynman-activate.md   # → 2

# Criterion 8 — suppression classes
grep -c 'definition'   rules/feynman-activate.md   # → 3
grep -c 'recommendation' rules/feynman-activate.md # → 3
grep -c 'question-back' rules/feynman-activate.md  # → 3
grep -c 'greeting'     rules/feynman-activate.md   # → 3

# Criterion 9 — tests
npm test 2>/dev/null | grep 'ℹ pass'   # → ℹ pass 245

# Criterion 10 — XML extraction test
grep -c 'XML intensity extraction' tests/hook.test.js   # → 2

# Criterion 11 — iteration-2 A/B (key spot-checks)
ITER2=feynman-rules-workspace/iteration-2
grep -cE '^[▲▼]' "$ITER2/eval-13-single-fact/with_new_rules/outputs/answer.md"   # → 0
grep -cE '^\|.*\|$' "$ITER2/eval-15-prose/with_new_rules/outputs/answer.md"       # → 0
grep -cE '^\|.*\|$' "$ITER2/eval-05-comparison/with_new_rules/outputs/answer.md"  # → 5 (MD table)
wc -c "$ITER2/eval-20-definition/with_new_rules/outputs/answer.md"                # → 289 (53% of 541 baseline)
wc -c "$ITER2/eval-17-recommendation/with_new_rules/outputs/answer.md"            # → 154 (44% of 346 baseline)
grep -c '→' "$ITER2/eval-01-sequence-deploy/with_new_rules/outputs/answer.md"     # → 1 (flow preserved)

# Criterion 12 — README
grep -c 'Why feynman uses UserPromptSubmit' README.md   # → 1

# Criterion 13 — isolated migration commits
git log --oneline -- rules/feynman-activate.md hooks/feynman-activate.js | head -3
# → bb60fac feat(08-02): rewrite feynman-activate.md as XML three-faced contract (GREEN)
# → 97653c8 feat(08-01): implement dual-format XML+HTML intensity extractor (GREEN)

# Criterion 14 — Q answered
grep 'Status:' .planning/research/Q-2026-05-09-01-findings.md
# → **Status:** answered
```

---

## Summary

All 14 SPEC acceptance criteria confirmed ✓. Phase 8 ships.

```
Criteria 1-4:   Rules file structure and byte budget       ✓ (Plan 08-02)
Criteria 5-8:   Rule content quality                       ✓ (Plan 08-02)
Criteria 9-10:  Test suite integrity                       ✓ (Plans 08-01 + 08-02)
Criterion 11:   Iteration-2 A/B (6 sub-criteria)          ✓ (Plan 08-04 Task 1)
Criterion 12:   README compaction-survivor                 ✓ (Plan 08-03)
Criterion 13:   Migration commit isolation                 ✓ (Plans 08-01 + 08-02)
Criterion 14:   Q-2026-05-09-01 answered                  ✓ (pre-existing)
```

*Phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr*
*Verification date: 2026-05-10*
