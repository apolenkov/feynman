---
phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr
plan: "01"
subsystem: hook
tags: [hook, parser, xml, regex, tdd, node]

requires:
  - phase: 07-release
    provides: stable v0.2.x hook baseline with 34 passing tests

provides:
  - dual-format XML + HTML-comment intensity extractor in hooks/feynman-activate.js
  - TDD test suite for XML intensity extraction (7 new cases in describe block)

affects:
  - "08-02 (rule rewrite) — parser is ready; can remove HTML markers from rules/feynman-activate.md"
  - "08-03 (iteration-2 A/B) — hook will extract XML-tagged intensity sections correctly"

tech-stack:
  added: []
  patterns:
    - "pre-compiled regex map (xmlMatchers) per intensity value — avoids RegExp constructor interpolation"
    - "dual-format fallback: XML first, HTML-comment legacy second"
    - "patched-hook test pattern (rewrite RULES_PATH in temp copy) for isolated fixture testing"

key-files:
  created: []
  modified:
    - "hooks/feynman-activate.js — dual-format intensity extractor (Step 5 block)"
    - "tests/hook.test.js — describe('XML intensity extraction') with 7 test cases"

key-decisions:
  - "Pre-compiled xmlMatchers map (not RegExp constructor) — keeps regexes safe and readable"
  - "HTML-comment fallback preserved in hook — allows Plan 02 rule rewrite to land as separate atomic commit"
  - "Inline rule-string fixtures — no separate fixture files for <10-line test snippets"
  - "Legacy regression test uses real rules file (not patched hook) — validates backward compat"

patterns-established:
  - "TDD RED/GREEN for hook parser: write failing tests first, implement minimal extractor to pass"
  - "patched-hook pattern (Path 6 style): rewrite RULES_PATH constant via string replace on hook source"

requirements-completed:
  - PROMPT-10

duration: 3min
completed: 2026-05-10
---

# Phase 8 Plan 01: Hook XML Intensity Extractor Summary

**Dual-format `<intensity name="...">` + HTML-comment regex extractor added to feynman-activate.js via TDD, all 41 tests green**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-10T09:27:40Z
- **Completed:** 2026-05-10T09:30:45Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented `xmlMatchers` lookup map with pre-compiled regexes for `lite`/`full`/`ultra` intensity tags
- HTML-comment fallback preserved so Plan 02 rule rewrite can land as an isolated commit
- 7 new XML extraction tests added: lite/full/ultra extraction, whitespace variants (double + single quote), outside-block ignored, legacy HTML regression
- All 226 `npm test` tests pass (hook.test.js contributes 41, up from 34 baseline)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add XML intensity extraction tests (RED)** - `d3fea09` (test)
2. **Task 2: Implement dual-format extractor (GREEN)** - `97653c8` (feat)

## Files Created/Modified

- `hooks/feynman-activate.js` — Step 5 block replaced: `xmlMatchers` map + XML exec + HTML-comment fallback
- `tests/hook.test.js` — `describe('XML intensity extraction', ...)` block appended (7 test cases)

## Decisions Made

- **Pre-compiled regex map over `RegExp` constructor** — literals are safer (no interpolation attack surface) and pre-compiled for performance; one entry per intensity value
- **HTML-comment fallback kept** — migration commit strategy (CONTEXT.md Area G): parser change isolated from rule-content change; Plan 02 removes HTML markers from `rules/feynman-activate.md`; the fallback is defensive for users running a stale rule file
- **Patched-hook test pattern** — mirrors existing Path 6 approach; rewrites `RULES_PATH` constant in a temp copy of the hook; no new test framework needed
- **Inline rule-string fixtures** — test snippets are <10 lines; separate fixture files would add discovery overhead without isolation benefit (Area F decision from CONTEXT.md)

## Deviations from Plan

None — plan executed exactly as written. Baseline test count was 34 (hook.test.js alone) / 226 (full `npm test`), not 227 as noted in CONTEXT.md — this is a version discrepancy in the docs, not a regression. All tests pass.

## Issues Encountered

- `node --test tests/` (directory form) fails with `Cannot find module` on Node 26 — correct invocation is `node --test tests/*.test.js` or `npm test`. This is a pre-existing issue, not introduced by this plan.

## Next Phase Readiness

- Hook parser is ready for Plan 02: `rules/feynman-activate.md` can be rewritten to use `<intensity name="...">` XML blocks; HTML-comment markers can be removed
- Plan 03 (iteration-2 A/B) unblocked — hook will correctly extract XML-tagged sections once Plan 02 lands

## Self-Check

- `hooks/feynman-activate.js` exists and contains `xmlMatchers` block
- `tests/hook.test.js` exists and contains `describe('XML intensity extraction'`
- Commits `d3fea09` (RED) and `97653c8` (GREEN) exist in git log
- `npm test` exits 0 with 226 passing tests

## Self-Check: PASSED

---
*Phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr*
*Completed: 2026-05-10*
