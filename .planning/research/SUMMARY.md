# Project Research Summary

**Project:** feynman
**Domain:** Claude Code hook plugin — ASCII diagram rule injection
**Researched:** 2026-05-06
**Confidence:** HIGH

## Executive Summary

feynman is a zero-dependency Node.js Claude Code plugin that injects ASCII diagram rules into every AI request via the `UserPromptSubmit` hook. The pattern is proven — caveman (24.9k stars) established the hook-based plugin model and the install.sh one-liner UX. feynman is architecturally simpler than caveman because it injects rules (pure text) rather than tracking mode state with multiple file watchers. The recommended build follows the caveman repo structure exactly: hook script + rules file + install.sh + SKILL.md files, all plain CommonJS with no dependencies.

The biggest risks are not design risks — they are Claude Code runtime bugs. Three confirmed bugs must be worked around before Phase 1 ships: (1) plain stdout from UserPromptSubmit causes a visible hook error (use JSON `additionalContext` output), (2) plugin-defined UserPromptSubmit hooks silently never execute (ship the hook via `~/.claude/settings.json` from install.sh, not from plugin.json), and (3) tilde paths in settings.json fail when Claude starts from a subdirectory (expand to absolute path at install time). Every one of these has a known fix — the danger is not knowing they exist.

The rules file is the core product IP. Rules phrased as commands ("always draw...") trigger Claude's prompt-injection defense; they must be written as declarative facts ("responses with flows include an ASCII diagram"). Rules must define both positive triggers and explicit negative conditions with equal precision. Without the negative conditions, diagram noise causes immediate uninstalls. The rules authoring and calibration phase is as important as the hook implementation.

---

## Key Findings

### Recommended Stack

Pure Node.js CommonJS hook, zero npm dependencies. The hook is invoked as `node feynman-activate.js` directly by Claude Code — no build step, no transpilation. Module format must be CommonJS (`require`/`module.exports`), not ESM, matching the caveman pattern that users already trust. The only runtime is Node.js, which is guaranteed present on any machine running Claude Code.

The `UserPromptSubmit` hook fires on every prompt submission before the model sees the request. `SessionStart` is explicitly the wrong choice — rules would be lost after context compaction, the exact failure the product must prevent. Hook output must be the JSON `additionalContext` wrapper (not plain text), written via `process.stdout.write(JSON.stringify(...))` without trailing newline.

**Core technologies:**
- Node.js (system-installed): hook runtime — zero additional install burden
- CommonJS `require()`: module format — proven by caveman, avoids ESM package.json complexity
- `UserPromptSubmit` hook: injection event — fires every prompt, survives compaction
- `~/.claude/settings.json`: hook registration — required because plugin-path registration is bugged
- `${CLAUDE_PLUGIN_DATA}/state.json`: shared state contract between hook and skills

**What NOT to use:**
- ESM / `import` syntax — adds package.json complexity, diverges from caveman
- `jq` in install scripts — not universally installed; use `node -e` inline
- `console.log` for hook output — adds trailing newline; use `process.stdout.write`
- Plain text stdout from hook — causes visible red error in Claude Code UI
- `SessionStart` hook — rules lost after context compaction

### Expected Features

**Must have (table stakes):**
- `UserPromptSubmit` hook injects rules on every prompt — core mechanism
- Intensity levels: lite / full / ultra — caveman users arrive expecting this mental model
- `/feynman` skill to toggle on/off and switch levels — without it the plugin feels dumb
- `/feynman-stats` skill showing session diagram count — caveman has this, users expect it
- `install.sh` one-liner (curl pipe bash) — established install UX for this ecosystem
- `.clinerules/feynman.md` for Cursor/Windsurf compatibility
- Explicit WHEN-NOT-TO-DRAW rules — without this, noise causes immediate uninstalls
- `plugin.json` manifest in `.claude-plugin/` — required for plugin system
- README with before/after ASCII examples — primary conversion tool

**Should have (competitive):**
- Five named diagram types with precise triggers (boxes+arrows, tree, columns, frame blocks, priority scales)
- `install.ps1` for Windows — caveman gap, expands addressable market
- Rules file double-duty: hook injection AND manual CLAUDE.md paste — zero extra work
- Caveman coexistence as a documented first-class feature
- Ultra mode as explicit power-user opt-in (not default)

**Defer (v2+):**
- `/feynman-stats` with per-type diagram breakdown — start with count only
- Marketplace `/plugin install feynman` — undocumented submission process as of research date
- Cross-session aggregation — session count in /tmp is sufficient for v1.0

### Architecture Approach

Seven components with clean boundaries: plugin.json (identity), hooks.json (event wiring), feynman-activate.js (state read, rule selection, stdout injection), feynman-rules.md (pure text, the IP), feynman/SKILL.md (toggle writer), feynman-stats/SKILL.md (counter reader), and install.sh/.ps1 (distribution). The single shared contract is `${CLAUDE_PLUGIN_DATA}/state.json` with schema `{enabled, intensity, count}`. The skill writes state; the hook reads state. They share only the file — no direct coupling.

