# Phase 1: Core - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the core product IP: the ASCII diagram rules file, the UserPromptSubmit hook that injects those rules on every prompt, the plugin manifest, and a README skeleton. After Phase 1, a user can install feynman via one command and receive diagram rules on every Claude prompt — no additional configuration required.

**Delivers:**
- `rules/feynman-activate.md` — ASCII diagram injection rules, 3 intensity variants (lite/full/ultra)
- `hooks/feynman-activate.js` — UserPromptSubmit hook; reads state, selects variant, injects rules
- `.claude-plugin/plugin.json` — plugin identity manifest
- `README.md` — skeleton with one before/after example and install one-liner placeholder

**Does NOT deliver** (later phases): /feynman toggle skill, /feynman-stats, install.sh, .clinerules, .cursor/rules

</domain>

<decisions>
## Implementation Decisions

### Rule Delivery

- **D-01:** The hook reads rules at runtime from `rules/feynman-activate.md` using `fs.readFileSync`. Rules are NOT embedded as JS strings in the hook. Rationale: the rules file is the core product IP and must be authorable without touching JS. The file path is resolved relative to the hook file's `__dirname`.
- **D-02:** The rules file contains all three intensity variants delimited by markers (e.g., `<!-- lite -->`, `<!-- full -->`, `<!-- ultra -->`). The hook parses the appropriate section based on `state.json` intensity.

### State File

- **D-03:** State is stored at `~/.claude/.feynman/state.json` — resolved to absolute path at runtime using `os.homedir()`. This avoids dependency on `CLAUDE_PLUGIN_DATA` env var which may not be set when the hook is registered via `settings.json` (not via plugin path — confirmed bug #10225).
- **D-04:** State schema: `{ "enabled": boolean, "intensity": "lite"|"full"|"ultra", "count": number }`. The `count` field tracks session diagram injections; set to 0 on first run.

### First-Run Behavior

- **D-05:** On first run (state.json does not exist): the hook creates `~/.claude/.feynman/` directory and writes default `state.json`: `{ "enabled": true, "intensity": "full", "count": 0 }`. Default intensity is `full` per PROJECT.md core value. The hook does NOT fail silently on missing state — it bootstraps.

### Hook Output Format

- **D-06:** Hook MUST output via `process.stdout.write(JSON.stringify({...}))` with NO trailing newline. Format: `{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "<rules_text>" } }`. Plain stdout causes visible red error in Claude Code UI (confirmed bug #13912).
- **D-07:** When `enabled: false`, the hook exits with code 0 and writes NO output — empty stdout. Checking is done via flag file `~/.claude/.feynman-active` checked first, then state.json as fallback. If the hook can't read state.json (corrupt/unreadable), it also exits 0 silently (fail-safe over fail-loud).

### Rules Authoring

- **D-08:** All rules MUST be phrased as declarative facts about system behavior, not commands. "Responses that contain flows include an ASCII diagram" — NOT "Always draw a diagram when you see a flow". Imperative phrasing triggers prompt-injection defense (confirmed bug #17804).
- **D-09:** Each intensity variant must stay under 8,000 chars (additionalContext cap is 10,000 — keeping 2,000 headroom). Rule content is the most important creative work of Phase 1; budget significant iteration time.

### README Skeleton

- **D-10:** Phase 1 README is a skeleton only: title + tagline, one before/after markdown table (same answer without feynman as prose vs with feynman as ASCII diagram), and `<!-- INSTALL PLACEHOLDER -->` comment. Full install instructions and sections (intensity levels, caveman compatibility) are Phase 3 scope.

### Claude's Discretion

- Exact wording and structure of the rules for each diagram type — the trigger conditions and WHEN-NOT-TO-DRAW list are specified in REQUIREMENTS.md; precise prose is Claude's authoring call
- Whether to use a single rules file with section markers vs three separate files — single file preferred (simpler) but split is acceptable if it makes the hook logic cleaner
- Internal hook error handling verbosity (logging to stderr vs silent) — keep silent per fail-safe principle (D-07)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — project goals, core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements RULE-01..04, HOOK-01..05, DIST-04, DOCS-01..02 (Phase 1 scope)

### Research (Critical — Contains Bug Workarounds)
- `.planning/research/SUMMARY.md` — synthesized findings; critically: bug #10225 (plugin hooks don't fire), #13912 (stdout format), #8810 (tilde path), #17804 (imperative phrasing)
- `.planning/research/STACK.md` — exact hook API format, CJS module requirements, additionalContext schema
- `.planning/research/PITFALLS.md` — 18 specific pitfalls with issue numbers; Phase 1 must address pitfalls 1, 2, 3, 5, 6, 7, 13, 14

### External References (verified by research)
- Claude Code hooks API: `UserPromptSubmit` fires per-prompt; output must be JSON `additionalContext` wrapper
- caveman (JuliusBrussee/caveman): reference implementation for hook structure, install pattern, .clinerules format

### No external specs — requirements fully captured in decisions above and REQUIREMENTS.md

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project; no existing code to reuse

### Established Patterns
- None yet — Phase 1 establishes all patterns that later phases follow

### Integration Points
- `~/.claude/.feynman/state.json` — shared contract between hook (Phase 1) and skills (Phase 2); schema must be locked in Phase 1 and not changed
- `hooks/feynman-activate.js` path — must be absolute after install; install.sh (Phase 3) reads Phase 1's hook location

</code_context>

<specifics>
## Specific Ideas

- **Mirror caveman structure** — the user explicitly said "mirror caveman (JuliusBrussee/caveman)"; the repo layout should match caveman's directory conventions
- **Start small** — user said "Start with: hooks/feynman-activate.js + rules/feynman-activate.md + README.md skeleton. Ask before creating more files." Phase 1 delivers exactly these 3 files plus plugin.json (needed for plugin identity)
- **Tagline** — "why explain in words when diagram do trick" — must appear in README and potentially in plugin.json description

</specifics>

<deferred>
## Deferred Ideas

- `install.sh` one-liner — Phase 3
- `/feynman` toggle skill — Phase 2
- `/feynman-stats` skill — Phase 2
- `.clinerules/feynman.md` for Cursor/Windsurf — Phase 3
- `.cursor/rules/feynman.mdc` — Phase 3
- `install.ps1` Windows — Phase 3
- Claude Code Marketplace `/plugin install feynman` — v2 (undocumented submission process)

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Core*
*Context gathered: 2026-05-06*
