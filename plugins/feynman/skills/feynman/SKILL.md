---
name: feynman
description: >
  Create or configure concise visual explanations in Codex. Use for /feynman,
  ASCII diagrams, visual architecture, flows, trees, comparisons, priorities,
  status summaries, diagram intensity, or output style.
---

Use the smallest concise visual that materially clarifies structure: flows,
hierarchies, comparisons, priorities, and status summaries. Keep prose as prose
when no visual improves comprehension.

When invoked, delegate every state read or change to the installed Feynman CLI
through `npx`; never write `~/.codex/.feynman/state.json` or
`.feynman-active` manually:

- `status` or no argument — show the current state;
- `on` / `off` — enable or disable diagram assistance;
- `lite` / `full` / `ultra` — set diagram intensity;
- `style short|middle|full` — set the output-style preset.

Use these commands exactly:

```text
npx -y @albinocrabs/feynman@latest state [status|on|off|start|stop|lite|full|ultra]
npx -y @albinocrabs/feynman@latest state style short|middle|full
```

`npx -y @albinocrabs/feynman@latest status` is also accepted as a status
alias. Run `npx -y @albinocrabs/feynman@latest --help` when the syntax is
unclear.

Do not edit project files, commit, tag, push, publish, or change credentials
unless the user asks for that specific action.
