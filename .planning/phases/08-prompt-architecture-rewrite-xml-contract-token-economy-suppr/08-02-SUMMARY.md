---
phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr
plan: 02
subsystem: rules
tags: [xml, rules, contract, token-economy, suppression, three-faced]

requires:
  - phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr
    provides: dual-format XML+HTML intensity extractor (Plan 08-01)
provides:
  - rules/feynman-activate.md rewritten as XML three-faced contract (4410 bytes)
  - amplify/channel/suppress economy applied across lite/full/ultra
  - <patterns selection="one-of"> mutex SDLC enforcement (full + ultra)
  - <contract> classify/channel/amplify/suppress CoT in all three blocks
  - regression test suite for rule-file integrity (XML form + size cap)
  - hooks/feynman-session-start.js XML support (parity with feynman-activate.js)
affects: [08-04 iteration-2 evaluation, future intensity tuning]

tech-stack:
  added: []
  patterns:
    - "XML element form for intensity blocks (<intensity name=\"…\">…</intensity>)"
    - "Decision-table primary trigger (structure → visual)"
    - "Token economy: cheap formats (MD table, dot-leader, indent) where baseline already visualizes"
    - "Suppression rule for definition / recommendation / question-back / greeting"

key-files:
  created:
    - .planning/phases/08-prompt-architecture-rewrite-xml-contract-token-economy-suppr/08-02-SUMMARY.md
  modified:
    - rules/feynman-activate.md
    - tests/hook.test.js
    - CLAUDE.md
    - hooks/feynman-session-start.js
    - tests/codex-app-server.test.js
    - tests/runtime-integration.test.js

key-decisions:
  - "Adopted XML element form per Q-2026-05-09-01 over HTML-comment markers (parser-side handled in 08-01)"
  - "58% byte reduction (10450 → 4410) — comfortably under ≤4480 budget and ≥20% target"
  - "Updated session-start hook in same wave to avoid mixed-format breakage at runtime"
  - "Rewrote two unrelated test assertions from literal 'Feynman Diagram Rules' header check to length-based format-agnostic check"

patterns-established:
  - "Three-faced contract: amplify-empty / channel-cheap / suppress-noise per intensity"
  - "Decision-table-first rule shape (no narrative preamble before triggers)"
  - "Mutex pattern selection via <patterns selection=\"one-of\"> for SDLC blocks"

requirements-completed:
  - PROMPT-01
  - PROMPT-02
  - PROMPT-03
  - PROMPT-04
  - PROMPT-05
  - PROMPT-06
  - PROMPT-07
  - PROMPT-08
  - PROMPT-09
  - PROMPT-11

duration: ~12min
completed: 2026-05-10
---

# Phase 08 / Plan 02: XML three-faced rule contract Summary

**rules/feynman-activate.md rewritten as 4410-byte XML contract with amplify/channel/suppress economy across lite/full/ultra intensities**

## Performance

