# feynman Architecture

Three independent layers: hook lifecycle, lint pipeline, and state schema.

---

## Layer 1: Hook Lifecycle

The `UserPromptSubmit` hook fires before every Claude Code or Codex prompt.
feynman intercepts the event, reads the active rules, and injects them as
`additionalContext`.

```
~/.claude/settings.json       ~/.codex/hooks.json
         │
         │  hooks.UserPromptSubmit fires on every prompt
         ▼
hooks/feynman-activate.js
         │
         ├─ [0] FEYNMAN_HOME selects client state root
         │        unset              → ~/.claude (backward compatible)
         │        ~/.claude          → Claude Code install
         │        ~/.codex           → Codex install
         │
         ├─ [1] validate session_id (path-traversal guard)
         │
         ├─ [2] $FEYNMAN_HOME/.feynman-active  ← flag file
         │        absent + no state.json   → bootstrap first run
         │        absent + state.json      → exit 0 (user disabled)
         │        present                  → continue
         │
         ├─ [3] $FEYNMAN_HOME/.feynman/state.json
         │        enabled: false           → exit 0
         │        corrupt JSON             → exit 0 (fail safe)
         │
         ├─ [4] rules/feynman-activate.md
         │        extract section for state.intensity
         │        (lite | full | ultra)
         │
         ├─ [5] state.injections++  (write back)
         │
         └─ [6] stdout: JSON additionalContext → injected into prompt
                  {hookSpecificOutput: {hookEventName: 'UserPromptSubmit',
                                        additionalContext: <rules text>}}
```

**Key constraints:**

- Output must be JSON with no trailing newline — plain stdout triggers
  Claude Code's red error banner (bug #13912).
- Paths use `os.homedir()`, never tilde literals (bug #8810).
- Production install writes user hook config directly:
  `~/.claude/settings.json` for Claude Code and `~/.codex/hooks.json` for
  Codex. Plugin manifests are shipped for discoverability, but direct hook
  registration remains the reliable fallback.
- Flag file checked before state file to detect intentional disabling
  vs. first run (bug #35713).

**File:** `hooks/feynman-activate.js`

---

## Layer 2: Lint Pipeline

The lint pipeline validates ASCII diagram correctness in markdown files.
It runs as a CLI tool and as an optional `Stop` hook.

```
<file.md> or stdin
         │
         ▼
lib/lint/parser.js
         │  parseMarkdown(text) → ASTNode[]
         │  each node: {type, content, startLine, endLine}
         │  types: fenced_code, ascii_art (freestanding)
         │
         ▼
lib/lint/rules.js
         │  runs each rule against each AST node:
         │
         ├─ L01_box_closure(ast)
         ├─ L02_tree_chars(ast)
         ├─ L03_arrow_style(ast)
         ├─ L04_column_widths(ast)
         ├─ L05_flow_integrity(ast)
         ├─ L06_priority_scale(ast)
         ├─ L07_no_mermaid_mix(ast, fullText)
         └─ L08_frame_width(ast)
         │
         │  each rule returns Issue[]:
         │  {rule, severity, line, column, message, suggestion?}
         │
         ▼
reporter (inline in CLI + Stop hook)
         │
         ├─ bin/feynman-lint.js   ← standalone CLI
         │     feynman lint <file>
         │     exit 0: no errors
         │     exit 1: errors found
         │     exit 2: usage error
         │     --json: machine-readable output
         │     --strict: warnings treated as errors
         │
         └─ hooks/feynman-lint.js ← Stop hook (optional)
               fires after Claude's response
               if issues found: injects correction context
               into next UserPromptSubmit cycle
```

**File:** `lib/lint/parser.js`, `lib/lint/rules.js`, `bin/feynman-lint.js`,
`hooks/feynman-lint.js`

---

## Layer 3: State Schema

All runtime state lives in two files under the selected client root:
`~/.claude/` for Claude Code, `~/.codex/` for Codex.

```
~/.claude/ or ~/.codex/
├── .feynman-active          ← presence flag
│     present  = feynman active
│     absent   = user disabled (state.json preserved)
│     content  = current intensity string (informational)
│
└── .feynman/
    └── state.json           ← runtime state
          {
            "enabled":    boolean,   // true = inject rules on each prompt
            "intensity":  string,    // "lite" | "full" | "ultra"
            "injections": number     // cumulative hook fire count
          }
```

**State transitions:**

```
[first run]
  both files absent → bootstrap
  writes state.json {enabled:true, intensity:'full', injections:0}
  writes .feynman-active with intensity string

[/feynman off]
  state.enabled = false
  .feynman-active deleted

[/feynman on]
  state.enabled = true
  .feynman-active created

[/feynman lite | full | ultra]
  state.intensity = <value>
  .feynman-active content updated

[npx feynman uninstall --target claude|codex|both]
  hook removed from target hook config
  .feynman-active deleted
  state.json preserved (user data)
```

**Schema is frozen** — field names are used by `hooks/feynman-activate.js`,
`bin/feynman.js`, and `skills/feynman/SKILL.md`. Any rename requires
coordinated update across all three files.

**File:** read/written by `hooks/feynman-activate.js` and `bin/feynman.js`;
managed by skill commands in `skills/feynman/SKILL.md`.

---

## CLI Subcommand Map

```
bin/feynman.js
├── install    → writes target hook config + state.json + flag
├── uninstall  → removes target hook entries + flag (keeps state)
├── doctor     → checks target health criteria, prints frame
├── lint       → delegates to bin/feynman-lint.js
└── version    → prints package.json version
```

Targets:

```
claude → ~/.claude/settings.json + ~/.claude/.feynman/
codex  → ~/.codex/hooks.json     + ~/.codex/.feynman/
both   → runs claude and codex installers idempotently
```

**File:** `bin/feynman.js`
