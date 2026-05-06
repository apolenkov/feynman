---
name: feynman-stats
description: >
  Show feynman diagram injection statistics.
  Triggers on /feynman-stats.
---

Read and display feynman stats from the state file.

## Steps

1. Run:

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const stateFile = path.join(os.homedir(), '.claude', '.feynman', 'state.json');
const flagFile  = path.join(os.homedir(), '.claude', '.feynman-active');
let st = {enabled: false, intensity: 'full', count: 0};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch(e) {}
console.log('enabled:', st.enabled);
console.log('intensity:', st.intensity);
console.log('diagrams injected:', st.count);
console.log('flag file:', fs.existsSync(flagFile) ? 'present' : 'absent');
"
```

2. Display as a status frame:

```
┌─ feynman stats ─────────────────────┐
  status      on / off
  intensity   lite / full / ultra
  diagrams    N rules injected total
└────────────────────────────────────┘
```

Count reflects total rule injections since feynman was first installed. Resets if `~/.claude/.feynman/state.json` is deleted.
