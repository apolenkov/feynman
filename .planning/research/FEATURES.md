# Features: feynman

**Domain:** Claude Code hook plugin — ASCII diagram injection
**Researched:** 2026-05-06
**Confidence:** HIGH (caveman codebase verified, Claude Code docs fetched from code.claude.com, community sentiment from HN + Product Hunt)

---

## Table Stakes

Features users will expect because caveman already set the bar. Missing any of these means users skip feynman and stay with caveman alone, or add diagram rules manually to CLAUDE.md.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| UserPromptSubmit hook injects rules on every prompt | Core mechanism — caveman established this as the standard pattern for hook-based plugins | Low | Hook outputs `additionalContext`; known open bug #14281 where content duplicates, monitor on Claude Code release notes |
| Intensity levels: lite / full / ultra | Caveman has three levels; users arriving from caveman will expect the same mental model | Low | Lite = flow+trees only; Full = all types (default); Ultra = force even on short answers |
| `/feynman` skill — toggle on/off + switch level | Caveman's `/caveman` toggle is the expected UX; without it the plugin feels "always on and dumb" | Low | Must work as `disable-model-invocation: true` — user-invoked only, not auto-triggered by Claude |
| `/feynman-stats` skill — session diagram count | Caveman has `/caveman-stats` with token metrics; users expect a stats command | Low | Count tracked via `/tmp/claude-session-{id}-feynman.json` state file; no persistent store needed beyond session |
| install.sh one-liner (curl pipe bash) | Caveman established this as the install UX expectation across the Claude Code plugin ecosystem | Medium | Must auto-detect Claude Code, Cursor, Windsurf; use `--dry-run`, `--minimal` flags matching caveman pattern |
| README with before/after examples | Community explicitly calls out "no setup needed" and "be brief" as competitors — README with before/after is the primary conversion tool | Low | Side-by-side ASCII columns in README itself; show feynman + caveman combo |
| .clinerules/feynman.md compatibility file | Caveman provides `.clinerules/caveman.md` for Cursor/Windsurf; users installing one plugin expect the other to match | Low | Rules file is the same content injected by hook — dual-purpose |
| Caveman coexistence — no conflict | Users will run both; they must not fight over `additionalContext` injection order or overlap | Low | Caveman compresses words, feynman adds structure — orthogonal; verify no duplicate injection conflict |
| Explicit WHEN-NOT-TO-DRAW rules | Without this, Claude draws on single facts, code blocks, and short answers — creates noise; user installs and immediately uninstalls | Low | Rules must explicitly enumerate: single facts, code-only answers, ≤2 line answers, terminal commands |
| plugin.json manifest (.claude-plugin/) | Claude Code plugin system requires this for marketplace distribution | Low | name, description, version, author — minimal manifest |

---

## Differentiators

Features that set feynman apart from "add a diagram rule to CLAUDE.md" and from caveman. These justify the install.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Five diagram type vocabulary with explicit triggers | Users get consistent, named diagram types (boxes+arrows, tree, side-by-side columns, frame blocks, priority scales) with exact trigger conditions — not vague "draw when useful" | Medium | Each type needs its own "WHEN:" and "HOW:" in the injected rules; this is the core IP of feynman |
| Caveman compatibility as a first-class feature | README section + install detection both acknowledge caveman; positioning as "caveman's visual companion" gives feynman a viral entry point into caveman's 24.9k-star user base | Low | Marketing + technical: verify hook execution order is deterministic when both run |
| WHEN-NOT-TO-DRAW as precise as WHEN-TO-DRAW | Most diagram injection tools over-trigger; feynman's rules must be equally specific about suppression. This is the differentiator that prevents "noisy" uninstalls | Medium | Enumerate negatives: pure code, single value, error messages, file paths, one-word answers |
| Rules file double-duty: hook + manual copy | Same feynman.md file works as both automated injection (hook) and manual copy into CLAUDE.md for users who don't want hooks | Low | Zero extra work; follows from architecture; mention explicitly in README for CLAUDE.md users |
| install.ps1 for Windows | Caveman is Unix/macOS-only for install; feynman on Windows expands the addressable user base into a gap | Medium | PowerShell install script; plugin hooks use `shell: powershell` in SKILL.md frontmatter |
| Ultra mode: force diagrams on short answers | Caveman's ultra is maximum compression; feynman's ultra is maximum visual density — even a 2-line answer gets a diagram. Gives power users a "demo mode" for showing off to colleagues | Low | Toggle via state file; /feynman ultra sets this |
| /feynman-stats with diagram type breakdown | Beyond count, show which diagram types were triggered most this session. Developers are data-curious; a "you used 8 flow diagrams, 3 trees, 2 comparison tables" stat is shareable | Medium | Requires tagging diagram types in state file — complex; de-risk by starting with count only |

---

## Anti-Features (Deliberately Excluded)

