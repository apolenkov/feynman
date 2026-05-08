---
name: feynman
disable-model-invocation: true
description: >
  Toggle ASCII diagram injection on/off or set intensity level (lite/full/ultra).
  Use when user says /feynman, /feynman on/start, /feynman off/stop,
  /feynman lite/full/ultra, /feynman status.
---

Manage feynman diagram injection. Read current state, apply requested change, report result.

## When invoked

Parse `$ARGUMENTS`:
  - `on`, `start` — enable feynman, keep current intensity
  - `off`, `stop` — disable feynman
- `lite` — enable at lite intensity (flows + trees only)
- `full` — enable at full intensity (all diagram types)
- `ultra` — enable at ultra intensity (force diagram always)
- no argument or `status` — show current state, no changes

## Steps

1. Read current state:

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
function clientHome() {
  if (process.env.FEYNMAN_HOME) return process.env.FEYNMAN_HOME;
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
let st = {enabled: true, intensity: 'full', injections: 0};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch(e) {}
console.log('target:', path.basename(root), '| enabled:', st.enabled, '| intensity:', st.intensity, '| injections:', (st.injections ?? st.count ?? 0), '| flag:', fs.existsSync(flagFile));
"
```

2. Apply change (skip if no argument or `status`):

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
function clientHome() {
  if (process.env.FEYNMAN_HOME) return process.env.FEYNMAN_HOME;
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
let st = {enabled: false, intensity: 'full', injections: 0};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch(e) {}
function writeFlag(value) { fs.mkdirSync(root, {recursive: true}); fs.writeFileSync(flagFile, value || 'full'); }
if (normalized === 'on')  { st.enabled = true;  writeFlag(st.intensity); }
if (normalized === 'off') { st.enabled = false; try { fs.unlinkSync(flagFile); } catch(e) {} }
if (['lite','full','ultra'].includes(normalized)) { st.intensity = normalized; st.enabled = true; writeFlag(normalized); }
fs.mkdirSync(path.dirname(stateFile), {recursive: true});
fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
console.log(JSON.stringify({target: path.basename(root), ...st}));
" "$ARGUMENTS"
```

3. Report result:

```
┌─ feynman ───────────────────────────┐
  status     on / off
  intensity  lite / full / ultra
  injections N total
└────────────────────────────────────┘
```
