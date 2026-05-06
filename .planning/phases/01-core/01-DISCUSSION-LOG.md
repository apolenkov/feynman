# Phase 1: Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 1-Core
**Mode:** --auto (all areas auto-selected, recommended options chosen)
**Areas discussed:** Rule delivery, State file location, First-run default, README skeleton depth

---

## Rule Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| File-read at runtime | Hook reads `rules/feynman-activate.md` via `fs.readFileSync` | ✓ |
| Embedded in JS | Rules stored as template literals in `feynman-activate.js` | |

**Auto-selected:** File-read from `rules/feynman-activate.md` (recommended default)
**Notes:** Rules file is the core product IP — keeping it as an authorable .md file is essential. Separates content from delivery mechanism.

---

## State File Location

| Option | Description | Selected |
|--------|-------------|----------|
| `~/.claude/.feynman/state.json` | Predictable path, resolved via `os.homedir()` | ✓ |
| `${CLAUDE_PLUGIN_DATA}/state.json` | Official plugin env var path | |

**Auto-selected:** `~/.claude/.feynman/state.json` (recommended default)
**Notes:** CLAUDE_PLUGIN_DATA may not be set when hook is registered via `~/.claude/settings.json` (not via plugin path — bug #10225 means plugin-path hooks don't fire). Explicit home-relative path is safer.

---

## First-Run Default

| Option | Description | Selected |
|--------|-------------|----------|
| Create default state.json | Bootstrap with `{enabled: true, intensity: 'full', count: 0}` | ✓ |
| Fail silently | Exit 0 without injecting anything | |

**Auto-selected:** Create default state.json (recommended default)
**Notes:** Full intensity as default matches PROJECT.md core value. Bootstrap on first run means zero configuration required — install and it works.

---

## README Skeleton Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal skeleton | One before/after example + install placeholder | ✓ |
| Full structured README | All sections with TBD placeholders | |

**Auto-selected:** Minimal skeleton (recommended default)
**Notes:** Full README in Phase 3 per roadmap. Phase 1 README proves the concept with one before/after example.

---

## Claude's Discretion

- Exact wording of ASCII diagram rules (trigger conditions within RULE-01..04 requirements)
- Single rules file with section markers vs three separate files
- Internal hook error handling verbosity

## Deferred Ideas

- install.sh / install.ps1 → Phase 3
- /feynman skill, /feynman-stats skill → Phase 2
- .clinerules, .cursor/rules → Phase 3
- Claude Code Marketplace → v2
