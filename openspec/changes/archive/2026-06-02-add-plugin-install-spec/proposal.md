> **DRAFT — pending review**

## Why

The `plugin-install` capability — `feynman install`, `doctor`, and `uninstall` — shipped in the
current codebase with no recorded OpenSpec contract. `bin/feynman.ts` contains the full implementation
(three subcommands, multiple targets, IDE-compat outputs, state bootstrapping) but that behavior is
only documented in help text, not as a checkable spec. This change records it as a first-class
capability so regressions are caught by the doc-drift guard and future changes have a written
baseline to diff against.

## What Changes

- Add the `plugin-install` capability spec: the three subcommands (`install`, `doctor`, `uninstall`),
  their target system (`claude | codex | both` and IDE targets `cline | cursor`), the filesystem
  artifacts each subcommand creates or checks, the Intensity default for IDE installs (`full`), and
  the zero-runtime-deps constraint (ADR 0001).
- No behavior change. This is documentation of shipped behavior as an OpenSpec contract.

## Non-goals

- No change to `bin/feynman.ts`, `install.sh`, or any hook script.
- Not specifying `opencode`, `windsurf`, `all`, or `*` targets in this pass — they exist in source
  but are outside the scoped baseline. Tracked in tasks as a follow-up.
- Not re-litigating toolchain decisions — ADR 0001 is the source of truth; this spec cross-references
  it, does not duplicate it.

## Capabilities

### Added Capabilities

- `plugin-install`: the `install`, `doctor`, and `uninstall` subcommands for targets `claude`,
  `codex`, `both`, plus IDE targets `cline` and `cursor`.

## Impact

- New: `openspec/specs/plugin-install/` (on archive).
- Source of truth grounding: `bin/feynman.ts`, `install.sh`, `docs/adr/0001-*.md`.
- No changes to existing files outside this change directory.
