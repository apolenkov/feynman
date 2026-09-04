# Configure the optional Feynman hook

These preferences control the optional SessionStart hook installed through the
CLI. They do not change standalone skill instructions. Explain this distinction
when a user expects a setting to affect a plugin-only installation.

Run a state command only when the user asks to inspect or change Feynman settings,
or invokes bare `/feynman` without an explanation task. An explanation request
must not run `npx`, install a package, or read/change user state.

For an explicit state operation, use the CLI through `npx`;
never write `~/.codex/.feynman/state.json` or `.feynman-active` manually:

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
