# feynman

## What This Is

feynman is an open-source Claude Code plugin that automatically injects ASCII diagram rules into every AI request via the `UserPromptSubmit` hook. It works alongside caveman — caveman compresses words, feynman adds visual structure. Together they produce responses that are short and visual.

Tagline: "why explain in words when diagram do trick"

## Core Value

Every response that has structure — flow, hierarchy, comparison, status — gets an ASCII diagram without the developer having to ask.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] UserPromptSubmit hook injects diagram rules into every request
- [ ] Rules define WHEN to draw: flow, hierarchy, comparison, status >5 lines, priority chain
- [ ] Rules define WHEN NOT to draw: single facts, code blocks, short answers
- [ ] Intensity levels: lite (flow+trees only), full (all types, default), ultra (force even short answers)
- [ ] Diagram types: ASCII boxes+arrows, trees, side-by-side columns, ┌─frame─┐ blocks, ▲▼ scales
- [ ] /feynman skill — toggle on/off and switch levels
- [ ] /feynman-stats skill — session diagram count
- [ ] .clinerules/feynman.md for Cursor/Windsurf compatibility
- [ ] install.sh one-liner for Unix/macOS
- [ ] install.ps1 for Windows
- [ ] README with before/after examples, install instructions, caveman compatibility section

### Out of Scope

- Custom diagram renderers / Mermaid / graphviz — ASCII only; keep dependency-free
- Per-project diagram style config — global rules are the product
- Diagram history/analytics beyond session count — keep hooks simple
- Web UI / dashboard — CLI/hook plugin only

## Context

- Target ecosystem: Claude Code (Anthropic CLI) + compatible AI editors (Cursor, Windsurf)
- Inspiration/sibling: JuliusBrussee/caveman — same hook pattern, same install UX
- Hook mechanism: `UserPromptSubmit` in Claude Code settings.json (hooks.js pattern)
- Claude Code plugin manifest: `.claude-plugin`
- Rules file double-duty: injected by hook at runtime AND copyable into CLAUDE.md manually
- Caveman compatibility is a feature, not an afterthought — both plugins coexist, complementary

## Constraints

- **Tech Stack**: Pure JavaScript (Node.js) hook — no build step, no deps, matches caveman pattern
- **Compatibility**: Must work with Claude Code hooks API; .clinerules for Cursor/Windsurf
- **Scope**: Open-source repo, public README, install one-liner pattern (like caveman)
- **Design**: Greenfield — repo is empty, start from scratch

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Mirror caveman repo structure | Familiarity for caveman users, proven install pattern | — Pending |
| UserPromptSubmit hook (not system prompt) | Injects rules per-request, survives context compaction | — Pending |
| ASCII-only diagrams | No dependencies, works in any terminal, token-efficient | — Pending |
| Start with 3 files, ask before more | User explicitly requested staged delivery | — Pending |

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
*Last updated: 2026-05-06 after initialization*
