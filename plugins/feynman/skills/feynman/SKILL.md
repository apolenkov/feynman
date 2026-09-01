---
name: feynman
disable-model-invocation: true
description: >
  Manage readable ASCII diagrams in Codex answers. Use when the user asks for
  /feynman, diagram rules, visual architecture, ASCII comparisons, or status.
---

Use concise ASCII diagrams when they materially clarify structure: flows,
hierarchies, comparisons, priorities, and status summaries.

When invoked with `$ARGUMENTS`, delegate state changes to the installed Feynman
CLI and report the result:

- `status` or no argument — show the current state;
- `on` / `off` — enable or disable diagram assistance;
- `lite` / `full` / `ultra` — set diagram intensity;
- `style short|middle|full` — set the output-style preset.

Run `feynman --help` when the command syntax is unclear. Do not edit project
files, commit, tag, push, publish, or change credentials unless the user asks
for that specific action.
