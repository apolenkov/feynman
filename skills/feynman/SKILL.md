---
name: feynman
disable-model-invocation: true
description: >
  Manage feynman ASCII diagram injection. Toggle on/off, set intensity (lite/full/ultra),
  view stats, and run maintenance: bump version + tag + push, apply highlight conventions
  to rules, inspect eval iteration history. Use when user says /feynman, /feynman on/start,
  /feynman off/stop, /feynman lite/full/ultra, /feynman status, /feynman bump <version>,
  /feynman highlight, /feynman eval.
---

Manage feynman diagram injection. Read current state, apply requested change, report result.

## When invoked

Parse `$ARGUMENTS`:

State commands (work on local install, no repo writes):
  - `on`, `start` — enable feynman, keep current intensity
  - `off`, `stop` — disable feynman
  - `lite` — enable at lite intensity (flows + trees only)
  - `full` — enable at full intensity (all diagram types)
  - `ultra` — enable at ultra intensity (force diagram always)
  - `style short|middle|full` — set output_style preset (orthogonal to
    intensity). `short` = inline glyphs + dot-leader only; `middle` =
    frames only for ≥6 items, prefer trees + markdown tables; `full` =
    default (all visuals allowed). The hook reads this and appends a
    one-line suffix to additionalContext when style ≠ full; no rules-file
    bytes are added.
  - no argument or `status` — show current state, no changes

Maintenance commands (work on the repo, expect to be invoked from project root):
  - `bump <version>` or `bump patch|minor|major` — version bump in 3 manifests +
    changelog regen + tests + commit + tag + push. Stops short of `npm publish`
    (2FA gate). Refuses to run on dirty tree or non-`main` branch.
  - `highlight` — apply highlight convention markers (`**bold** keys; ▲▼ priority;
    ✓✗ status`) to all 3 `<contract>` blocks in `rules/feynman-activate.md`.
    Idempotent. Verifies the 4480-byte budget after the edit and reverts if tests fail.
  - `eval` — show eval iteration history (location of `feynman-rules-workspace/`,
    latest findings file, summary of WIN/NEUTRAL/HURT counts if available).
    Does NOT launch a new run — that's a separate orchestrated workflow.

## Steps

