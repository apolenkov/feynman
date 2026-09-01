# Privacy

feynman is a local-only Codex plugin. The installed hook and CLI do not
collect, store, or transmit prompt content, response content, analytics, or
telemetry, and they make no runtime network requests.

The native skill resolves its CLI through an explicit `npx` command only when a
user asks to read or change Feynman state. If the package is not cached, npm may
contact the configured registry to download the public package. That operation
sends no Codex prompt or response content and is not telemetry.

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

Last reviewed: 2026-09-01
