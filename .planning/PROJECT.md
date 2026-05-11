# feynman

## What This Is

feynman is an open-source Claude Code and Codex plugin that automatically injects ASCII diagram rules into every AI request via the `UserPromptSubmit` hook. Standalone tool — when a response has structure (flow, hierarchy, comparison, status, priority), feynman makes the assistant draw it as an ASCII diagram without the developer having to ask.

Tagline: "why explain in words when diagram do trick"

## Core Value

Every response that has structure — flow, hierarchy, comparison, status — gets an ASCII diagram without the developer having to ask. The plugin actively prefers the cheapest visual that still conveys the structure (smallest-visual-first), validates output via a Stop-hook linter, and autofixes misaligned frames before the user sees them.

## Shipped Milestones

| Milestone | Focus | Shipped | Archive |
|-----------|-------|---------|---------|
| v0.1 — Core | Hook + rules + plugin manifest | — | (in v0.1 history) |
| v0.2.0 — Production-Ready | Linter L01-L08, NPX, CI, docs | 2026-05-07 | milestones/v0.2.0-ROADMAP.md |
| v0.3.0 — Prompt Architecture | XML rule contract, autofix engine, L09/L10, Stop-hook autofix | 2026-05-10 | milestones/v0.3.0-ROADMAP.md |
| v0.4.0 — Visual Economy | L11/L12/L13/L14, output-style presets, IDE compat, compliance harness, smallest-visual-first ladder | 2026-05-11 | milestones/v0.4.0-ROADMAP.md |

## Current Milestone: v0.5.0 «Verbosity Economy»

**Goal:** Close the +31% verbosity gap discovered in Phase 11 via empirical 7-arm A/B measurement on 50 prompts, and ship the winning intervention as a v0.5.0 release.

**Target features:**
- Corpus expansion: 15 → 50 prompts for the compliance harness
- Budget compaction: free ≥333 bytes in rules/feynman-activate.md for ABC interventions
- 4 candidate rule sets: A (caption brevity) / B (no-narration) / C (response-length budget) / ABC (combined)
- 7-arm subagent harness: v0.2.x / v0.3.x / +ladder / +A / +B / +C / +ABC × 50 prompts
- Winner application: if ≥−20% verbosity + ≥95% lint compliance → apply + release; else «refuted» documented

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

### Validated (v0.2.0)

- [x] Cleanup: remove caveman mentions, dead toml file, duplicate /feynman-stats, rename state.count — v0.2.0
- [x] Diagram linter: ASCII parser + 8 rules (L01-L08) + bin/feynman-lint CLI + Stop-hook integration — v0.2.0
- [x] node:test coverage: hook + lint + install/uninstall — v0.2.0
- [x] GitHub Actions CI on Linux+macOS matrix — v0.2.0
- [x] NPX install path: npx @albinocrabs/feynman install / uninstall / doctor / lint — v0.2.0
- [x] Codex install path: npx @albinocrabs/feynman install --target codex — v0.2.0
- [x] bash install.sh refactored to call same Node logic (DRY) — v0.2.0
- [x] examples/ folder per domain — v0.2.0
- [x] docs/visual-patterns.md, docs/lint-rules.md (L01-L08) — v0.2.0
- [x] CONTRIBUTING.md + .github/ISSUE_TEMPLATE + PR template — v0.2.0
- [x] Self-improvement loop design spec (docs/self-improvement.md) — v0.2.0
- [x] v0.2.0 git tag + GitHub release notes + uninstall.sh — v0.2.0

### Validated (v0.3.0)

- [x] XML rule contract (`<intensity>`, `<triggers>`, `<contract>`, `<patterns>`) — v0.3.0
- [x] Three-faced behavior: amplify / channel / suppress + classify-first CoT — v0.3.0
- [x] Token economy: 4480-byte rules-file budget enforced — v0.3.0
- [x] Hook dual-format extractor (XML + legacy HTML comments) — v0.3.0
- [x] Compaction-survivor README section — v0.3.0
- [x] L09 right-edge alignment lint rule — v0.2.7 hotfix + v0.3.3 visual-column hardening
- [x] L10 mixed-script Cyrillic+Latin warn — v0.3.2
- [x] L08 hardening (combining marks/ZWJ/CJK via lib/lint/width.js) — v0.3.3
- [x] Autofix engine (`lib/lint/autofix.js`) — v0.3.2
- [x] CLI `feynman-lint --fix` flag — v0.3.2
- [x] Stop-hook autofix integration with `<feynman-autofix>` wrapper — v0.3.3
- [x] Lint docs L01-L10 + README `--fix` mention — v0.3.3

