---
phase: 01-core
plan: 03
subsystem: distribution
tags: [plugin-manifest, readme, claude-code-plugin, documentation]

# Dependency graph
requires: []
provides:
  - .claude-plugin/plugin.json — Claude Code plugin identity manifest (name, version, description, author; no hooks key)
  - README.md — skeleton with before/after table, install placeholder, manual settings.json registration instructions
affects: [phase-03-distribution, install-sh, marketplace]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "plugin.json identity-only pattern: no hooks key, semver version, kebab-case name (bug #10225 workaround)"
    - "README install placeholder: <!-- INSTALL PLACEHOLDER --> comment for Phase 3 install.sh scaffolding"

key-files:
  created:
    - .claude-plugin/plugin.json
    - README.md
  modified: []

key-decisions:
  - "plugin.json omits hooks key entirely — UserPromptSubmit hooks in plugin.json silently never fire (bug #10225); hook is registered via settings.json"
  - "README is skeleton only per D-10 — intensity table, caveman section, full install instructions are Phase 3 scope"
  - "settings.json block in README documents HOOK-02 with absolute path warning referencing bug #8810"

patterns-established:
  - "Plugin manifest is identity-only: name/version/description/author, no behavior declarations"
  - "README before/after table: prose answer in col 1, same answer with ASCII diagram in col 2"

requirements-completed: [DIST-04, DOCS-01, DOCS-02, HOOK-02]

# Metrics
duration: 2min
completed: 2026-05-06
---

# Phase 01 Plan 03: Plugin Manifest and README Skeleton Summary

**Claude Code plugin identity manifest (plugin.json) and README skeleton with before/after ASCII diagram table, install placeholder, and manual settings.json registration instructions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-06T12:47:11Z
- **Completed:** 2026-05-06T12:48:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `.claude-plugin/plugin.json` with valid semver, kebab-case name, no hooks key (bug #10225 workaround)
- Created `README.md` skeleton with tagline, before/after markdown table ([Build] --> [Test] --> [Deploy] diagram), and `<!-- INSTALL PLACEHOLDER -->` comment
- Documented manual settings.json hook registration (HOOK-02) with absolute path warning for bug #8810

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .claude-plugin/plugin.json manifest** - `29ac60d` (feat)
2. **Task 2: Create README.md skeleton with before/after table and install placeholder** - `faf3616` (feat)

**Plan metadata:** `(pending — final docs commit)`

## Files Created/Modified
- `.claude-plugin/plugin.json` — Claude Code plugin identity manifest; name="feynman", version="1.0.0", description with tagline, author block; no hooks key
- `README.md` — skeleton: title + tagline, before/after markdown table, `<!-- INSTALL PLACEHOLDER -->` comment, manual settings.json block

## Decisions Made
- plugin.json omits `hooks` key entirely — per bug #10225, plugin-path UserPromptSubmit hooks silently never fire; hook registration belongs in `~/.claude/settings.json` (Phase 3 install.sh)
- README is Phase 1 skeleton per D-10: no intensity levels table, no caveman section, no full install guide — those are Phase 3 scope (DOCS-03, DOCS-04)
- settings.json code block in README satisfies HOOK-02 (document hook registration) and warns users against `~/` paths (bug #8810)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 01 is now complete (all 3 plans delivered):
- `rules/feynman-activate.md` — ASCII diagram rules with 3 intensity variants (01-01)
- `hooks/feynman-activate.js` — UserPromptSubmit hook with full bug workarounds (01-02)
- `.claude-plugin/plugin.json` — plugin identity manifest (01-03)
- `README.md` — skeleton with before/after table and install placeholder (01-03)

Phase 02 (skills: /feynman toggle, /feynman-stats) can begin immediately. No blockers.

## Self-Check: PASSED

- .claude-plugin/plugin.json — FOUND
- README.md — FOUND
- 01-03-SUMMARY.md — FOUND
- commit 29ac60d — FOUND
- commit faf3616 — FOUND

---
*Phase: 01-core*
*Completed: 2026-05-06*
