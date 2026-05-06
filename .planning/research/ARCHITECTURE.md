# Architecture: feynman

**Domain:** Claude Code hook plugin (ASCII diagram rule injection)
**Researched:** 2026-05-06
**Confidence:** HIGH — verified against official Claude Code docs (hooks, skills, plugins)

---

## Component Map

```
feynman/
├── .claude-plugin/
│   └── plugin.json           [MANIFEST] Plugin identity, name, version
├── hooks/
│   └── hooks.json            [HOOK REGISTRY] Registers UserPromptSubmit handler
├── hooks/
│   └── feynman-activate.js   [HOOK SCRIPT] Core logic: reads state, injects rules, writes counter
├── rules/
│   └── feynman-rules.md      [RULES SOURCE] ASCII diagram rules, parameterized by intensity level
├── skills/
│   └── feynman/
│       └── SKILL.md          [TOGGLE SKILL] /feynman — on/off and intensity switch
│   └── feynman-stats/
│       └── SKILL.md          [STATS SKILL] /feynman-stats — session diagram count
├── .clinerules/
│   └── feynman.md            [CURSOR/WINDSURF] Same rules, static copy for non-Claude-Code agents
├── install.sh                [INSTALLER] Copies plugin into ~/.claude/plugins/ (Unix/macOS)
└── install.ps1               [INSTALLER] Same for Windows
```

**Boundaries:**

| Component | Owns | Does NOT own |
|-----------|------|--------------|
| plugin.json | Plugin identity, namespace | Hook registration |
| hooks.json | Hook event wiring | Rule content |
| feynman-activate.js | State read/write, rule selection, stdout injection | Rule authoring |
| feynman-rules.md | Diagram rule text for all intensity levels | Hook logic |
| feynman/SKILL.md | Toggle on/off, set intensity level | Injecting rules |
| feynman-stats/SKILL.md | Reporting counter | Mutating counter |
| .clinerules/feynman.md | Cursor/Windsurf compatibility | Claude Code hook path |

---

## Data Flow

### Rule Injection Flow

Every user prompt triggers this path:

```
User submits prompt
        |
        v
Claude Code fires UserPromptSubmit
        |
        v
hooks/hooks.json routes to feynman-activate.js
        |
        v
feynman-activate.js reads stdin JSON
  {session_id, prompt, cwd, ...}
        |
        v
Read state file: ${CLAUDE_PLUGIN_DATA}/state.json
  {enabled: bool, intensity: "lite"|"full"|"ultra", count: int}
        |
        +--(enabled: false)--> exit 0, no output
        |
        v
Select rule subset based on intensity:
  lite  → flow + trees only
  full  → all types (default)
  ultra → all types + force short answers
        |
        v
Increment count in state.json
        |
        v
Write to stdout (plain text OR JSON additionalContext):
  "DIAGRAM RULES: [selected rules text]"
        |
        v
Claude Code appends stdout to prompt context
        |
        v
Claude receives prompt + injected rules → responds with diagrams
```

**stdout format decision:** Use plain text (non-JSON) output. Claude Code appends it verbatim as additional context. This is the simplest path — no JSON wrapping needed for pure context injection.

**State file location:** `${CLAUDE_PLUGIN_DATA}/state.json` — this directory survives plugin updates, making it the correct place for session-persistent data.

---

### Toggle Flow (on/off)

```
User types /feynman [on|off|lite|full|ultra]
        |
        v
skills/feynman/SKILL.md loads
        |
        v
Claude reads $ARGUMENTS → determines action
        |
        v
Claude writes updated state to ${CLAUDE_PLUGIN_DATA}/state.json
  via Bash tool call (allowed-tools: Bash)
        |
        v
Claude confirms change to user
```

**Key constraint:** The skill does not call the hook directly. The hook reads state; the skill writes state. They share only the state file. This is a clean separation — the skill is the writer, the hook is the reader.

**allowed-tools in SKILL.md:** Must include `Bash` so Claude can write the state file without prompting for permission.

---

### Stats Flow

```
User types /feynman-stats
        |
        v
skills/feynman-stats/SKILL.md loads
        |
        v
Claude reads ${CLAUDE_PLUGIN_DATA}/state.json via Bash
        |
        v
Claude reports: enabled status, intensity, count for this session
```

**Session scope caveat:** `${CLAUDE_PLUGIN_DATA}` persists across sessions. The counter is cumulative unless explicitly reset. For "session count" behavior, the hook would need to write a separate session-scoped file using `${CLAUDE_SESSION_ID}`. Decision pending — simplest MVP uses cumulative count.

---

## Build Order

Dependencies between components determine build sequence:

```
Phase 1 (foundation — no deps)
  feynman-rules.md         ← standalone content, no code deps
  plugin.json              ← standalone manifest

Phase 2 (hook — depends on rules)
  feynman-activate.js      ← reads feynman-rules.md content
  hooks/hooks.json         ← wires feynman-activate.js

Phase 3 (skills — depends on state.json contract)
  skills/feynman/SKILL.md  ← writes state.json (contract with hook)
  skills/feynman-stats/SKILL.md ← reads state.json

Phase 4 (compatibility + distribution — depends on rules)
  .clinerules/feynman.md   ← static copy of full rules (no hook needed)
  install.sh               ← copies everything to ~/.claude/plugins/
  install.ps1              ← same for Windows
```

