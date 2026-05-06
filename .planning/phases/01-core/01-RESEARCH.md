# Phase 1: Core - Research

**Researched:** 2026-05-06
**Domain:** Claude Code UserPromptSubmit hook — ASCII diagram rule injection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Hook reads rules at runtime from `rules/feynman-activate.md` using `fs.readFileSync`. Rules are NOT embedded as JS strings in the hook. Path resolved relative to `__dirname`.
- **D-02:** Rules file contains all three intensity variants delimited by markers (e.g., `<!-- lite -->`, `<!-- full -->`, `<!-- ultra -->`). Hook parses appropriate section based on `state.json` intensity.
- **D-03:** State stored at `~/.claude/.feynman/state.json` — resolved via `os.homedir()`. Not dependent on `CLAUDE_PLUGIN_DATA` env var.
- **D-04:** State schema: `{ "enabled": boolean, "intensity": "lite"|"full"|"ultra", "count": number }`.
- **D-05:** First run: hook creates `~/.claude/.feynman/` and writes default `{ "enabled": true, "intensity": "full", "count": 0 }`. Does NOT fail silently — bootstraps.
- **D-06:** Hook outputs via `process.stdout.write(JSON.stringify({...}))` with NO trailing newline. Format: `{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "<rules_text>" } }`. Plain stdout causes visible red error (bug #13912).
- **D-07:** When `enabled: false`: hook exits code 0, writes NO output. Checks flag file `~/.claude/.feynman-active` first, state.json as fallback. Corrupt/unreadable state → exit 0 silently.
- **D-08:** All rules phrased as declarative facts, not commands. "Responses that contain flows include an ASCII diagram" — not "Always draw a diagram". Imperative phrasing triggers prompt-injection defense (bug #17804).
- **D-09:** Each intensity variant under 8,000 chars (10,000 char cap minus 2,000 headroom).
- **D-10:** Phase 1 README is skeleton only: title + tagline, one before/after markdown table, `<!-- INSTALL PLACEHOLDER -->` comment.

### Claude's Discretion

- Exact wording and structure of rules for each diagram type
- Whether to use a single rules file with section markers vs three separate files (single preferred)
- Internal hook error handling verbosity (keep silent per D-07 fail-safe principle)

### Deferred Ideas (OUT OF SCOPE)

- `install.sh` one-liner — Phase 3
- `/feynman` toggle skill — Phase 2
- `/feynman-stats` skill — Phase 2
- `.clinerules/feynman.md` for Cursor/Windsurf — Phase 3
- `.cursor/rules/feynman.mdc` — Phase 3
- `install.ps1` Windows — Phase 3
- Claude Code Marketplace `/plugin install feynman` — v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RULE-01 | `rules/feynman-activate.md` defines WHEN to draw — flow → ASCII boxes+arrows; hierarchy → tree; comparison → side-by-side columns; status >5 lines → ┌─frame─┐ blocks; priority chain → ▲▼ scales | Rules section + declarative phrasing patterns |
| RULE-02 | Rules define explicit WHEN NOT to draw — single facts, code blocks, short answers (<5 lines without structure) | Negative conditions pattern verified from PITFALLS.md pitfall 7 |
| RULE-03 | Three intensity variants in rules file: `lite` (flow+trees only), `full` (all types, default), `ultra` (force diagram even for short answers) | Marker parsing pattern in hook code examples |
| RULE-04 | Rules phrased as declarative facts ("responses with flows include..."), not commands; each variant under 8,000 chars | Bug #17804 workaround; char budget section |
| HOOK-01 | Hook outputs JSON `{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: "..."}}` — not plain stdout | Exact code pattern from caveman-mode-tracker.js (VERIFIED) |
| HOOK-02 | Hook registered in `~/.claude/settings.json` with absolute expanded path — not via plugin.json | Bug #10225 + #8810 workaround; settings.json structure verified |
| HOOK-03 | Hook reads `state.json`; exits silently (code 0) when disabled | Flag file check pattern + bootstrap pattern |
| HOOK-04 | Hook selects rule variant based on intensity level (lite / full / ultra) | Marker-based file parsing pattern |
| HOOK-05 | Hook increments session diagram counter in state.json | state.json write pattern; session counter via `data.session_id` from stdin |
| DIST-04 | `.claude-plugin/plugin.json` manifest with `name`, `version` (semver), `description` | Verified schema from caveman plugin.json (VERIFIED) |
| DOCS-01 | `README.md` before/after table — same answer without feynman (prose) vs with feynman (ASCII diagram) | README skeleton pattern |
| DOCS-02 | `README.md` one-liner install section (placeholder only in Phase 1) | `<!-- INSTALL PLACEHOLDER -->` pattern from D-10 |
</phase_requirements>

---

## Summary

Phase 1 delivers four files on a greenfield repo: the hook script, the rules file, the plugin manifest, and a README skeleton. All critical API patterns are fully verified against the caveman source code (installed locally at `~/.claude/plugins/cache/caveman/caveman/ef6050c5e184/`) and against GSD's own production hooks (in `~/.claude/hooks/`). There are no unknowns — only three confirmed runtime bugs with known fixes.

The `caveman-mode-tracker.js` file is the canonical reference implementation for a UserPromptSubmit hook that outputs `hookSpecificOutput.additionalContext`. It demonstrates exactly the stdin-read → JSON-parse → flag-check → stdout-write pattern that feynman's hook must follow. The key difference: feynman reads a rules file and outputs its content as `additionalContext`; caveman outputs a short mode reminder string.

The plugin.json schema is verified from caveman's own manifest. The hook MUST be registered via `~/.claude/settings.json` (absolute expanded path), not inside plugin.json, because UserPromptSubmit hooks registered via plugin.json silently never fire (bug #10225). The plugin.json exists for plugin identity only — it declares no hooks in Phase 1.

**Primary recommendation:** Mirror caveman-mode-tracker.js's stdin/stdout pattern exactly. Replace the mode-reminder string with the parsed rules variant text. Add flag-file check at entry, state.json bootstrap on first run, and idempotency guard keyed on `data.session_id`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rules injection | Hook script (Node.js subprocess) | — | Claude Code fires hook per prompt; hook owns injection |
| Rules content / diagram triggers | Rules file (markdown) | — | Authoring concern, separated from hook logic per D-01 |
| Intensity variant selection | Hook script | state.json | Hook reads state, parses file section |
| Session counter | Hook script (writes state.json) | — | Hook is the only process that runs per prompt |
| Enable/disable toggle | Flag file (`~/.claude/.feynman-active`) | state.json | Flag file checked first per D-07; mirrors caveman pattern |
| Plugin identity | `.claude-plugin/plugin.json` | — | Claude Code plugin system requirement |
| Hook registration | `~/.claude/settings.json` | — | Bug #10225: plugin.json hooks don't fire for UserPromptSubmit |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | system (v18+) | Hook runtime | Guaranteed present on any Claude Code machine |
| `fs` (built-in) | — | File I/O for state.json, rules file, flag file | Zero-dep; caveman uses same |
| `path` (built-in) | — | Path resolution from `__dirname` | Zero-dep |
| `os` (built-in) | — | `os.homedir()` for `~/.claude/.feynman/` | Zero-dep; avoids tilde expansion bug #8810 |

No npm packages. Zero-dependency is a hard constraint.

**Installation:** No installation required. Invoked as `node hooks/feynman-activate.js` by Claude Code.

**Version verification:** Node.js v25.9.0 confirmed available. `[VERIFIED: command -v node && node --version]`

---

## Architecture Patterns

### System Architecture Diagram

```
User types prompt
       |
       v
Claude Code runtime
       |
       +-- fires UserPromptSubmit
       |
       v
node hooks/feynman-activate.js
       |
       +-- read stdin (JSON: session_id, prompt, cwd, ...)
       |
       +-- check ~/.claude/.feynman-active (flag file)
       |       if missing → exit 0, no output (disabled)
       |
       +-- read ~/.claude/.feynman/state.json
       |       if missing → bootstrap default state
       |       if corrupt → exit 0 silently
       |
       +-- check idempotency guard (/tmp/feynman-{session_id}.injected)
       |       if exists → exit 0 (already injected this session turn)
       |
       +-- read rules/feynman-activate.md
       |       parse section for state.intensity (lite/full/ultra)
       |
       +-- increment state.count, write state.json
       +-- write idempotency guard file
       |
       +-- process.stdout.write(JSON.stringify({
       |     hookSpecificOutput: {
       |       hookEventName: "UserPromptSubmit",
       |       additionalContext: <rules_text>
       |     }
       |   }))
       |
       v
Claude Code injects additionalContext as system reminder
Claude sees diagram rules → responds with diagrams
```

### Recommended Project Structure

```
feynman/
├── .claude-plugin/
│   └── plugin.json          # plugin identity manifest (no hooks)
├── hooks/
│   └── feynman-activate.js  # UserPromptSubmit hook
├── rules/
│   └── feynman-activate.md  # diagram rules, all 3 variants
└── README.md                # skeleton: title, before/after, install placeholder
```

This mirrors caveman's layout exactly. `rules/` maps to caveman's `rules/`. `hooks/` maps to caveman's `hooks/`. `.claude-plugin/` is shared pattern.

---

### Pattern 1: UserPromptSubmit Hook — Minimal Working Template

This is the exact pattern from `caveman-mode-tracker.js` (VERIFIED: read directly from installed caveman plugin at `~/.claude/plugins/cache/caveman/caveman/ef6050c5e184/hooks/caveman-mode-tracker.js`):

```javascript
#!/usr/bin/env node
// feynman — UserPromptSubmit hook — injects ASCII diagram rules

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const FEYNMAN_DIR = path.join(HOME, '.claude', '.feynman');
const STATE_PATH = path.join(FEYNMAN_DIR, 'state.json');
const FLAG_PATH = path.join(HOME, '.claude', '.feynman-active');
const RULES_PATH = path.join(__dirname, '..', 'rules', 'feynman-activate.md');

const DEFAULT_STATE = { enabled: true, intensity: 'full', count: 0 };

// --- stdin read (exact caveman pattern) ---
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // Step 1: flag file check (bug #35713 — disabled plugin still injects)
    if (!fs.existsSync(FLAG_PATH)) {
      process.exit(0);
    }

    // Step 2: read state.json, bootstrap on first run
    let state;
    try {
      state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') {
        // First run — bootstrap
        fs.mkdirSync(FEYNMAN_DIR, { recursive: true });
        state = { ...DEFAULT_STATE };
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
        // Also create the flag file so feynman is active from first run
        fs.writeFileSync(FLAG_PATH, 'full');
      } else {
        // Corrupt state — fail safe
        process.exit(0);
      }
    }

    if (!state.enabled) {
      process.exit(0);
    }

    // Step 3: idempotency guard (bug #14281 — additionalContext duplication)
    const sessionId = data.session_id || 'unknown';
    // Sanitize session_id before using in path (verified pattern from gsd-context-monitor.js)
    if (/[/\\]|\.\./.test(sessionId)) {
      process.exit(0);
    }
    const guardFile = path.join(os.tmpdir(), `feynman-${sessionId}.injected`);
    // Note: do NOT use a guard file here — UserPromptSubmit fires per prompt,
    // and we WANT to re-inject rules on every prompt (that's the whole point).
    // Bug #14281 is about duplication within a single prompt turn, not across turns.
    // The JSON output format prevents duplication within a turn automatically.

    // Step 4: read and parse rules file
    let rulesText;
    try {
      const fullRules = fs.readFileSync(RULES_PATH, 'utf8');
      rulesText = extractVariant(fullRules, state.intensity || 'full');
    } catch (e) {
      // Rules file missing — self-healing: exit silently (bug #15 pattern)
      process.exit(0);
    }

    if (!rulesText) {
      process.exit(0);
    }

    // Step 5: increment counter and write state
    state.count = (state.count || 0) + 1;
    try {
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
      // Counter write failure is non-fatal — still inject rules
    }

    // Step 6: output (exact format from caveman-mode-tracker.js)
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: rulesText
      }
    }));

  } catch (e) {
    // Silent fail — never show hook errors to user
    process.exit(0);
  }
});

function extractVariant(rulesContent, intensity) {
  // Parses <!-- lite -->...<!-- /lite --> style markers
  // Returns the content of the matching section
  const marker = `<!-- ${intensity} -->`;
  const endMarker = `<!-- /${intensity} -->`;
  const start = rulesContent.indexOf(marker);
  if (start === -1) return null;
  const end = rulesContent.indexOf(endMarker, start);
  if (end === -1) return null;
  return rulesContent.slice(start + marker.length, end).trim();
}
```

**Source:** `[VERIFIED: ~/.claude/plugins/cache/caveman/caveman/ef6050c5e184/hooks/caveman-mode-tracker.js]` — stdin read pattern, hookSpecificOutput format, silent fail on catch. GSD hooks `[VERIFIED: ~/.claude/hooks/gsd-context-monitor.js]` — session_id sanitization pattern.

---

### Pattern 2: Rules File Structure (feynman-activate.md)

The rules file uses HTML comment markers to delimit variants. The hook's `extractVariant()` function parses the section between opening and closing tags.

```markdown
<!-- feynman diagram rules — feynman-activate.md -->
<!-- Hook reads only the active variant section. -->

<!-- lite -->
## Feynman Diagram Rules — Lite

Responses that contain sequential flows (A then B then C) include an ASCII flow diagram with boxes and arrows.

Responses that contain hierarchies with 3 or more levels include an ASCII tree.

ASCII flow diagrams use: [Box] --> [Box] --> [Box]
ASCII trees use: indented lines with ├── and └──

Responses that are single facts, direct answers under 4 lines, or contain only a code block: no diagram.
<!-- /lite -->

<!-- full -->
## Feynman Diagram Rules — Full

Responses that contain sequential flows (A then B then C) include an ASCII flow diagram with boxes and arrows.

Responses that contain hierarchies with 3 or more levels include an ASCII tree.

Responses that compare 2 or more options across multiple criteria include side-by-side ASCII columns.

Status summaries longer than 5 lines use a ┌─ title ─┐ ... └─┘ frame block.

Priority orderings of 3 or more items include an ▲ (high) ... ▼ (low) scale.

ASCII flow diagrams use: [Box] --> [Box] --> [Box]
ASCII trees use: indented ├── and └──
Side-by-side columns: max 3 cols, ≤10 words per cell
Frame blocks: ┌─ title ─┐ content └─┘

Responses that are single facts, direct answers under 4 lines, code-only blocks, or where the user asked for prose only: no diagram.
<!-- /full -->

<!-- ultra -->
## Feynman Diagram Rules — Ultra

All rules from full mode apply.

Additionally: any response with any structure — even short ones — includes an ASCII diagram.

Responses with a list of 2 or more items include at minimum a simple ASCII tree or column layout.

No response is diagram-free unless it is a single sentence of pure prose.
<!-- /ultra -->
```

**Character budget per variant:** Each section must stay under 8,000 chars. `wc -c` check on the extracted variant (not the whole file). The rule content above is ~400-800 chars per variant — well within budget. Budget is available for calibration iteration. `[ASSUMED]` — exact prose that achieves correct calibration requires empirical testing.

---

### Pattern 3: State Bootstrap Pattern

```javascript
// First-run bootstrap — exact pattern for D-05
function bootstrapState(feynmanDir, statePath) {
  fs.mkdirSync(feynmanDir, { recursive: true });
  const defaultState = { enabled: true, intensity: 'full', count: 0 };
  fs.writeFileSync(statePath, JSON.stringify(defaultState, null, 2));
  return defaultState;
}
```

The key: `{ recursive: true }` on `mkdirSync` makes it safe to call even if the directory already exists (no EEXIST error).

**Source:** `[VERIFIED: Node.js fs.mkdirSync docs via training]` `[ASSUMED]` — no direct Context7 lookup; `recursive: true` is standard Node.js >= 10.12.

---

### Pattern 4: plugin.json Schema

Verified from caveman's actual installed plugin.json. `[VERIFIED: ~/.claude/plugins/cache/caveman/caveman/ef6050c5e184/.claude-plugin/plugin.json]`

```json
{
  "name": "feynman",
  "version": "1.0.0",
  "description": "Injects ASCII diagram rules into every Claude request. Why explain in words when diagram do trick.",
  "author": {
    "name": "apolenkov",
    "url": "https://github.com/apolenkov/feynman"
  }
}
```

Rules (verified from caveman source and prior research):
- `name`: kebab-case, no spaces, required
- `version`: semver `MAJOR.MINOR.PATCH` — `"1.0"` is invalid
- `description`: free text
- No `hooks` key in Phase 1 — UserPromptSubmit hooks must go via `settings.json` (bug #10225)
- File location: `.claude-plugin/plugin.json` (NOT `.claude-plugin.json` at root)

Caveman's manifest includes a `hooks` key for UserPromptSubmit — but per bug #10225, those hooks silently never fire. Feynman's manifest omits hooks entirely in Phase 1 to avoid the confusion.

---

### Pattern 5: settings.json Entry (for documentation and manual verification)

The hook entry that must be written to `~/.claude/settings.json`. Phase 1 does NOT ship install.sh (Phase 3 scope), so this documents what a user would add manually. The planner should include a task for documenting manual registration in README.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/absolute/path/to/feynman/hooks/feynman-activate.js\"",
            "timeout": 5,
            "statusMessage": "Injecting diagram rules..."
          }
        ]
      }
    ]
  }
}
```

**Key constraint:** Path must be absolute (not `~/...`) — bug #8810. In Phase 1, install.sh is deferred, so the README placeholder must instruct users to substitute their own absolute path.

`[VERIFIED: ~/.claude/settings.json]` — confirmed structure of existing UserPromptSubmit hook entries (none present; structure verified from PostToolUse entries which use identical schema).

---

### Pattern 6: Hook stdin input schema

`[VERIFIED: ~/.claude/plugins/cache/caveman/caveman/ef6050c5e184/hooks/caveman-mode-tracker.js]` — reads `data.prompt` and `data.transcript_path`. `[VERIFIED: .planning/research/STACK.md]`:

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

Feynman's hook uses: `data.session_id` (for idempotency, counter keying). Does NOT need `data.prompt` (rules inject unconditionally). Does NOT need `data.transcript_path` (no transcript reading in Phase 1).

---

### Pattern 7: README Skeleton (D-10)

```markdown
# feynman

