# Privacy

feynman is a local-only Codex plugin. The installed hook and CLI do not
collect, store, or transmit prompt content, response content, analytics, or
telemetry, and they make no runtime network requests.

When a user asks to read or change Feynman state, the native skill invokes only
an already installed local `feynman` executable from `PATH` or an absolute
executable path supplied by the user. It does not use a remote package runner,
download, install, or update packages. Optional CLI setup is a separate action.

## Local data

The Codex hook reads its packaged rules and the following user-owned files:

| Path | Purpose |
|---|---|
| `~/.codex/.feynman/state.json` | enabled state, Intensity, style, local counter |
| `~/.codex/.feynman-active` | active flag and current Intensity |

The `injections` counter never leaves the machine. `feynman lint <file>` reads
only the file explicitly passed to it.

Uninstall removes feynman's hook registration and active flag while preserving
`state.json`; it does not alter unrelated Codex settings.

For security reports, see [SECURITY.md](SECURITY.md).

Last reviewed: 2026-09-08