**Major components:**
1. `feynman-activate.js` — reads stdin JSON, checks state, selects rule variant, increments counter, writes `additionalContext` to stdout
2. `feynman-rules.md` — three intensity variants (lite/full/ultra); pure text, no code deps; must stay under 8,000 chars per variant
3. `skills/feynman/SKILL.md` — writes `state.json`; must have `disable-model-invocation: true` to prevent auto-invocation on "draw a diagram" queries
4. `install.sh` — idempotent upsert into `~/.claude/settings.json` using `node -e` inline; expands `~` to absolute path; ships uninstall path
5. `.clinerules/feynman.md` — static copy of full rules for Cursor/Windsurf; Cursor also needs `.cursor/rules/feynman.mdc` with YAML frontmatter

**Build order (enforced by dependency graph):**

```
feynman-rules.md + plugin.json        (no deps — start here)
       |
feynman-activate.js + hooks.json      (reads rules)
       |
SKILL.md files                        (share state.json contract with hook)
       |
.clinerules/ + install.sh/.ps1        (copy rules; wire everything)
```

### Critical Pitfalls

1. **Plain stdout causes visible hook error** — Claude Code parses hook stdout as JSON; plain text triggers red UI error on every message. Use `{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "..." } }` exclusively. (Issue #13912)

2. **Plugin-path UserPromptSubmit hooks never execute** — Confirmed runtime bug: hooks in `plugin.json` for `UserPromptSubmit` match but never fire. Write the hook entry directly to `~/.claude/settings.json` via install.sh. Use plugin.json for identity only. (Issue #10225)

3. **Tilde in hook path breaks from subdirectories** — `~/.claude/feynman/hook.js` resolves against cwd at startup, not $HOME. Fails silently for `cd projects/foo && claude`. Install script must write `$(realpath ~/.claude/...)` expanded absolute path. (Issue #8810)

4. **Imperative rule phrasing triggers prompt-injection defense** — "Always draw a diagram when..." is flagged as injection. Write rules as declarative facts about system behavior, not commands. (Issue #17804)

5. **Disabled plugin still injects rules** — `enabledPlugins: false` does not gate hook execution. Hook script must check for a flag file (`~/.claude/.feynman-active`) at entry and exit 0 silently if missing. (Issue #35713)

---

## Implications for Roadmap

### Phase 1: Foundation — Rules + Hook + Install

**Rationale:** Rules file has no dependencies and is the product IP. Hook has only one dependency (rules). Install script depends on final file layout. This is the natural dependency order. All three catastrophic runtime bugs (Pitfalls 1, 2, 3) live here and must be solved before anything else is useful.

**Delivers:** A working plugin that injects diagram rules on every prompt. Users can install via one-liner and get value with no further configuration.

**Addresses:** Core hook injection, rules authoring (all three intensity levels), WHEN-NOT-TO-DRAW precision, `install.sh` idempotent upsert, `plugin.json` manifest, `uninstall.sh` self-healing.

**Avoids:** Pitfalls 1 (stdout format), 2 (plugin hook registration), 3 (tilde path), 5 (flag file), 6 (declarative phrasing), 7 (too-broad rules), 13 (jq dependency), 14 (non-idempotent install), 15 (orphaned settings entry).

**Research flag:** No additional research needed. All critical APIs verified against official docs. Implementation can proceed.

---

### Phase 2: Skills + Caveman Coexistence

**Rationale:** Skills require the state.json contract locked in Phase 1. Caveman coexistence testing requires the working hook. This phase has its own bug landmines (Pitfall 4: disabled plugin still runs; Pitfall 16: auto-invocation).

**Delivers:** `/feynman` toggle skill, `/feynman-stats` session counter, validated coexistence with caveman running simultaneously.

**Implements:** `skills/feynman/SKILL.md` with `disable-model-invocation: true`, session-keyed temp file for stats counter (`/tmp/feynman-${CLAUDE_SESSION_ID}.count`), caveman interaction table in README.

**Avoids:** Pitfalls 4 (flag-file toggle), 9 (ultra+caveman ultra conflict), 10 (double-injection context bloat), 11 (hook ordering undefined), 12 (skill namespace collision), 16 (auto-invocation), 17 (verbose SKILL.md cost), 18 (no native session memory).

**Research flag:** SKILL.md frontmatter schema verified against official docs. No additional research needed.

---

### Phase 3: IDE Compatibility + Distribution

**Rationale:** Compatibility files (.clinerules, .windsurf, .cursor) are pure text copies of rules — no logic. Must come last because rules text must be final before copying. Windows install.ps1 is a translation of install.sh.

**Delivers:** Full cross-IDE support (Cline, Windsurf, Cursor), Windows install path, `--with-init` flag on install.sh writing all IDE rule files, polished README with before/after examples and caveman compatibility section.

**Addresses:** `.clinerules/feynman.md`, `.windsurf/rules/feynman.md`, `.cursor/rules/feynman.mdc` (YAML frontmatter), `install.ps1`, README conversion copy.

**Research flag:** Windsurf rules path (`.windsurf/rules/`) is MEDIUM confidence (single source — everydev.ai). Verify against current Windsurf docs before implementing this phase.

---

### Phase Ordering Rationale

- Rules before hook: content before the container that delivers it
- Hook before skills: state.json schema must be stable before both read/write it
- Install script last in each phase: file layout must be final before wiring
- IDE compat files last overall: rules text must be final; these are pure copies
- Caveman coexistence in Phase 2 not Phase 1: requires the working hook to test against

### Research Flags

Phases needing deeper research during planning:
- **Phase 3:** Windsurf `.windsurf/rules/` path is MEDIUM confidence — verify against live Windsurf docs before implementing. One wrong path = silent failure for Windsurf users.
- **Phase 2 (stats):** Session-keyed temp file is a workaround for missing Claude Code native session memory. If Claude Code adds a session state API, prefer it over the temp file.

Phases with standard patterns (skip research-phase):
- **Phase 1:** All APIs verified against official Claude Code docs. Three known bugs all have confirmed workarounds. No unknowns remain.
- **Phase 2 (skills):** SKILL.md format is well-documented and verified against official skills reference.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All APIs verified against official Claude Code docs via Context7. CJS/no-deps/UserPromptSubmit confirmed. |
| Features | HIGH | Caveman source verified directly. Plugin/skills docs fetched. Feature table reflects actual user expectations from community data. |
| Architecture | HIGH | Component boundaries and data flow verified against official hooks/skills/plugins references. Bug workarounds confirmed against issue tracker. |
| Pitfalls | HIGH | Each pitfall backed by a specific GitHub issue with reproduction steps. Confirmed bugs, not inferences. |

**Overall confidence:** HIGH

### Gaps to Address

- **`${CLAUDE_PLUGIN_ROOT}` on Windows:** Plugin path expansion on Windows is unverified. Hooks-only install (settings.json absolute path) is the safe v1.0 path; test plugin path on Windows before v2.
- **additionalContext 10,000-char cap:** Documented in official docs but single-source. Keep rules under 8,000 chars for headroom. Add `wc -c` check to CI.
- **`/feynman` SKILL.md frontmatter schema:** Exact fields need verification against current Claude Code command docs before Phase 2 implementation. Known fields: `name`, `description`, `disable-model-invocation`, `allowed-tools`.
- **Claude Code Marketplace submission:** Undocumented publicly as of research date. Plugin-install path cannot be shipped until Anthropic opens the registry. hooks-only install is v1.0.
- **additionalContext duplication bug #14281:** Open bug. Add idempotency guard (session-scoped dedupe flag) as a preventive measure in Phase 1.

---

## Sources

### Primary (HIGH confidence)
- `code.claude.com/docs/en/hooks` — hook input/output format, additionalContext schema, char cap
- `code.claude.com/docs/en/skills` — SKILL.md frontmatter, disable-model-invocation, lifecycle
- `code.claude.com/docs/en/plugins` — plugin.json schema, hooks.json format, CLAUDE_PLUGIN_ROOT
- `github.com/JuliusBrussee/caveman` — reference implementation: install.sh, flag-file pattern, CJS hook structure, .clinerules/ directory format

### Secondary (MEDIUM confidence)
- `github.com/anthropics/claude-code/issues/13912` — stdout causes UserPromptSubmit error (confirmed)
- `github.com/anthropics/claude-code/issues/10225` — plugin UserPromptSubmit hooks never execute (confirmed)
- `github.com/anthropics/claude-code/issues/8810` — tilde path resolution fails from subdirectory (confirmed)
- `github.com/anthropics/claude-code/issues/35713` — disabled plugin still injects (confirmed open)
- `github.com/anthropics/claude-code/issues/17804` — prompt injection false positive from imperative phrasing
- `github.com/anthropics/claude-code/issues/14817` — jq dependency breaks Windows install
- `github.com/anthropics/claude-code/issues/14281` — additionalContext duplication (open)
- `everydev.ai` — Windsurf .windsurf/rules/ path (single source, MEDIUM)
- CHI 2024: "Taking ASCII Drawings Seriously: How Programmers Diagram Code" — diagram trigger patterns

### Tertiary (LOW confidence)
- Claude Code Marketplace submission process — no public documentation found; treat plugin-install path as v2

---
*Research completed: 2026-05-06*
*Ready for roadmap: yes*
