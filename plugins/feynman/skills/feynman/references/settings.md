# Configure the optional Feynman hook

These preferences control the optional SessionStart hook installed through the
CLI. They do not change standalone skill instructions. Explain this distinction
when a user expects a setting to affect a plugin-only installation.

Run a state command only when the user asks to inspect or change Feynman settings,
or invokes bare `/feynman` without an explanation task. An explanation request
must not run a CLI, install a package, or read/change user state.

For an explicit state operation, invoke an already installed local CLI. Use
`feynman` when it resolves from `PATH`, or use an absolute executable path only
when the user provided that path. Never use `npx`, `npm exec`, or another remote
package runner, and never download, install, or update the CLI as a side effect.
Never write `~/.codex/.feynman/state.json` or `.feynman-active` manually:

- `status` or no argument — show the current state;
- `on` / `off` — enable or disable diagram assistance;
- `lite` / `full` / `ultra` — set diagram intensity;
- `style short|middle|full` — set the output-style preset.

Use these commands exactly:

```text
feynman state [status|on|off|start|stop|lite|full|ultra]
feynman state style short|middle|full
```

`feynman status` is also accepted as a status alias. Run `feynman --help` when
the syntax is unclear. Substitute the user-provided absolute executable path
for `feynman` in these commands when applicable.

If no local executable is available, explain that the optional CLI must be set
up separately and stop the state operation. You may show the pinned setup
command from the project README, but do not run it unless the user separately
asks to install the CLI. Treat upgrades as a separate explicit action.

Do not edit project files, commit, tag, push, publish, or change credentials
unless the user asks for that specific action.