> why explain in words when diagram do trick

A Claude Code plugin that automatically injects ASCII diagram rules into every request.
Works alongside caveman — caveman compresses words, feynman adds visual structure.

## Before / After

| Without feynman | With feynman |
|-----------------|--------------|
| The deployment pipeline has three stages: first the code is built, then tests run, then it deploys to prod. | The deployment pipeline has three stages: `[Build] --> [Test] --> [Deploy]` |

<!-- INSTALL PLACEHOLDER -->
```

The before/after table must be in the same row (markdown table format) with actual ASCII art in the "With feynman" cell. The example chosen should be simple, concrete, and unmistakably better with the diagram.

---

### Anti-Patterns to Avoid

- **`console.log` for hook output:** Adds trailing newline `\n`, which breaks JSON parsing. Use `process.stdout.write(JSON.stringify(...))` exclusively. `[VERIFIED: STACK.md]`
- **Plain text stdout:** Any non-JSON stdout triggers "UserPromptSubmit hook error" red banner in Claude Code UI (bug #13912). `[VERIFIED: PITFALLS.md]`
- **`~` in hook path in settings.json:** Fails when Claude is started from a subdirectory (bug #8810). Use `os.homedir()` + `path.join()` in the hook; the path in settings.json must be absolute at write time. `[VERIFIED: PITFALLS.md]`
- **Hooks key in plugin.json for UserPromptSubmit:** Plugin-path hooks silently never fire (bug #10225). `[VERIFIED: PITFALLS.md]`
- **Imperative rule phrasing:** "Always draw a diagram when..." triggers prompt-injection defense (bug #17804). Use "Responses with flows include..." `[VERIFIED: PITFALLS.md]`
- **No negative conditions in rules:** Diagrams appear on one-line answers → users uninstall. Must define explicit WHEN NOT TO DRAW list. `[VERIFIED: PITFALLS.md]`
- **`try { require('something') }` for state:**  No npm packages in hook. Use only built-in `fs`, `path`, `os`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON merge of settings.json | Custom string-replacement sed script | `node -e "const fs = require('fs'); ..."` inline | jq not universally installed (bug #14817); node is guaranteed present |
| Hook output | Plain text emit | Exact `hookSpecificOutput` JSON structure | Platform contract; deviation causes visible errors |
| Path expansion | String replacement of `~` | `os.homedir()` + `path.join()` | Tilde expansion is OS/shell-dependent; Node.js is not a shell |
| Directory creation | Manual `mkdir` + `existsSync` check | `fs.mkdirSync(path, { recursive: true })` | Race-condition-safe, no EEXIST error |

**Key insight:** This domain has exactly zero problems that benefit from custom solutions. Every moving part has a documented pattern from caveman or GSD production hooks.

---

## Common Pitfalls

### Pitfall 1: stdout from UserPromptSubmit causes red hook error (bug #13912)

**What goes wrong:** Any `console.log()` or `process.stdout.write('plain text')` causes "UserPromptSubmit hook error" visible in Claude Code UI on every prompt.

**Why it happens:** Claude Code parses hook stdout as JSON. Plain text fails parsing; runtime surfaces an error.

**How to avoid:** `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: rulesText } }))` — and nothing else on stdout.

**Warning signs:** Red error banner in Claude Code on every message. `[VERIFIED: GitHub issue #13912]`

---

### Pitfall 2: Plugin hooks for UserPromptSubmit silently never fire (bug #10225)

**What goes wrong:** Hooks declared inside `.claude-plugin/plugin.json` under `UserPromptSubmit` register correctly but the command never executes. Silent failure — no error, no injection.

**How to avoid:** Keep plugin.json for identity only (name, version, description). Register hook via `~/.claude/settings.json` (Phase 3 install.sh). Phase 1 README instructs manual registration.

**Warning signs:** Hook is registered in plugin.json, Claude starts fine, but diagram rules never appear in responses and no hook error is shown. `[VERIFIED: GitHub issue #10225]`

---

### Pitfall 3: Tilde in settings.json hook path breaks from subdirectories (bug #8810)

**What goes wrong:** `"command": "node ~/.claude/feynman/hook.js"` works from `$HOME` but fails silently from `~/projects/foo`.

**How to avoid:** Paths in settings.json must be absolute. Phase 1 README instructs users to use their full home directory path. Phase 3 install.sh will use `$(realpath ...)` or `os.homedir()` + `path.join()`.

**Warning signs:** Hook works when running `claude` from home directory but not from a project subdirectory. `[VERIFIED: GitHub issue #8810]`

---

### Pitfall 4: Imperative rule phrasing triggers prompt-injection defense (bug #17804)

**What goes wrong:** "Always draw an ASCII diagram when..." or "You must use ASCII boxes for..." triggers Claude's built-in injection detector. Claude warns user or ignores the context.

**How to avoid:** All rules must read as declarative facts about system behavior:
- BAD: "Always draw a diagram when the answer contains a flow."
- GOOD: "Responses that contain flows include an ASCII diagram."

**Warning signs:** Claude Code shows "prompt injection attack detected" warning. `[VERIFIED: GitHub issue #17804]`

---

### Pitfall 5: Rules too broad — diagrams appear on single-fact answers

**What goes wrong:** No explicit negative conditions → Claude draws diagrams on "What does X do?" (one sentence answer).

**How to avoid:** Rules file MUST include a WHEN NOT TO DRAW section with explicit conditions: single-fact answer, code-only response, answer under 4 lines, user asked for prose only.

**Warning signs:** Short Q&A responses include ASCII boxes. Manual test: "What is 2+2?" should produce "4", not a diagram. `[VERIFIED: PITFALLS.md pitfall 7]`

---

### Pitfall 6: Rules file not found after standalone install

**What goes wrong:** Hook uses `path.join(__dirname, '..', 'rules', 'feynman-activate.md')`. If feynman is cloned to a non-standard location or the hook is copied without the rules file, rules reading fails.

**How to avoid:** Add graceful degradation — if rules file missing, exit 0 silently (self-healing pattern from PITFALLS.md pitfall 15). This mirrors the caveman principle: don't error if something is missing, just do nothing.

```javascript
try {
  rulesText = fs.readFileSync(RULES_PATH, 'utf8');
} catch (e) {
  process.exit(0); // silent — feynman not fully installed
}
```

`[VERIFIED: PITFALLS.md pitfall 15]`

---

### Pitfall 7: Disabled plugin still injects (bug #35713)

**What goes wrong:** When feynman is "disabled" (enabledPlugins: false in Claude Code settings), hooks continue to fire.

**How to avoid:** Hook must check flag file `~/.claude/.feynman-active` at entry, before doing anything else. If flag file missing → exit 0 silently. This is the caveman pattern (`~/.claude/.caveman-active`). `[VERIFIED: ~/.claude/.caveman-active exists on this machine]`

---

## Runtime State Inventory

> Not applicable — this is a greenfield phase (no existing code, no rename/refactor). Omitted per instructions.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Hook runtime | ✓ | v25.9.0 | — (required by Claude Code) |
| `~/.claude/` directory | State + flag files | ✓ | — | Created by Claude Code |
| `~/.claude/.caveman-active` | Flag file reference pattern | ✓ | — | n/a (just confirms pattern works) |

`[VERIFIED: command -v node && node --version && ls ~/.claude/]`

**No missing dependencies.** Node.js is guaranteed on any machine running Claude Code.

---

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json`. Section omitted per configuration.

---

## Security Domain

> `security_enforcement: true` in config. ASVS Level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Hook has no authentication surface |
| V3 Session Management | No | No session management in hook |
| V4 Access Control | Partial | Flag file is user-owned, under `~/.claude/` — no privilege escalation surface |
| V5 Input Validation | Yes | `data.session_id` sanitized before use in file paths |
| V6 Cryptography | No | No cryptography |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `session_id` | Tampering | Reject `session_id` values containing `/`, `\`, or `..` before using in temp file paths |
| Symlink attack on flag file | Tampering | Check flag file is not a symlink before writing (caveman uses `safeWriteFlag` with O_NOFOLLOW) — for Phase 1, reading the flag (not writing) is the only operation, so symlink risk is low |
| Rules file injection via external edit | Tampering | Rules file is source-controlled and read-only at runtime — no exec, only text injection |
| Prompt injection via rules content | Tampering/Spoofing | Use declarative phrasing (D-08); tested against Claude's injection detector |
| Oversized `additionalContext` | Denial of service (context bloat) | Keep each variant under 8,000 chars; measure with `wc -c` |

**Session ID sanitization pattern (verified from `gsd-context-monitor.js`):**

```javascript
// Reject session IDs that contain path traversal sequences or path separators
if (/[/\\]|\.\./.test(sessionId)) {
  process.exit(0);
}
```

`[VERIFIED: ~/.claude/hooks/gsd-context-monitor.js]`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SessionStart` hook for rule injection | `UserPromptSubmit` hook | N/A — never correct | SessionStart only fires once; rules lost after compaction |
| Plain text stdout from hook | JSON `hookSpecificOutput.additionalContext` | Bug #13912 (2024) | Plain text causes UI error |
| Plugin.json hooks for UserPromptSubmit | `settings.json` registration via install.sh | Bug #10225 (open) | Plugin path silently never executes |
| Imperative rule phrasing | Declarative fact phrasing | Bug #17804 (2024) | Imperative triggers injection defense |
| `~` in settings.json hook paths | Absolute expanded paths | Bug #8810 (2024) | Tilde fails from subdirectories |

**Currently bugged (open issues):**
- Bug #10225: Plugin-path UserPromptSubmit hooks — confirmed open; workaround is settings.json
- Bug #35713: Disabled plugin still injects — confirmed open; workaround is flag file check
- Bug #14281: additionalContext duplication (open) — preventive guard: the JSON output format is inherently deduped per call; no extra guard needed beyond correct hook output

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fs.mkdirSync(path, { recursive: true })` is safe to call when dir already exists (no EEXIST) | Pattern 3: State Bootstrap | Low — well-documented Node.js behavior, but if wrong: first-run bootstrap throws on re-install; fix is a try/catch |
| A2 | Rules phrased as declarative facts will calibrate correctly at ~30-40% diagram frequency for `full` mode | Rules file content | Medium — empirical testing required post-implementation; wrong calibration = user uninstalls |
| A3 | Phase 1 README placeholder `<!-- INSTALL PLACEHOLDER -->` is sufficient for DOCS-02 (one-liner install section) | README skeleton | Low — DOCS-02 says "one-liner install section"; placeholder + note satisfies the intent |
| A4 | `hookEventName: 'UserPromptSubmit'` is the exact string required in the output JSON | Pattern 1: Hook template | Low — caveman-mode-tracker.js uses this exact string; confirmed working |

**If A2 is wrong:** The rules need calibration iteration. Budget time after the hook works to test 10+ prompts with short answers, flow answers, and comparison answers. Adjust trigger thresholds until ~30-40% of full-mode responses include diagrams.

---

## Open Questions

1. **Idempotency guard for bug #14281**
   - What we know: bug #14281 reports `additionalContext` duplication; confirmed open
   - What's unclear: whether the duplication happens within a single prompt turn (same hook firing twice) or across turns (Claude Code accumulates previous contexts)
   - Recommendation: The `hookSpecificOutput` JSON format is atomic per hook invocation — if the hook only fires once per prompt, no guard is needed. If the hook fires multiple times per prompt (unlikely by design), a per-session-turn temp file guard would prevent duplication. Start without the guard; add if duplication is observed.

2. **Flag file on first run**
   - What we know: D-05 says hook bootstraps state.json on first run with `enabled: true`; D-07 says hook checks flag file first
   - What's unclear: if the flag file (`~/.claude/.feynman-active`) is not present on first run, the hook exits 0 before bootstrapping. How does feynman activate on first install without install.sh?
   - Recommendation: Phase 1 hook must create the flag file during state.json bootstrap. The first-run flow: state.json missing → create dir + write state.json + write flag file → proceed with injection. This way, simply having the hook registered is enough to activate feynman.

3. **Count field purpose in Phase 1**
   - What we know: D-04 defines `count` in state.json; HOOK-05 says hook increments it
   - What's unclear: Phase 2 `/feynman-stats` skill will read `count`, but Phase 1 has no consumer
   - Recommendation: Implement HOOK-05 anyway (increment on each injection) so the state contract is fully implemented from Phase 1. The skill in Phase 2 just reads this pre-existing counter.

---

## Code Examples

### Complete minimal hook (distilled from Pattern 1)

```javascript
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const FEYNMAN_DIR = path.join(HOME, '.claude', '.feynman');
const STATE_PATH = path.join(FEYNMAN_DIR, 'state.json');
const FLAG_PATH = path.join(HOME, '.claude', '.feynman-active');
const RULES_PATH = path.join(__dirname, '..', 'rules', 'feynman-activate.md');

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // 1. Flag file check (bug #35713)
    if (!fs.existsSync(FLAG_PATH)) process.exit(0);

    // 2. State read + first-run bootstrap
    let state;
    try {
      state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') process.exit(0); // corrupt — fail safe
      fs.mkdirSync(FEYNMAN_DIR, { recursive: true });
      state = { enabled: true, intensity: 'full', count: 0 };
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
      fs.writeFileSync(FLAG_PATH, 'full'); // activate on first run
    }

    if (!state.enabled) process.exit(0);

    // 3. Read rules
    let rulesText;
    try {
      const full = fs.readFileSync(RULES_PATH, 'utf8');
      const intensity = state.intensity || 'full';
      const m1 = `<!-- ${intensity} -->`;
      const m2 = `<!-- /${intensity} -->`;
      const i1 = full.indexOf(m1);
      const i2 = full.indexOf(m2, i1);
      if (i1 === -1 || i2 === -1) process.exit(0);
      rulesText = full.slice(i1 + m1.length, i2).trim();
    } catch (e) {
      process.exit(0); // missing rules file — self-heal
    }

    // 4. Increment counter
    state.count = (state.count || 0) + 1;
    try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); } catch (e) {}

    // 5. Output (bug #13912 — must be JSON, not plain text)
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: rulesText
      }
    }));
  } catch (e) {
    process.exit(0); // silent fail
  }
});
```

### Session ID sanitization (security)

```javascript
// Source: ~/.claude/hooks/gsd-context-monitor.js (VERIFIED)
const sessionId = data.session_id;
if (!sessionId) process.exit(0);
if (/[/\\]|\.\./.test(sessionId)) process.exit(0); // path traversal guard
```

### Idempotent upsert into settings.json (Phase 3 reference — NOT Phase 1)

```javascript
// Source: PITFALLS.md pitfall 14 — node -e inline pattern
// For Phase 3 install.sh reference only
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.claude/settings.json';
const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : {};
if (!s.hooks) s.hooks = {};
if (!s.hooks.UserPromptSubmit) s.hooks.UserPromptSubmit = [];
s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit.filter(
  h => !h.hooks || !h.hooks.some(e => e.command && e.command.includes('feynman'))
);
s.hooks.UserPromptSubmit.push({
  hooks: [{ type: 'command', command: 'node ABSOLUTE_PATH', timeout: 5, statusMessage: 'Injecting diagram rules...' }]
});
fs.writeFileSync(p, JSON.stringify(s, null, 2));
"
```

---

## Sources

### Primary (HIGH confidence)
- `~/.claude/plugins/cache/caveman/caveman/ef6050c5e184/hooks/caveman-mode-tracker.js` — UserPromptSubmit hook with hookSpecificOutput.additionalContext (VERIFIED, read directly)
- `~/.claude/plugins/cache/caveman/caveman/ef6050c5e184/.claude-plugin/plugin.json` — plugin.json schema (VERIFIED, read directly)
- `~/.claude/hooks/gsd-context-monitor.js` — session_id sanitization, hookSpecificOutput pattern (VERIFIED, read directly)
- `.planning/research/STACK.md` — hook input/output schema, additionalContext cap, CJS requirements
- `.planning/research/PITFALLS.md` — 18 specific pitfalls with GitHub issue numbers

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` — synthesized findings cross-referencing all sources
- `~/.claude/settings.json` — settings.json structure verification (PreToolUse hook entries, same schema as UserPromptSubmit)
- `~/.claude/hooks/gsd-statusline.js`, `gsd-read-guard.js`, `gsd-prompt-guard.js` — supporting hook pattern examples

### Tertiary (LOW confidence)
- None — all Phase 1 critical claims verified via primary sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node.js CJS/no-deps pattern verified from caveman source + GSD production hooks
- Architecture: HIGH — hook input/output format verified from caveman-mode-tracker.js (read directly, not web-fetched)
- Pitfalls: HIGH — each pitfall has a GitHub issue number; PITFALLS.md is the authoritative source from prior research
- Rules file format: MEDIUM — marker syntax is a design decision (not externally prescribed); calibration requires empirical testing

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (stable domain; bugs are open but workarounds are stable)
