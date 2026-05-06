---
name: feynman
disable-model-invocation: true
description: >
  Toggle ASCII diagram injection on/off or set intensity level (lite/full/ultra).
  Use when user says /feynman, /feynman on, /feynman off, /feynman lite/full/ultra, /feynman status.
---

Manage feynman diagram injection. Read current state, apply requested change, report result.

## When invoked

Parse `$ARGUMENTS`:
- `on` — enable feynman, keep current intensity
- `off` — disable feynman
- `lite` — enable at lite intensity (flows + trees only)
- `full` — enable at full intensity (all diagram types)
- `ultra` — enable at ultra intensity (force diagram always)
- no argument or `status` — show current state, no changes

## Steps

1. Read current state:

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const stateFile = path.join(os.homedir(), '.claude', '.feynman', 'state.json');
const flagFile  = path.join(os.homedir(), '.claude', '.feynman-active');
let st = {enabled: false, intensity: 'full', injections: 0};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch(e) {}
console.log('enabled:', st.enabled, '| intensity:', st.intensity, '| injections:', (st.injections ?? st.count ?? 0), '| flag:', fs.existsSync(flagFile));
"
```

2. Apply change (skip if no argument or `status`):

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const stateFile = path.join(os.homedir(), '.claude', '.feynman', 'state.json');
const flagFile  = path.join(os.homedir(), '.claude', '.feynman-active');
const arg = process.argv[1] || '';
let st = {enabled: true, intensity: 'full', injections: 0};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch(e) {}
if (arg === 'on')  { st.enabled = true;  fs.writeFileSync(flagFile, st.intensity); }
if (arg === 'off') { st.enabled = false; try { fs.unlinkSync(flagFile); } catch(e) {} }
if (['lite','full','ultra'].includes(arg)) { st.intensity = arg; st.enabled = true; fs.writeFileSync(flagFile, arg); }
fs.mkdirSync(path.dirname(stateFile), {recursive: true});
fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
console.log(JSON.stringify(st));
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