**Why this order matters:**
- Rules must exist before the hook script can reference them (Phase 1 → 2)
- The state.json schema must be agreed before both the hook (writer) and the skill (also writer) and stats skill (reader) are built (Phase 2 + 3 share a contract)
- Install scripts are last — they can only be written once the file layout is final

---

## File Structure (proposed)

```
feynman/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── feynman-activate.js
├── rules/
│   └── feynman-rules.md
├── skills/
│   ├── feynman/
│   │   └── SKILL.md
│   └── feynman-stats/
│       └── SKILL.md
├── .clinerules/
│   └── feynman.md
├── install.sh
├── install.ps1
└── README.md
```

### plugin.json (minimal)

```json
{
  "name": "feynman",
  "description": "Automatically inject ASCII diagram rules into every Claude request",
  "version": "0.1.0",
  "author": { "name": "apolenkov" }
}
```

Skill namespace becomes `/feynman:feynman` and `/feynman:feynman-stats`. The PROJECT.md shows `/feynman` and `/feynman-stats` without namespace — this means the plugin name must be something other than `feynman`, OR the skills are distributed as standalone `.claude/skills/` rather than inside a plugin namespace. **Decision required before Phase 2.**

### hooks/hooks.json

```json
{
  "description": "Inject ASCII diagram rules on every user prompt",
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/feynman-activate.js",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

No `matcher` field — UserPromptSubmit does not filter by matcher (fires on all prompts).

### state.json schema (contract between hook and skills)

```json
{
  "enabled": true,
  "intensity": "full",
  "count": 42,
  "session_counts": {
    "${CLAUDE_SESSION_ID}": 7
  }
}
```

### feynman-activate.js (core logic sketch)

```
stdin → parse JSON → read state.json → if !enabled: exit 0
→ select rules by intensity → increment count → write state.json
→ stdout: rules text → exit 0
```

Pure Node.js, no deps, no build step. Uses `fs`, `process.stdin`, `process.stdout` only.

### skills/feynman/SKILL.md frontmatter

```yaml
---
name: feynman
description: Toggle feynman ASCII diagram injection on/off or switch intensity (lite/full/ultra).
  Use when user says feynman on, feynman off, feynman lite, feynman full, feynman ultra.
disable-model-invocation: true
allowed-tools: Bash(node *) Bash(cat *) Bash(echo *)
---
```

### install.sh (approach)

Not using `claude plugin install` (requires marketplace). Instead: direct file copy into `~/.claude/plugins/feynman/` and optionally patch `~/.claude/settings.json` if standalone hook is needed. Mirrors caveman's approach: auto-detect agent, run appropriate install path.

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Plain text stdout (not JSON) | Simplest injection path; no `additionalContext` wrapper needed |
| State in `${CLAUDE_PLUGIN_DATA}/state.json` | Persists across updates; accessible from both hook and skills |
| Hook reads rules from embedded string (not file at runtime) | Avoids file read latency; rules baked into hook script or imported at load |
| No matcher on UserPromptSubmit | Official docs confirm UserPromptSubmit does not use matchers |
| Skill writes state; hook reads state | Clean separation; no circular dependency |
| Plugin name ≠ "feynman" OR standalone skills | Avoids namespaced `/feynman:feynman` — needs decision |

---

## Open Questions

1. **Plugin vs standalone:** If distributed as a plugin, skills are namespaced `/feynman:feynman`. PROJECT.md shows `/feynman`. Options: (a) plugin named something else, e.g. `diagram`, (b) skills installed as standalone into `~/.claude/skills/` by install.sh, (c) accept namespace. **Needs decision before Phase 2.**

2. **Rules embedded vs file-read:** Should `feynman-activate.js` read `feynman-rules.md` at runtime (simpler authoring) or embed the rule strings inline (faster, no I/O)? Embedding is safer; file read requires knowing `${CLAUDE_PLUGIN_ROOT}` at runtime (available as env var).

3. **Session vs cumulative count:** `/feynman-stats` — per-session or total? Using `${CLAUDE_SESSION_ID}` in state allows both. MVP can start with total, add per-session later.

4. **BUG NOTE:** Official Claude Code issue #10225 reports that `UserPromptSubmit` hooks from plugins match but never execute. This is a known bug. **Mitigation:** Also support install.sh patching `~/.claude/settings.json` directly as a fallback hook registration path. Verify against current Claude Code version before shipping.

---

## Sources

- Claude Code Hooks reference: https://code.claude.com/docs/en/hooks (HIGH confidence)
- Claude Code Skills reference: https://code.claude.com/docs/en/skills (HIGH confidence)
- Claude Code Plugins reference: https://code.claude.com/docs/en/plugins (HIGH confidence)
- caveman repo structure: https://github.com/JuliusBrussee/caveman (MEDIUM — indirect via WebFetch)
- Plugin UserPromptSubmit bug: https://github.com/anthropics/claude-code/issues/10225 (MEDIUM — issue thread)
