# feynman Architecture

Three independent layers: hook lifecycle, lint pipeline, and state schema.

---

## Layer 1: Hook Lifecycle

The `SessionStart` hook primes new sessions, resumed sessions, and sessions
after `/compact` or `/clear`. `UserPromptSubmit` is not used — rules are
injected once at session start and remain in context for the full session.

```
~/.claude/settings.json       ~/.codex/hooks.json
         │
         └─ hooks.SessionStart  startup | resume | compact | clear
         ▼
hooks/feynman-session-start.js
         │
         ├─ [0] FEYNMAN_HOME selects client state root
         │        unset              → ~/.claude (backward compatible)
         │        ~/.claude          → Claude Code install
         │        ~/.codex           → Codex install
         │
         ├─ [1] validate session_id (path-traversal guard)
         │
         ├─ [2] $FEYNMAN_HOME/.feynman-active  ← flag file
         │        absent + no state.json      → bootstrap first run
         │        absent + state.enabled=true → recreate flag
         │        absent + state.enabled=false → exit 0 (user disabled)
         │        present                     → continue
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
         └─ [6] stdout: plain-text rules → injected into session context
                  SessionStart hook accepts plain text (no JSON wrapper needed)
```

**Key constraints:**

- Output is plain text — `SessionStart` hooks emit rules text directly; no
  JSON wrapper is needed or accepted.
- Paths use `os.homedir()`, never tilde literals (bug #8810).
- Production install writes user hook config directly:
  `~/.claude/settings.json` for Claude Code and `~/.codex/hooks.json` for
  Codex. Plugin manifests are shipped for discoverability, but direct hook
  registration remains the reliable fallback.
- Flag file checked before state file to detect intentional disabling
  vs. first run (bug #35713).

**File:** `hooks/feynman-session-start.js`

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
│     absent   = user disabled only when state.enabled=false
│     content  = current intensity string (informational)
│
└── .feynman/
    └── state.json           ← runtime state
          {
            "enabled":      boolean,   // true = inject rules on each prompt
            "intensity":    string,    // "lite" | "full" | "ultra"  — rules-file size
            "output_style": string,    // "short" | "middle" | "full" — visual verbosity (v0.4.0+)
            "injections":   number     // cumulative hook fire count
          }
```

**Two orthogonal axes (v0.4.0):**

```
axis           controls                        value space
─────────────  ───────────────────────────────  ──────────────────
intensity      size of injected ruleset         lite / full / ultra
output_style   verbosity of model's visuals     short / middle / full
```

`intensity` shapes how MUCH instruction the model receives (which trigger
patterns are loaded). `output_style` shapes how HEAVY the model's response
visuals can be (runtime suffix). The two compose: `lite + short` is the
minimal pair for mobile/voice chat; `full + middle` is the recommended
default; `ultra + full` is the maximum-visual configuration.

`output_style` is implemented as a one-line runtime suffix appended to
`additionalContext` — `rules/feynman-activate.md` is NOT modified, so the
4480-byte rules budget stays intact regardless of the chosen style.

**State transitions:**

```
[first run]
  both files absent → bootstrap
  writes state.json {enabled:true, intensity:'full', output_style:'full', injections:0}
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

[/feynman style short | middle | full]
  state.output_style = <value>
  hook reads on next fire; no flag-file change

[npx @albinocrabs/feynman uninstall --target claude|codex|both|all|*]
  hook removed from target hook config
  .feynman-active deleted
  state.json preserved (user data)
```

**Back-compat:** Pre-v0.4.0 `state.json` files lack `output_style`. The
hook reads `state.output_style || 'full'` so missing field is identical
to `"full"`. No migration needed.

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
   ├── examples   → list and render built-in ASCII examples
   ├── help       → this help/usage block
   ├── bootstrap  → exports examples + manifests + skill into local package folder
   └── version    → prints package.json version
```

`/feynman on|off|start|stop|lite|full|ultra` are handled by the skill contract
in `skills/feynman/SKILL.md` and share aliases:
`start` == `on`, `stop` == `off`.

Targets:

```
claude → ~/.claude/settings.json + ~/.claude/.feynman/
codex  → ~/.codex/hooks.json     + ~/.codex/.feynman/
both, all, * → runs claude and codex installers/uninstallers idempotently
```

**File:** `bin/feynman.js`
