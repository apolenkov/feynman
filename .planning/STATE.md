---
gsd_state_version: 1.0
milestone: v0.2.0
milestone_name: Production-Ready
status: Awaiting next milestone
stopped_at: v0.2.1 launch automation polish in progress
last_updated: "2026-05-07T08:18:13.414Z"
last_activity: 2026-05-07 — Milestone v0.2.0 completed and archived
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 3
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** Every response with structure gets an ASCII diagram without the developer asking. v0.2.0 closes the loop with a Stop-hook linter that validates output.
**Current focus:** Phase 7 follow-up — v0.2.1 launch polish for open-source automation

## Current Position

Phase: Milestone v0.2.0 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-05-07 — Milestone v0.2.0 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Core (v0.1) | 3/3 | - | - |
| 2. Cleanup | 0/TBD | - | - |
| 3. Linter | 0/TBD | - | - |
| 4. Tests+CI | 0/TBD | - | - |
| 5. NPX | 0/TBD | - | - |
| 6. Docs | 0/TBD | - | - |
| 6.5. Research | 0/TBD | - | - |
| 7. Release | in progress | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v0.2.0]: Standalone positioning — drop caveman framing from public surfaces (Phase 2)
- [v0.2.0]: Diagram linter as Stop hook — closes the quality loop post-response (Phase 3)
- [v0.2.0]: 100% test coverage target with node:test, GitHub Actions matrix Linux+macOS (Phase 4)
- [v0.2.0]: NPX as primary install path, bash install.sh refactored to call same Node logic (Phase 5)
- [v0.2.0]: Documentation is release-ready: README under 500 words, six examples, docs references, contribution templates (Phase 6)
- [v0.2.0]: Self-improvement loop is research-only in this milestone — full implementation deferred to v0.3.0 (Phase 6.5)
- [v0.2.0]: Future self-improvement loop must be local-first, off by default, and human-reviewed before rule changes (Phase 6.5)
- [v0.2.0]: Codex is a first-class install target; `FEYNMAN_HOME` selects `~/.claude` or `~/.codex` state root and avoids duplicated hook code (Phase 7 prep)
- [v0.2.1]: Keep `CLAUDE.md` as canonical project memory and make `AGENTS.md` a small compatibility shim importing it; avoid divergent generated copies
- [v0.2.1]: CI/CD must build the npm tarball, smoke-test packed installs, lint public docs, generate changelog notes, and publish from GitHub Release using `NPM_TOKEN`

### Pending Todos

- Finish v0.2.1 release-polish verification and publish `@albinocrabs/feynman@0.2.1`.
- Add repository secret `NPM_TOKEN` before relying on automated npm publish from GitHub Actions.

### Blockers/Concerns

- [Phase 2]: SKIL-03 (`disable-model-invocation: true`) deferred from v0.1 — must verify Claude Code skill frontmatter still supports this flag
- [Phase 3]: ASCII parser needs to handle both fenced code blocks and freestanding diagrams; rule precedence when multiple rules trigger on same line
- [Phase 4]: c8 vs node --experimental-test-coverage trade-off — pick before writing CI workflow
- [Phase 7]: unscoped `feynman` is already owned by another npm team; publish under `@albinocrabs/feynman`
- [Phase 7]: npm token posted in chat must be revoked/rotated; configure future publish through GitHub Actions secret `NPM_TOKEN`
- [Phase 6.5]: research must avoid scope creep into implementation — design spec only

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Distribution | /plugin install feynman via Marketplace | v0.3+ — undocumented submission process | Init |
| Stats | Per-type diagram breakdown | v0.3+ — count only for v0.2.0 | Init |
| Stats | Cross-session aggregation | v0.3+ — session file sufficient | Init |
| Self-improvement | Full implementation of lint→rule-update loop | v0.3.0 — design only in v0.2.0 (Phase 6.5) | v0.2.0 plan |
| IDE | .clinerules / .cursor / .windsurf compat | v0.3+ — deferred from v0.1 | v0.2.0 plan |
| Benchmark | "diagram coverage with vs without feynman" | v0.3.0 (BENCH-V3-01) | v0.2.0 plan |
| Customization | feynman.config.yaml team customization | v0.3.0 (CUST-V3-01) | v0.2.0 plan |
| Distribution | Windows install.ps1 | v0.3+ (DIST-V3-01) | v0.2.0 plan |

## Session Continuity

Last session: 2026-05-07
Stopped at: v0.2.1 launch automation polish in progress
Resume file: None — continue with tests, commit, push, CI, changelog regeneration, tag/release/publish v0.2.1

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