### Validated (v0.4.0)

- [x] Smallest-visual-first lint rules: L11 (overdecoration), L12 (token-budget), L13 (double-wrap) — v0.4.0
- [x] Autofix L11 to dot-leader (LINT-14) — two-opt dispatcher, Phase 8.5 contract preserved — v0.4.0
- [x] --explain CLI flag emits per-frame cost breakdown — v0.4.0
- [x] docs/lint-rules.md updated to L01-L13 + token-cost comparison rows — v0.4.0
- [x] Output-style presets (`short / middle / full`) — runtime additionalContext suffix, zero rules-file bytes — v0.4.0
- [x] /feynman style subcommand + status output — v0.4.0
- [x] Compliance A/B harness via subagents (no API key needed) — v0.4.0
- [x] Smallest-visual-first ladder shipped in rules (lite/full/ultra) — v0.4.0 (3-arm measurement: -3.5% vs predicted -15-25%, hypothesis refuted, ladder kept since no regression)
- [x] IDE compat — cline / cursor / windsurf install + doctor — v0.4.0
- [x] v0.4.0 git tag + GitHub release + npm publish — 2026-05-11

### Active (v0.5.0)

- [ ] **CORP-01**: 50-prompt corpus built and balanced across 9 shape classes
- [ ] **CORP-02**: 3 baseline arms re-measured on 50-prompt corpus (sanity check)
- [ ] **COMP-01**: rules/feynman-activate.md compacted by ≥333 bytes (prose contracts only, no vocabulary loss)
- [ ] **CAND-01**: rules-v05-A.md (caption brevity) created, ≤4480 bytes
- [ ] **CAND-02**: rules-v05-B.md (no-narration) created, ≤4480 bytes
- [ ] **CAND-03**: rules-v05-C.md (response-length budget) created, ≤4480 bytes
- [ ] **CAND-04**: rules-v05-ABC.md (combined) created, ≤4480 bytes
- [ ] **MEAS-01**: 4 candidate arms measured on 50-prompt corpus via subagent harness
- [ ] **MEAS-02**: eval/v0.5.0-compliance/REPORT.md with 7-arm matrix, per-class breakdown, explicit winner statement
- [ ] **REL-01**: winner rule applied to rules/feynman-activate.md + npm test pass (if threshold met)
- [ ] **REL-02**: v0.5.0 published to npm + GitHub Release (if winner meets threshold)

### Future (v0.6.0+)

- [ ] Domain packs (arch / db / devops as separate rule sets)
- [ ] feynman.config.yaml for team customization
- [ ] Claude Code Marketplace submission
- [ ] Codex marketplace submission once plugin-local hook behavior is fully documented
- [ ] Self-improvement loop full implementation
- [ ] Windows install.ps1 (DIST-V3-01)

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
| XML rule contract (replaces HTML comments) | F1+F2+F4+F7 evidence; ~58% size reduction; semantic clarity for hook parser | Validated v0.3.0 |
| Three-faced behavior (amplify / channel / suppress) | Iteration-2 A/B: WIN=17 NEUTRAL=3 HURT=0 across 20 evals | Validated v0.3.0 |
| `lib/lint/width.js` as single source of visual-width truth | Phase 8.5 — combining marks, ZWJ, ANSI, CJK widechar handled identically by L08, L09, autofix | Validated v0.3.0 |
| Stop-hook autofix takes precedence over rule-feedback | When autofix can fix the frame, fix it silently rather than nag the model | Validated v0.3.0 |
| Smallest-visual-first as v0.4.0 theme | User observed frame-for-≤5 wastes ~50% tokens vs dot-leader | v0.4.0 |
| Output-style presets implemented as additionalContext suffix (not rules-file expansion) | Avoids rules-file budget impact; toggleable per session | v0.4.0 |

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
*Last updated: 2026-05-11 — milestone v0.5.0 started*