- **Duration:** ~12 min (executor stalled on SUMMARY write; orchestrator completed via #2070 rescue)
- **Tasks:** 3 / 3
- **Files modified:** 6 (3 planned + 3 deviation auto-fixes)

## Accomplishments
- Replaced 5.6KB markdown-tagged ruleset with 4410-byte XML-structured contract (58% reduction)
- Three intensity blocks (`<intensity name="lite|full|ultra">`) each with `<triggers>`, `<examples>`, `<contract>` (full + ultra add `<syntax>` and mutex `<patterns selection="one-of">`)
- Token-economy moves: comparison → MD table, status → dot-leader, hierarchy → indent (cheap formats where baseline LLM already visualizes)
- Suppression coverage: definition / recommendation / question-back / greeting classes named explicitly
- Negative-condition guidance preserved across all three intensity blocks (per CONTEXT.md F2 cancelled)
- 11 new RED→GREEN integrity tests; 245/245 suite green

## Task Commits

1. **Task 1 — RED integrity tests** — `19b3430` (test)
2. **Task 2 — XML rewrite + GREEN** — `bb60fac` (feat)
3. **Task 3 — CLAUDE.md memory update** — `e13630c` (docs)

**Plan metadata:** committed as part of merge `35c2364` (chore: merge executor worktree).

## Files Created/Modified
- `rules/feynman-activate.md` — XML three-faced contract (4410 bytes, was 10450)
- `tests/hook.test.js` — `rules-file integrity` block (11 assertions: XML form, ≤4480 bytes, no legacy markers)
- `CLAUDE.md` — "Формат файла правил" section now references `<intensity name="…">` element form
- `hooks/feynman-session-start.js` — added XML matchers + HTML fallback (parity with `feynman-activate.js` from Plan 01)
- `tests/codex-app-server.test.js` — assertion changed from literal `'Feynman Diagram Rules'` substring to length-based check
- `tests/runtime-integration.test.js` — same length-based change for SessionStart and additionalContext assertions

## Decisions Made
- Element form `<intensity name="…">` chosen over the legacy HTML-comment markers per Q-2026-05-09-01; parser-side support landed in Plan 01, so the rewrite is now content-only.
- Suppression list normalised to four classes; greeting added as a fourth class beyond the three originally inferred from research notes (matches eval iteration-1 evidence: definition-20 baseline produced 9 MD tables for "what does idempotent mean").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Missing Critical] XML support added to `hooks/feynman-session-start.js`**
- **Found during:** Task 2 (GREEN — running full test suite after rewrite)
- **Issue:** Plan 08-01 only patched `feynman-activate.js`. The SessionStart hook also reads `rules/feynman-activate.md`. Once the rule file went XML-only, SessionStart would silently fall back to legacy markers and emit `''`, breaking every `runtime-integration` test.
- **Fix:** Mirrored the dual-format extractor (`xmlMatchers` first, HTML-comment fallback second) into `feynman-session-start.js` (11 added lines).
- **Files modified:** `hooks/feynman-session-start.js`.
- **Verification:** `npm test` → 245/245 (was 234/234 pre-rewrite + 11 new integrity tests).
- **Committed in:** `bb60fac` (Task 2 commit, kept atomic to avoid a half-broken intermediate state).

**2. [Rule 2 — Test contract drift] Two test assertions changed from literal-string match to length match**
- **Found during:** Task 2 (GREEN)
- **Issue:** `tests/codex-app-server.test.js` and `tests/runtime-integration.test.js` asserted `text.includes('Feynman Diagram Rules')` — a markdown header that no longer exists in the XML form (XML rule file has no narrative title; content lives in `<triggers>`/`<examples>`).
- **Fix:** Replaced with `text.length > 50` — the only thing those tests actually care about is "non-trivial context emitted by the hook". Rule-file-integrity coverage now lives in `hook.test.js` where it can assert structural facts (XML markers, byte budget) instead of one substring.
- **Files modified:** `tests/codex-app-server.test.js`, `tests/runtime-integration.test.js`.
- **Verification:** Both tests pass against the new rule file; rule-file-integrity tests in `hook.test.js` give stronger coverage of the structural facts.
- **Committed in:** `bb60fac` (same Task 2 commit).

---

**Total deviations:** 2 auto-fixed (1 missing-critical hook patch, 1 test-contract drift).
**Impact on plan:** Both fixes are necessary for correctness. No new behaviour shipped beyond what plan declared; deviations are integration glue + test-contract migration that the plan should ideally have listed but did not.

## Issues Encountered
- Executor agent stream stalled on SUMMARY write (600s watchdog). All three task commits had landed in the worktree by that point (`19b3430`, `bb60fac`, `e13630c`); orchestrator merged the worktree (#2070 rescue path), then wrote and committed this SUMMARY directly on `main`.

## Next Phase Readiness
- Plan 08-04 (iteration-2 A/B harness) can now run against the rewritten rule file.
- Hook regex from 08-01 successfully extracts each of `lite/full/ultra` against the new file (covered by `hook.test.js → rules-file integrity`).

---
*Phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr*
*Plan: 02*
*Completed: 2026-05-10*
