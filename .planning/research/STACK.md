# Stack: feynman

**Researched:** 2026-05-06
**Overall confidence:** HIGH (all critical APIs verified against Claude Code official docs and caveman source)

---

## Recommended Stack

### Hook Runtime

**Runtime:** Node.js (system-installed, no bundling)
**Module format:** CommonJS (`require()` / `module.exports`), NOT ESM

Rationale: caveman-activate.js and caveman-mode-tracker.js both use `require('fs')` and `require('path')`. Claude Code invokes hooks via `node <path>` directly — no transpilation, no build step. The hook file must be runnable as `node hooks/feynman.js` with zero dependencies. ESM (`import`/`export`) would require `"type": "module"` in a package.json, adds complexity, and diverges from the proven caveman pattern that users already trust.

**Hook event:** `UserPromptSubmit`

Rationale: Fires on every prompt submission, before the model sees the request. `SessionStart` only fires once per session — if feynman used it, rules would not re-inject after context compaction, which is exactly the failure mode the project must avoid. `UserPromptSubmit` re-injects on every turn.

**Hook input (stdin):**

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../session.jsonl",
  "cwd": "/current/working/dir",
  "permission_mode": "default",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "the user's submitted text"
}
```

Read via `process.stdin` as a buffered string, then `JSON.parse()`.

**Hook output (stdout, exit 0):**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "<full feynman rules text here>"
  }
}
```

`additionalContext` is injected as a system reminder alongside the submitted prompt, visible to Claude but not shown as a chat message. Capped at 10,000 characters; feynman rules are well under that. Use `process.stdout.write(JSON.stringify(...))` — not `console.log` — to avoid trailing newline surprises.

**Blocking prompts:** Set `"decision": "block"` with `"reason": "..."` to halt processing. Not needed for feynman (inject-only, never blocks).

**No dependencies.** Zero npm packages. No `package.json` required for the hook itself.

---

### Plugin Manifest

Location: `.claude-plugin/plugin.json`

**Minimal required fields:**

```json
{
  "name": "feynman"
}
```

**Recommended full manifest:**

```json
{
  "name": "feynman",
  "version": "1.0.0",
  "description": "Injects ASCII diagram rules into every Claude request via UserPromptSubmit hook",
  "author": {
    "name": "apolenkov",
    "url": "https://github.com/apolenkov/feynman"
  },
  "repository": "https://github.com/apolenkov/feynman",
  "license": "MIT",
  "keywords": ["ascii", "diagrams", "visual", "hooks", "claude-code"]
}
```

Rules:
- `name` must be kebab-case (validated by Claude Code on plugin load)
- `version` must be semver `MAJOR.MINOR.PATCH` if present — `"1.0"` is invalid
- File must live at `.claude-plugin/plugin.json`, not `.claude-plugin.json` at root

**Plugin hooks file:** `hooks/hooks.json`

For the Claude Code plugin install path (`/plugin install feynman`), hooks are declared in `hooks/hooks.json` using the plugin format:

```json
{
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/feynman.js\"",
          "timeout": 5
        }
      ]
    }
  ]
}
```

Note: `UserPromptSubmit` has no `matcher` field — it fires on every prompt, unconditionally.

---

### Install Mechanism

**Two parallel install paths — both required:**

#### Path A: Standalone hooks install (primary, mirrors caveman)

`install.sh` — curl-pipe-bash one-liner:

```bash
bash <(curl -s https://raw.githubusercontent.com/apolenkov/feynman/main/install.sh)
```

The script:
1. Checks `node` is available (`command -v node`)
2. Copies `hooks/feynman.js` to `~/.claude/hooks/feynman.js`
3. Copies rules source to `~/.claude/hooks/feynman-rules.js` (or embeds inline)
4. Merges hook entry into `~/.claude/settings.json` using Node.js inline (`node -e "const fs = require('fs'); ..."`) — NOT `jq`, mirrors caveman exactly
5. Creates `~/.claude/settings.json` as `{}` if missing before merge
6. Idempotent: checks if hook already registered before adding
7. Prints install confirmation with mode info

`install.ps1` — Windows PowerShell equivalent, hand-kept in sync.

**settings.json entry written:**

```json
{
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node \"/Users/<user>/.claude/hooks/feynman.js\"",
          "timeout": 5,
          "statusMessage": "Injecting diagram rules..."
        }
      ]
    }
  ]
}
```

Path is written as absolute at install time (caveman pattern). `statusMessage` shown in Claude Code UI while hook runs.

#### Path B: Claude Code plugin install (secondary)

```
/plugin install feynman
```

Requires publishing to Claude Code Marketplace. Plugin discovery uses `hooks/hooks.json` + `${CLAUDE_PLUGIN_ROOT}` env var. Lower priority for v1.0 — hooks install is faster to ship and what caveman users already know.

---

### IDE Compatibility Layer