1. Read current state:

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
function clientHome() {
  if (process.env.FEYNMAN_HOME) return process.env.FEYNMAN_HOME;
  if (process.env.FEYNMAN_TARGET === 'opencode') return path.join(os.homedir(), '.config', 'opencode');
  if (process.env.FEYNMAN_TARGET === 'codex') return path.join(os.homedir(), '.codex');
  if (process.env.FEYNMAN_TARGET === 'claude') return path.join(os.homedir(), '.claude');
  if (process.env.CODEX_HOME) return process.env.CODEX_HOME;
  if (process.env.CODEX_THREAD_ID || process.env.CODEX_SANDBOX) return path.join(os.homedir(), '.codex');
  if (process.env.CLAUDE_CONFIG_DIR) return process.env.CLAUDE_CONFIG_DIR;
  return path.join(os.homedir(), '.claude');
}
const root = clientHome();
const stateFile = path.join(root, '.feynman', 'state.json');
const flagFile  = path.join(root, '.feynman-active');
let st = {enabled: true, intensity: 'full', output_style: 'full', injections: 0};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch(e) {}
const styleDisplay = st.output_style || 'full';
console.log('target:', path.basename(root), '| enabled:', st.enabled, '| intensity:', st.intensity, '| output_style:', styleDisplay, '| injections:', (st.injections ?? st.count ?? 0), '| flag:', fs.existsSync(flagFile));
"
```

2. Apply change (skip if no argument or `status`):

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
function clientHome() {
  if (process.env.FEYNMAN_HOME) return process.env.FEYNMAN_HOME;
  if (process.env.FEYNMAN_TARGET === 'opencode') return path.join(os.homedir(), '.config', 'opencode');
  if (process.env.FEYNMAN_TARGET === 'codex') return path.join(os.homedir(), '.codex');
  if (process.env.FEYNMAN_TARGET === 'claude') return path.join(os.homedir(), '.claude');
  if (process.env.CODEX_HOME) return process.env.CODEX_HOME;
  if (process.env.CODEX_THREAD_ID || process.env.CODEX_SANDBOX) return path.join(os.homedir(), '.codex');
  if (process.env.CLAUDE_CONFIG_DIR) return process.env.CLAUDE_CONFIG_DIR;
  return path.join(os.homedir(), '.claude');
}
const root = clientHome();
const stateFile = path.join(root, '.feynman', 'state.json');
const flagFile  = path.join(root, '.feynman-active');
const arg = (process.argv[1] || '').trim().toLowerCase();
const normalized = arg === 'start' ? 'on' : arg === 'stop' ? 'off' : arg;
let st = {enabled: false, intensity: 'full', output_style: 'full', injections: 0};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch(e) {}
// Back-compat: pre-Phase-10 state.json files lack output_style.
if (!st.output_style) st.output_style = 'full';
function writeFlag(value) { fs.mkdirSync(root, {recursive: true}); fs.writeFileSync(flagFile, value || 'full'); }
if (normalized === 'on')  { st.enabled = true;  writeFlag(st.intensity); }
if (normalized === 'off') { st.enabled = false; try { fs.unlinkSync(flagFile); } catch(e) {} }
if (['lite','full','ultra'].includes(normalized)) { st.intensity = normalized; st.enabled = true; writeFlag(normalized); }
// Phase 10 STYLE-02: 'style <preset>' subcommand.
const styleMatch = normalized.match(/^style\s+(short|middle|full)$/);
if (styleMatch) { st.output_style = styleMatch[1]; }
fs.mkdirSync(path.dirname(stateFile), {recursive: true});
fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
console.log(JSON.stringify({target: path.basename(root), ...st}));
" "$ARGUMENTS"
```

2b. Re-sync OpenCode `rules.md` if the OpenCode target is installed (the file only exists
for opencode — absent for claude/codex, so this step is a no-op for those targets):

```bash
[ -f "$HOME/.config/opencode/.feynman/rules.md" ] && \
  feynman install --target opencode > /dev/null 2>&1 || true
```

3. Report result:

```
target       claude / codex / opencode
status       on / off
intensity    lite / full / ultra      (controls rules-file size)
output_style short / middle / full    (controls visual verbosity, orthogonal)
injections   N total
```

Two axes — `intensity` controls how much instruction the model sees;
`output_style` controls how heavy the model's visuals can be. Pick
`full + middle` for the proposed sane default; `lite + short` for
mobile / dense chat.

## Maintenance dispatcher

If `$ARGUMENTS` starts with `bump`, `highlight`, or `eval`, route to the
matching repo script instead of the state-toggle path above.

### bump

```bash
# arg passes through to scripts/feynman-bump.js: <version> | patch | minor | major
node scripts/feynman-bump.js ${ARGUMENTS_REST:-patch}
```

Report what landed (commit sha, tag) and the next manual step
(`npm publish --access public --ignore-scripts` — needs 2FA OTP).

### highlight

```bash
node scripts/feynman-highlight.js
```

The script is idempotent (re-run is a no-op) and refuses to write if the rules
file would exceed the 4480-byte budget. After applying, it runs `npm test` to
confirm nothing breaks. Use `--dry-run` to preview, `--revert` to remove.

### eval

```bash
ls -1d feynman-rules-workspace/iteration-* 2>/dev/null | tail -3
ls -1 .planning/notes/eval-iteration-*-findings-*.md 2>/dev/null | tail -3
```

Report locations and let the user decide whether to launch a new run via the
GSD orchestrator (`/gsd-execute-phase` or `/gsd-quick`) — this skill does not
spawn subagents on its own.
