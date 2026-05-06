# Phase 3: Diagram Linter - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Build the diagram linter — main new feature of v0.2.0. Validates ASCII diagrams against 8 structural rules. Two surfaces: standalone CLI and Stop-hook that feeds corrections back to Claude.

**Delivers:**
- `lib/lint/parser.js` — ASCII diagram block parser → AST with line numbers
- `lib/lint/rules.js` — 8 rules L01-L08
- `lib/lint/index.js` — orchestrator (parse + apply rules + format report)
- `bin/feynman-lint.js` — standalone CLI (`feynman-lint <file.md>`)
- `hooks/feynman-lint.js` — Stop-hook variant (reads Claude response, emits additionalContext on failure)
- `tests/lint-cases.json` — 20+ golden cases (positive + negative per rule)
- `tests/fixtures/*.md` — concrete diagram examples for tests

**Does NOT deliver:** test runner integration (Phase 4), NPX wrapper (Phase 5), docs (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Architecture

- **D-01:** Parser returns AST with: `{type, content, startLine, endLine, indent}` per diagram block. Diagram detection: ASCII art between ``` fences OR standalone blocks with high concentration of box/arrow chars.
- **D-02:** Rules are pure functions: `(ast, context) => Issue[]`. Each Issue: `{rule, severity, line, column, message, suggestion}`.
- **D-03:** No npm deps — pure Node.js, CommonJS.

### Detection heuristic
- **D-04:** Diagram = block where ≥30% of non-space chars are in the set `┌┐└┘─│├┤┬┴┼├──└──→←↑↓▲▼<-->|+[]()` and block has ≥3 lines OR contains `[Box]`-style tokens.

### Rule definitions

L01 box closure
- Every `┌` opens; matching `└` closes at same column with `─` between top/bottom.
- Every `─┐` requires `─┘` at same column.
- Vertical `│` chars must align between top/bottom.

L02 tree chars
- `├──` for non-last children, `└──` for last child.
- A tree branch where last child uses `├──` (instead of `└──`) is a fail.

L03 arrow style
- Allowed styles: `-->`, `→`, `─→`, `──>`.
- Within ONE diagram, only ONE style allowed. Mixing fails.

L04 column widths
- Markdown-table-like blocks: `| col | col |` rows must have same column count.
- `|---|---|` separator must match column count of header.

L05 flow integrity
- Tokens like `[Box]` should connect via arrows. Two `[Box]` tokens on same line without arrow between = fail.

L06 priority scale
- If `▲` appears, `▼` must also appear (and vice versa).

L07 mermaid+ASCII mix
- If response contains both ` ```mermaid ` block AND a detected ASCII diagram → fail.

L08 frame width discipline
- All rows inside a `┌─...─┐` frame must have the same display width (handle multibyte chars correctly).

### CLI interface

- **D-05:** `feynman-lint <file>` — exit 0 on pass, exit 1 on any failure, exit 2 on usage error.
- **D-06:** Output format: `<file>:<line>:<col>: L0X <message>` (gcc-style).
- **D-07:** `--json` flag for structured output.
- **D-08:** `--strict` flag treats info/warn as errors. Default: only `error` severity fails the run.

### Stop-hook integration

- **D-09:** `hooks/feynman-lint.js` — reads stdin JSON `{response: "..."}` (Claude's last message).
- **D-10:** If lint fails, emit `additionalContext` with rule-by-rule corrections so Claude self-corrects on next turn.
- **D-11:** If lint passes, exit 0 silently.
- **D-12:** Stop-hook is OPTIONAL — registered separately in settings.json. Phase 3 does NOT auto-register it; user opts in.

### Severity levels

- **D-13:** L01, L05 = `error` (structural — broken diagram).
- **D-14:** L02, L03, L04, L08 = `error` (consistency — confusing diagram).
- **D-15:** L06, L07 = `warn` (minor — fixable).
- **D-16:** Default behavior: errors fail run, warns are reported but pass.

### Golden cases

- **D-17:** `tests/lint-cases.json` schema: `[{name, rule, expected: 'pass'|'fail', input, expected_issues?: [{rule, line}]}]`.
- **D-18:** Minimum 20 cases — at least 2 (1 positive + 1 negative) per rule.

### Claude's Discretion
- Detection heuristic threshold (30% suggestion above) — tune empirically against fixtures
- Exact format of additionalContext message in Stop-hook — concise and actionable
- Whether to support multiline boxes with internal text — Phase 3 yes, simple cases first

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — LINT-01..12 with full spec
- `rules/feynman-activate.md` — defines what diagrams should look like (positive examples for fixtures)
- `hooks/feynman-activate.js` — pattern for Node CJS hook structure

</canonical_refs>

<code_context>
## Existing Code Insights

### Established Patterns from Phase 1+2
- CommonJS only (`require()`, `module.exports`)
- Zero npm deps
- `process.stdout.write(JSON.stringify(...))` for hook output
- `os.homedir()` never tilde
- HTML comment markers in markdown
- Silent fail pattern (exit 0 even on errors in hook)

### New patterns introduced this phase
- `lib/` directory for reusable modules
- `bin/` directory for executable CLIs
- `tests/` directory for golden cases and test scripts (test runner in Phase 4)

</code_context>

<specifics>
## Specific Ideas

- Parser uses small state machine — track inside-fence flag, line buffer, current diagram start
- Rules can be added/removed via `lib/lint/rules.js` exporting a registry: `module.exports = { L01, L02, ..., L08 }`
- Reporter formatted for both terminal (color via `\x1b[...]` if TTY) and JSON (--json flag)
- Stop-hook should NOT block Claude — emit additionalContext but exit 0 always (per HOOK best practices)

</specifics>

<deferred>
## Deferred Ideas

- Auto-fix mode (`feynman-lint --fix`) — Phase 6.5/v0.3.0
- Custom rules via config file — v0.3.0
- Diagram-style preferences (Tufte/Few rules) — v0.3.0
- Multi-file batch mode (`feynman-lint **/*.md`) — Phase 5 NPX

</deferred>

---
*Phase: 3-Diagram-Linter*
*Context gathered: 2026-05-06*