**Cline:** `.clinerules/feynman.md`
- Plain markdown, no frontmatter, no special syntax
- Directory `.clinerules/` is auto-scanned by Cline; all `.md` files injected
- Content: the feynman rules text verbatim (same source as hook injects)
- Windsurf also recognizes `.clinerules/` (cross-compatibility via shared format)

**Windsurf native:** `.windsurf/rules/feynman.md`
- Plain markdown, no frontmatter
- Windsurf auto-discovers files in `.windsurf/rules/`
- Content: same rules text

**Cursor:** `.cursor/rules/feynman.mdc`
- YAML frontmatter required by Cursor's `.mdc` format:
  ```yaml
  ---
  description: Inject ASCII diagram rules for visual responses
  alwaysApply: true
  ---
  ```
- Body: the feynman rules text (markdown)
- Cursor applies `alwaysApply: true` rules to every conversation in the project

**Single source of truth:** Keep rules in one canonical file (e.g., `rules/feynman-full.md`). The hook reads it at runtime; `install.sh --with-init` copies it into all three IDE locations. This mirrors caveman's `--with-init` flag pattern.

**CLAUDE.md manual fallback:** README instructs users to paste rules into their `CLAUDE.md` as an alternative to hook install. Same rules text, copy-paste.

---

## What NOT to Use

| Rejected | Why |
|----------|-----|
| ESM (`import`/`export`) | Requires `"type": "module"` in package.json, adds complexity, diverges from caveman CJS pattern |
| `jq` for settings.json merge | Not universally installed; caveman uses `node -e` inline for portability |
| npm dependencies | Zero-dep is a hard constraint; keeps install auditable and fast |
| `SessionStart` hook instead of `UserPromptSubmit` | Only fires once — rules lost after context compaction |
| `type: "prompt"` hook | LLM-interpreted, non-deterministic; rules injection must be exact text, not AI-summarized |
| Mermaid / graphviz rendering | Out of scope per PROJECT.md; ASCII only |
| Single flat `.clinerules` file | Cline deprecated flat file in favor of `.clinerules/` directory |
| `console.log` for hook output | Adds trailing newline; use `process.stdout.write(JSON.stringify(...))` |

---

## Open Questions

1. **`${CLAUDE_PLUGIN_ROOT}` vs absolute path in hooks.json:** Plugin install uses `${CLAUDE_PLUGIN_ROOT}` env var — confirmed by official docs. Standalone hooks install writes absolute path. Both needed. Question: does `${CLAUDE_PLUGIN_ROOT}` expand correctly on Windows in the plugin path? Needs testing on Windows before v1.0.

2. **Intensity levels and hook output size:** Full rules text for `ultra` mode may approach 3-5KB. `additionalContext` cap is 10,000 chars — safe. But does injecting on every prompt affect latency noticeably? Unknown without benchmarking.

3. **`/feynman` toggle slash command format:** Commands live in `commands/feynman.md` as markdown files with YAML frontmatter (`allowed-tools`, `description`). Exact frontmatter schema needs verification against current Claude Code command docs before implementation.

4. **Marketplace availability:** Publishing to Claude Code Marketplace is undocumented publicly as of 2026-05-06. `/plugin install feynman` path may require Anthropic review or registry access. Hooks-only install is the safe v1.0 delivery.

---

## Confidence Levels

| Area | Confidence | Source |
|------|------------|--------|
| `UserPromptSubmit` hook input format (`prompt` field in stdin) | HIGH | Official Claude Code docs via Context7 `/anthropics/claude-code` |
| `hookSpecificOutput.additionalContext` output format | HIGH | Official Claude Code docs (code.claude.com/docs/en/hooks) |
| `additionalContext` 10,000 char cap | MEDIUM | Official docs page (single source, no corroboration) |
| CommonJS requirement for hook scripts | HIGH | Caveman source (caveman-activate.js uses `require()`) + zero-dep constraint |
| `.claude-plugin/plugin.json` manifest format | HIGH | Context7 `/anthropics/claude-code` official plugin docs |
| hooks.json plugin format with `${CLAUDE_PLUGIN_ROOT}` | HIGH | Context7 official docs |
| `node -e` inline Node.js for settings.json merge | HIGH | Caveman install.sh source — no jq dependency |
| `.clinerules/` directory format (Cline) | HIGH | Multiple sources: caveman repo + everydev.ai analysis |
| `.windsurf/rules/` format | MEDIUM | Single source (everydev.ai); Windsurf docs not directly verified |
| `.cursor/rules/*.mdc` YAML frontmatter format | HIGH | Multiple sources: caveman README + Cursor documentation |
| `UserPromptSubmit` has no matcher support | HIGH | Official docs: "No matcher support — fires on every prompt submission" |
| Marketplace publish path | LOW | No public Anthropic documentation found for v1.0 marketplace submission |
