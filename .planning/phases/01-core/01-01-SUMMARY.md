---
phase: 01-core
plan: 01
subsystem: rules
tags: [ascii-diagrams, declarative-rules, intensity-variants, hook-injection]

# Dependency graph
requires: []
provides:
  - "rules/feynman-activate.md — ASCII diagram injection rules in three intensity variants (lite/full/ultra)"
  - "All five diagram types defined: flow, tree, side-by-side comparison, frame blocks, priority scales"
  - "Explicit WHEN NOT TO DRAW conditions for each variant"
  - "Declarative phrasing throughout — no imperative commands (D-08 compliant)"
  - "Character-budgeted variants: lite 1267, full 2117, ultra 1346 chars (all under 8,000)"
affects: ["01-02 (hook reads this file at runtime via extractVariant)", "01-03 (README references variants by name)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HTML comment markers <!-- variant --> ... <!-- /variant --> for variant delimiting"
    - "Declarative fact phrasing: 'Responses that contain X include Y' (not commands)"
    - "WHEN NOT TO DRAW section in every variant for explicit negative conditions"
    - "Three-tier intensity system: lite (2 types) < full (5 types) < ultra (force on any structure)"

key-files:
  created:
    - "rules/feynman-activate.md"
  modified: []

key-decisions:
  - "Lite variant: flow diagrams and trees only — deliberately excludes comparisons, frame blocks, priority scales for lighter footprint"
  - "Full variant as the default: all five diagram types, balanced trigger conditions"
  - "Ultra variant threshold: any response with 2+ items OR any structure gets a diagram; single sentence of pure prose is the only exception"
  - "WHEN NOT TO DRAW section is present in ALL variants — single facts, code-only blocks, short answers under 4 lines, user asking for prose explicitly"
  - "Diagram syntax examples embedded inline in each variant (not in a separate reference section) so extracted text is self-contained"

patterns-established:
  - "Pattern 1: Declarative rule phrasing — all rules begin with 'Responses that...' or 'A response...'; no 'always', 'you must', 'make sure to'"
  - "Pattern 2: Variant self-containment — each extracted section includes its own syntax examples so the hook can inject it standalone"
  - "Pattern 3: Negative conditions explicit — 'When no diagram appears' section is a required component of every variant"

requirements-completed: [RULE-01, RULE-02, RULE-03, RULE-04]

# Metrics
duration: 2min
completed: 2026-05-06
---

# Phase 01 Plan 01: feynman rules file Summary

**ASCII diagram injection rules in three intensity variants (lite/full/ultra) with declarative phrasing, explicit negative conditions, and five diagram type definitions (flow, tree, comparison, frame block, priority scale)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-06T12:39:53Z
- **Completed:** 2026-05-06T12:41:21Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Authored `rules/feynman-activate.md` with all three intensity variants correctly delimited by HTML comment markers
- All rules phrased as declarative facts per D-08 — zero imperative phrases confirmed by grep gate
- Explicit WHEN NOT TO DRAW section in every variant per RULE-02 — prevents diagram overuse
- Lite strictly limited to flow+tree (no frame blocks, no priority scales, no side-by-side columns)
- Full covers all five types from RULE-01; ultra extends with force-on-any-structure threshold

## Task Commits

1. **Task 1: Create rules/feynman-activate.md** - `d21e4f7` (feat)

## Files Created/Modified

- `rules/feynman-activate.md` — Core product IP: ASCII diagram injection rules, all three intensity variants, ready for hook's `extractVariant()` parser

## Decisions Made

- Diagram syntax examples are embedded inline within each variant section (not in a shared appendix). This ensures the extracted text is self-contained when injected as `additionalContext` — the Claude instance receiving the rules has everything it needs without needing the rest of the file.
- Ultra variant's single exception — "a single sentence of pure prose with no enumerable items, no steps, no comparisons, and no structure of any kind" — is deliberately narrow. In ultra mode, almost every non-trivial answer includes a diagram.
- WHEN NOT TO DRAW uses explicit conditions (single fact, code-only, under 4 lines, user asked for prose) rather than a generic "use your judgment" hedge, making the rules more reliable.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None — the rules file is complete and self-contained. No placeholder text or wired-but-empty sections.

## Threat Flags

No new threat surface introduced beyond what was analyzed in the plan's threat model (T-01-01, T-01-02, T-01-03). The rules file is a static markdown file with no network endpoints, no auth paths, no file access patterns beyond being read by the hook.

## Next Phase Readiness

- `rules/feynman-activate.md` is ready for consumption by the hook in Plan 01-02
- The hook's `extractVariant()` function (defined in 01-01-PLAN.md interfaces) will parse correctly — verified by running the variant size script which confirms all three markers exist and extract cleanly
- Calibration note: assumption A2 from RESEARCH.md (rules will produce ~30-40% diagram frequency at full mode) requires empirical testing after the hook is wired in Plan 01-02

---
*Phase: 01-core*
*Completed: 2026-05-06*
