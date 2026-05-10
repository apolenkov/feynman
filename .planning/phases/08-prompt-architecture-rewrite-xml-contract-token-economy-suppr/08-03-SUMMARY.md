---
phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr
plan: "03"
subsystem: docs
tags: [readme, compaction-survivor, UserPromptSubmit, SessionStart]

requires: []
provides:
  - "README compaction-survivor section explaining why UserPromptSubmit survives context compaction"
  - "TOC anchor entry for new subsection"
affects:
  - "08-prompt-architecture-rewrite-xml-contract-token-economy-suppr"

tech-stack:
  added: []
  patterns:
    - "Declarative compaction explanation placed directly after primary 'Why feynman' paragraph"

key-files:
  created: []
  modified:
    - README.md

key-decisions:
  - "Placed new subsection as h3 (###) directly after existing 'Why feynman' paragraph, before '## Governance docs'"
  - "3-sentence body: context compaction mechanism, SessionStart loss, UserPromptSubmit per-turn re-injection"
  - "Added 'Compaction' anchor in top navigation block pointing to new heading slug"

patterns-established: []

requirements-completed:
  - PROMPT-12

duration: 5min
completed: "2026-05-10"
---

# Phase 08 Plan 03: README Compaction-Survivor Section Summary

**3-sentence compaction-survivor subsection added to README explaining that UserPromptSubmit re-injects rules on every turn so they survive Claude Code's automatic context compaction, unlike SessionStart which fires once and is lost**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-10T00:00:00Z
- **Completed:** 2026-05-10T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `### Why feynman uses UserPromptSubmit (not SessionStart)` subsection with 3-sentence compaction explanation
- Added `Compaction` anchor link to top navigation block in README
- Closed SPEC acceptance criterion PROMPT-12 (README compaction-survivor explanation)

## Task Commits

1. **Task 1: Add compaction-survivor section to README.md** - `9d14d33` (docs)

## Files Created/Modified

- `README.md` — added h3 subsection after "Why feynman" paragraph + TOC anchor entry (+9 lines)

## Decisions Made

- **Placement:** subsection inserted immediately after the existing "Why feynman" closing paragraph (line 55), before `## Governance docs` — keeps "why" reasoning co-located in one block
- **Heading level:** h3 (`###`) matches existing "Without feynman / With feynman" subsection hierarchy
- **TOC anchor:** `#why-feynman-uses-userpromptsubmit-not-sessionstart` — GitHub auto-generates this slug from the h3 heading text; anchor label "Compaction" kept short for nav bar width
- **Body wording:** 3 sentences covering (1) compaction mechanism, (2) SessionStart loss, (3) UserPromptSubmit survival — matches plan's suggested phrasing verbatim

## Inserted text (exact)

Section added at README.md line 57 (after "agent style: smaller prompts..." paragraph):

```markdown
### Why feynman uses UserPromptSubmit (not SessionStart)

Claude Code compacts the context window automatically as a conversation grows.
Anything injected by a `SessionStart` hook is part of that early context and is
lost the moment compaction runs. The `UserPromptSubmit` hook fires on every turn,
so feynman re-injects its diagram rules after every compaction event — the rules
survive the entire session, not just the opening turn.
```

## Verification results

```
grep -c 'Why feynman uses UserPromptSubmit' README.md  => 1  (required ≥1) ✓
grep -ciE 'compaction' README.md                       => 3  (required ≥2) ✓
git diff --stat README.md                              => 9 lines added (required ≤12) ✓
All other files unchanged                                                  ✓
```

## Deviations from Plan

None — plan executed exactly as written. Suggested phrasing from `<action>` block adopted verbatim. TOC anchor added as specified.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None — documentation-only change, no new network endpoints or trust boundaries introduced.

## Self-Check: PASSED

- [x] `README.md` modified with compaction-survivor section
- [x] Commit `9d14d33` exists: `git log --oneline | grep 9d14d33`
- [x] `grep -c 'Why feynman uses UserPromptSubmit' README.md` = 1
- [x] `grep -ciE 'compaction' README.md` = 3

## Next Phase Readiness

- PROMPT-12 closed. This plan is complete and independent.
- Remaining Phase 8 work: Plans 01 (parser migration + XML rule rewrite + tests) and 02 (iteration-2 A/B eval harness) — both independent of this plan.

---
*Phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr*
*Completed: 2026-05-10*
