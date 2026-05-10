# Plan 09-01 Summary: L11_overdecoration detection rule

**Completed:** 2026-05-10
**Status:** ✓ Done
**Plan:** [09-01-PLAN.md](./09-01-PLAN.md)
**Requirements satisfied:** LINT-11

## What shipped

`L11_overdecoration` detects frame blocks (`┌─*┐ … └─*┘`) used for 1-5 inner content lines — a token-wasteful choice when dot-leader equivalent would convey the same data. Severity `warn`. Token-saving estimate included in the issue message.

## Implementation

| Artifact | Location | Notes |
|---|---|---|
| Detection rule | `lib/lint/rules.js:648-714` | matches L08/L09 export shape; uses `visualWidth` from `lib/lint/width.js` (no parallel width math) |
| Registration | `lib/lint/index.js:41` | appended to `perNodeRules` after L09 |
| Module export | `lib/lint/rules.js:677` | added `L11_overdecoration` to registry |
| Fixtures | `tests/lint-cases.json` | 6 added (3 pass + 3 fail) |
| Coverage check | `tests/lint.test.js:65` | `'L11'` added to `ruleIds` |
| Unit tests | `tests/lint.test.js:379-426` | 6 unit tests |

## Whitelist contract

L11 does NOT fire when ANY inner line of a frame contains:
- Nested tree: `├──` or `└──`
- Embedded table column: ≥3 `│` chars (outer pair + ≥1 internal separator)

Rationale: trees and tables convey structure that genuinely needs the frame's outer container; only "5 plain status rows" should be downgraded to dot-leader.

## Token-saving formula

```
saving = max(0, frame_chars − dot_leader_chars)

frame_chars      = visualWidth(top_border) + visualWidth(bottom_border)
                   + Σ visualWidth(inner_line)
dot_leader_chars = Σ (visualWidth(strip_borders_and_trim(inner_line)) + 1)
```

`visualWidth` from `lib/lint/width.js` handles ANSI stripping, combining marks/ZWJ, and CJK widechar correctly.

## Fixture count delta

| Category | Before | After | Delta |
|---|---|---|---|
| Golden L11 fixtures | 0 | 6 | +6 |
| `ruleIds` coverage assertions | 20 (L01-L10 × 2) | 22 (+L11 × 2) | +2 |
| L11 unit tests | 0 | 6 | +6 |

## Test totals

- Baseline (post-Phase 8.5): 279 / 279 pass
- After 09-01: **293 / 293 pass**
- Delta: +14 tests (6 fixtures + 2 coverage + 6 unit)
- Zero regressions in L01-L10

## Deviations from plan

1. **Tree-in-frame whitelist fixture dropped from golden cases.** The plan called for "frame containing nested tree" as a pass-case fixture. In practice, tree chars (`├──` / `└──`) inside a frame trigger pre-existing L01 (orphan `└`) and L02 (last child uses `├──`) errors — error-severity issues block the golden-case `expected=pass` check.

   **Replacement:** a 3-column embedded table fixture (`│ phase │ owner │ state │`) exercises the whitelist via the "≥3 `│`" path instead. Tree-whitelist coverage is preserved in the unit test `frame containing tree NOT flagged (whitelist) — L11 only`, which filters issues by `rule === 'L11'` so L01/L02 noise from the tree chars doesn't break the test.

   This is a fixture-design choice, not a rule-design change. The rule still whitelists trees per the plan's must_haves contract; only the integration-level pass-case fixture moved to a different whitelist signature.

2. **`L11_overdecoration` placed AFTER `L10_mixed_script` (not before module.exports as the plan suggested ~line 647).** The plan said "around line ~647"; actual line was 648-714 (L10 ended at 645). No semantic difference — both placements keep L11 last in the function list before `module.exports`.

## Commits

```
7e9e050 test(09-01): add L11 unit tests for boundary + whitelist behaviour
95b92a2 feat(09-01): implement L11_overdecoration detection rule
e39215d test(09-01): add failing fixtures for L11_overdecoration (RED)
```

## Verification

```bash
$ npm test 2>&1 | grep -E "^ℹ"
ℹ tests 293
ℹ pass 293
ℹ fail 0

$ grep -c "function L11_overdecoration" lib/lint/rules.js
1

$ grep -c "L11_overdecoration" lib/lint/index.js
1

$ grep -c '"rule": "L11"' tests/lint-cases.json
9   # 6 fixtures + 3 expected_issues entries

$ grep -c "'L11'" tests/lint.test.js
1   # ruleIds array entry
```

## Next

→ Plan 09-02: L12_token_budget (detect padding-dominated frames + tables; `--explain` annotation is part of Plan 09-05).