Things to explicitly NOT build. Each one has a specific reason. If scope creeps, this list is the bloat detector.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Mermaid / Graphviz / rendered diagrams | Adds external dependency; breaks the zero-dep model that makes caveman trustworthy; terminal incompatible | ASCII only — no deps, works everywhere, version-control friendly |
| Per-project diagram style config | "Global rules are the product" (PROJECT.md decision). Per-project config adds surface area and support burden without adding core value | Ship one opinionated ruleset; users who want customization can copy feynman.md into CLAUDE.md and edit it |
| Diagram history / analytics beyond session count | Makes the hook stateful and complex; persistent analytics require a DB or file store that users didn't sign up to maintain | Session count in /tmp only; wipe on session end |
| Web UI / dashboard | Out of scope per PROJECT.md; plugins live in the terminal | None — this is a CLI plugin |
| LLM-generated diagrams (hook calls Claude to make the diagram) | Costs tokens, adds latency, creates circular dependency; the point is rules injection not diagram rendering | Inject rules; let Claude's own generation handle diagrams |
| Auto-detection of "diagrammable" content (semantic parsing) | Requires NLP in the hook script; adds JS deps; brittle across Claude output styles | Rules-based triggers only — specify structure types Claude already recognizes |
| Lifetime stats / cross-session aggregation | Caveman does this but it requires parsing JSONL session files — fragile, version-locked to Claude Code internals | Session count only; if Claude Code exposes a stable API later, reconsider |
| Multi-language diagram syntax (ASCII + Unicode box chars + emoji) | Creates rendering fragmentation across terminals and editors | ASCII 7-bit only; ┌─┐└┘│ are safe Unicode box-drawing chars that render everywhere; no emoji in diagrams |
| Global enable/disable toggle persisted across sessions | State persistence across sessions requires writing to ~/.claude/ config — adds install surface area and possible conflicts | Session-scoped toggle only; restart = reset to full (default) |

---

## Feature Dependencies

```
install.sh
  └── detects Claude Code → writes hooks/hooks.json
  └── detects Cursor/Windsurf → writes .clinerules/feynman.md
  └── --minimal flag → plugin only, no hook wiring

UserPromptSubmit hook (hooks/hooks.json)
  └── reads ~/.claude/feynman-state.json (or /tmp/ scoped to session)
      ├── enabled? YES → inject rules from feynman.md
      │   └── which intensity level? → inject lite/full/ultra variant
      └── enabled? NO → inject nothing

/feynman skill (skills/feynman/SKILL.md)
  └── accepts $ARGUMENTS: [on|off|lite|full|ultra]
  └── writes state to ~/.claude/feynman-state.json
  └── depends on: hook reading that state file on next prompt
  └── disable-model-invocation: true (user-invoked only)

/feynman-stats skill (skills/feynman-stats/SKILL.md)
  └── reads /tmp/claude-session-{CLAUDE_SESSION_ID}-feynman.json
  └── depends on: hook incrementing counter on each inject
  └── disable-model-invocation: true (user-invoked only)

feynman.md (rules file)
  └── is the content injected by hook
  └── is also the content in .clinerules/feynman.md
  └── has three variants: lite, full, ultra
  └── depends on: nothing — pure text

Caveman coexistence
  └── no shared state files
  └── no shared hook matchers
  └── additionalContext from both appends independently (verify behavior with open bug #14281)
```

**Ordering rationale:** State file path must be decided before hook + skill are built (both read/write it). Rules file (feynman.md) must be written before hook can reference it. install.sh comes last — it wires everything together.

---

## Risk Flags

| Feature | Risk | Mitigation |
|---------|------|------------|
| additionalContext duplication (bug #14281) | Rules injected twice → wasted tokens, confusing Claude | Monitor Claude Code releases; add idempotency guard (session-scoped dedupe flag in state file) |
| State file path for toggle | ~/.claude/ vs /tmp/ — /tmp is session-scoped but lost on restart | Use ~/.claude/feynman-state.json for toggle (survives session); /tmp for stats counter (ephemeral) |
| ultra mode noise | Users enable ultra, every 2-line answer gets a diagram, they hate it | Make ultra require explicit `/feynman ultra` (not default); document clearly |
| Cursor/Windsurf rule file path | .clinerules/ is correct for Cline; Cursor uses .cursor/rules/*.mdc; Windsurf uses .windsurf/rules/*.md | install.sh writes all three; verified from caveman installer source |

---

## Sources

- Caveman README (github.com/JuliusBrussee/caveman) — HIGH confidence, fetched directly
- Claude Code Plugins docs (code.claude.com/docs/en/plugins) — HIGH confidence, official
- Claude Code Skills docs (code.claude.com/docs/en/skills) — HIGH confidence, official
- Claude Code Hooks guide (code.claude.com/docs/en/hooks-guide) — HIGH confidence, official
- additionalContext bug #14281 (github.com/anthropics/claude-code/issues/14281) — MEDIUM confidence, open issue
- HN discussion on caveman vs "be brief" (news.ycombinator.com/item?id=47954745) — MEDIUM confidence, community sentiment
- Product Hunt caveman page — MEDIUM confidence, user feedback
- CHI 2024 paper: "Taking ASCII Drawings Seriously: How Programmers Diagram Code" — HIGH confidence, peer-reviewed
