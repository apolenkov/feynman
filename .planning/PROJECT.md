# feynman

## What This Is

feynman is an open-source Claude Code and Codex plugin that automatically injects ASCII diagram rules into every AI request via the `UserPromptSubmit` hook. Standalone tool — when a response has structure (flow, hierarchy, comparison, status, priority), feynman makes the assistant draw it as an ASCII diagram without the developer having to ask.

Tagline: "why explain in words when diagram do trick"

## Core Value

Every response that has structure — flow, hierarchy, comparison, status — gets an ASCII diagram without the developer having to ask. v0.2.0 adds a diagram linter that validates ASCII output and feeds corrections back via Stop-hook.

## Current Milestone: v0.2.0 Production-Ready

**Goal:** Polish v0.1 (Phase 1) into a stable, well-tested, well-documented open-source release. Quality bar high before any v1.0 talk. Add diagram linter as the main new feature. NPX install path. 100% test coverage. Full docs with domain-organized examples.

**Target features:**
- Cleanup of v0.1 dead files and caveman framing — standalone positioning
- Diagram linter (parser + 8 lint rules + Stop hook + CLI)
- 100% test coverage with GitHub Actions CI
- NPX install path (`npx @albinocrabs/feynman install --target claude|codex|both`) + bash fallback
- Full documentation: examples per domain, visual-patterns research, lint rules docs
- Self-improvement loop design (research-only in this milestone)
- v0.2.0 release tag + GitHub release

## Requirements

### Validated (v0.1)

- [x] UserPromptSubmit hook injects diagram rules into every request (HOOK-01..05)
- [x] Rules define WHEN to draw and WHEN NOT to draw (RULE-01, RULE-02)
- [x] Intensity levels: lite / full / ultra (RULE-03)
- [x] Five diagram types: boxes+arrows, trees, columns, frame blocks, priority scales (RULE-01)
- [x] /feynman skill — toggle on/off and switch levels (SKIL-01)
- [x] install.sh one-liner with idempotent settings.json upsert (DIST-01)
- [x] README skeleton with before/after table and install (DOCS-01, DOCS-02)
- [x] MIT license + .claude-plugin/plugin.json manifest (DIST-04)
- [x] Public on GitHub at apolenkov/feynman

### Active (v0.2.0)

- [x] Cleanup: remove caveman mentions, dead toml file, duplicate /feynman-stats, rename state.count
- [x] Diagram linter: ASCII parser + 8 rules (L01-L08) + bin/feynman-lint CLI + Stop-hook integration
- [x] 100% test coverage: hook + lint + install/uninstall via node:test
- [x] GitHub Actions CI on Linux+macOS matrix, coverage badge
- [x] NPX install path: npx @albinocrabs/feynman install / uninstall / doctor / lint
- [x] Codex install path: npx @albinocrabs/feynman install --target codex writes ~/.codex/hooks.json and uses ~/.codex state
- [x] bash install.sh refactored to call same Node logic (DRY)
- [x] examples/ folder per domain (architecture, api-flow, db-schema, algorithm, deploy, code-review)
- [x] docs/visual-patterns.md — visualization research adapted to ASCII
- [x] docs/lint-rules.md — full L01-L08 documentation
- [x] CONTRIBUTING.md improved + .github/ISSUE_TEMPLATE + PR template
- [x] Self-improvement loop design spec (docs/self-improvement.md, no implementation)
- [x] v0.2.0 git tag + GitHub release notes
- [x] uninstall.sh for clean removal

### Future (v0.3.0+)

- [ ] Empirical benchmark "diagram coverage with vs without feynman" (research-grade measurement)
- [ ] Domain packs (arch / db / devops as separate rule sets)
- [ ] feynman.config.yaml for team customization
- [ ] Claude Code Marketplace submission
- [ ] Codex marketplace submission once plugin-local hook behavior is fully documented
- [ ] Self-improvement loop full implementation
- [ ] IDE compatibility (.clinerules / .cursor / .windsurf) — deferred from v0.1

### Out of Scope

- Custom diagram renderers / Mermaid / graphviz — ASCII only; keep dependency-free
- Per-project diagram style config — global rules are the product
- Diagram history/analytics beyond session count — keep hooks simple
- Web UI / dashboard — CLI/hook plugin only

## Context

- Target ecosystem: Claude Code and Codex — IDE compat (Cursor/Windsurf) deferred to v0.3+
- Hook mechanism: `UserPromptSubmit` in Claude Code `~/.claude/settings.json` and Codex `~/.codex/hooks.json`
- Stop hook (v0.2.0): post-response linter that validates ASCII output and feeds corrections back
- Claude Code plugin manifest: `.claude-plugin/plugin.json`
- Codex plugin manifest: `.codex-plugin/plugin.json` plus repo-root `hooks.json`
- Rules file double-duty: injected by hook at runtime AND readable as docs in repo
- Repo published at https://github.com/apolenkov/feynman with MIT license

## Constraints

- **Tech Stack**: Pure JavaScript (Node.js >=18) hook — no build step, no npm deps for the hook itself
- **NPX wrapper layer**: bin/feynman.js can use minimal deps for nicer UX (TBD in Phase 5)
- **Compatibility**: Claude Code and Codex hook APIs for v0.2.0
- **Quality bar**: 100% test coverage, CI green, no dead files, no internal stubs
- **Positioning**: standalone tool — no caveman-derivative framing in public surface

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| UserPromptSubmit hook (not system prompt) | Injects rules per-request, survives context compaction | Validated v0.1 |
| ASCII-only diagrams | No dependencies, works in any terminal, token-efficient | Validated v0.1 |
| Start with 3 files, ask before more | User explicitly requested staged delivery | Validated v0.1 |
| v0.2.0 not v1.0 | Tool still calibrating; quality bar not yet met for 1.0 announcement | v0.2.0 |
| Standalone positioning, drop caveman framing | User wants this as own analog work, not derivative | v0.2.0 |
| Diagram linter as Stop hook | Post-response validation closes the quality loop | v0.2.0 |
| 100% test coverage target | Production-ready bar; can't ship "business card" without tests | v0.2.0 |
| NPX as primary install path | Modern UX; bash fallback for npm-less users | v0.2.0 |
| node:test (not jest/vitest) | Zero deps for testing, ships with Node >=18 | v0.2.0 |
| Codex as first-class target | User asked for production-ready support in both Claude Code and Codex | v0.2.0 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-06 — milestone v0.2.0 started*
