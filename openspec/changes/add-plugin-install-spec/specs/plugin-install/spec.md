## ADDED Requirements

### Requirement: Node baseline gate enforced before install

The CLI SHALL refuse to run on Node.js older than 22.6 and SHALL exit with a non-zero status
and a human-readable error message.

#### Scenario: Node version too old

- **WHEN** `install.sh` is run with a Node.js version below 22.6
- **THEN** the script exits with status 1 and prints "Node.js >=22.6 required"

#### Scenario: Node not found

- **WHEN** `install.sh` is run and the `node` binary is not on PATH
- **THEN** the script exits with status 1 and prints "node not found"

### Requirement: install writes a SessionStart hook entry into the target settings file

The `install` subcommand SHALL register a `SessionStart` hook entry in the target's settings
file and SHALL bootstrap a `state.json` with `{ enabled: true, intensity: "full" }` if one does
not already exist.

#### Scenario: First install for claude target

- **WHEN** `feynman install --target claude` runs and no feynman hook is registered
- **THEN** `~/.claude/settings.json` gains a `SessionStart` hook group with a command referencing
  `feynman-session-start` and `~/.claude/.feynman/state.json` is created with `enabled: true`

#### Scenario: First install for codex target

- **WHEN** `feynman install --target codex` runs and no feynman hook is registered
- **THEN** `~/.codex/hooks.json` gains a `SessionStart` hook group with a command referencing
  `feynman-session-start` and `~/.codex/.feynman/state.json` is created with `enabled: true`

#### Scenario: both target installs into claude and codex

- **WHEN** `feynman install --target both` runs
- **THEN** the install is performed for both `claude` and `codex` targets in sequence

#### Scenario: Idempotent re-install without --force

- **WHEN** `feynman install` runs and a feynman `SessionStart` hook is already registered
- **THEN** the settings file is not modified and the CLI exits 0

#### Scenario: --force re-registers the hook

- **WHEN** `feynman install --force` runs and a feynman hook is already registered
- **THEN** existing feynman hook entries are removed and a new `SessionStart` entry is registered

#### Scenario: default target is codex

- **WHEN** `feynman install` runs with no `--target` flag
- **THEN** the install targets `codex`

### Requirement: install creates the .feynman-active flag reflecting enabled state

The `install` subcommand SHALL write the `.feynman-active` flag file in the target's root
directory when `state.json` reports `enabled: true`, and SHALL omit the flag when `enabled: false`.

#### Scenario: Flag written on enabled install

- **WHEN** `feynman install` completes and state is enabled
- **THEN** `~/.claude/.feynman-active` (or `~/.codex/.feynman-active`) exists and contains
  the Intensity string

#### Scenario: Flag absent when state is disabled

- **WHEN** `state.json` has `enabled: false` and install is re-run
- **THEN** no `.feynman-active` flag is written

### Requirement: install for IDE targets writes a project-local rules file

The `install` subcommand for IDE targets SHALL write a rules file to the project-local
directory defined for that IDE, containing the `full` Intensity rule block extracted from
`rules/feynman-activate.md`.

#### Scenario: cline install

- **WHEN** `feynman install --target cline` runs in a project directory
- **THEN** `.clinerules/feynman-rules.md` is created (or overwritten) with the `full` Intensity
  rule content and no YAML frontmatter

#### Scenario: cursor install

- **WHEN** `feynman install --target cursor` runs in a project directory
- **THEN** `.cursor/rules/feynman.mdc` is created (or overwritten) with YAML frontmatter
  `description`, `alwaysApply: true`, and `globs: "**"` prepended to the `full` Intensity rule
  content

#### Scenario: IDE install does not write to HOME

- **WHEN** any IDE target install runs
- **THEN** no files are written under `~/.claude/` or `~/.codex/`

### Requirement: doctor for hook targets reports health and always exits 0

The `doctor` subcommand for hook targets (`claude`, `codex`) SHALL check whether the
`SessionStart` hook is registered, the hook script file is readable, `state.json` is valid,
and the `.feynman-active` flag matches the enabled state, then SHALL print a status report
and SHALL exit 0 (advisory-only, never blocks).

#### Scenario: All checks pass

- **WHEN** `feynman doctor --target claude` runs on a healthy install
- **THEN** all items show `[OK]` and the output ends with "Status: OK"

#### Scenario: Missing hook registration

- **WHEN** `feynman doctor` runs and no feynman `SessionStart` hook is registered
- **THEN** the hook registration check shows `[FAIL]` and the CLI still exits 0

### Requirement: doctor for IDE targets checks the rules file and exits non-zero on failure

The `doctor` subcommand for IDE targets (`cline`, `cursor`) SHALL check whether the
project-local rules file exists, and for `cursor` SHALL also verify that frontmatter contains
`alwaysApply: true`. On failure it SHALL exit 1; on success it SHALL exit 0.

#### Scenario: IDE rules file present and valid

- **WHEN** `feynman doctor --target cline` runs and `.clinerules/feynman-rules.md` exists
- **THEN** the output shows `[OK]` with the file path and byte count, and exits 0

#### Scenario: IDE rules file missing

- **WHEN** `feynman doctor --target cursor` runs and `.cursor/rules/feynman.mdc` is absent
- **THEN** the output shows `[FAIL]` with a hint to re-run install and exits 1

#### Scenario: cursor frontmatter invalid

- **WHEN** `feynman doctor --target cursor` runs and the rules file exists but lacks
  `alwaysApply: true` in its frontmatter
- **THEN** the output shows `[FAIL]` and exits 1

### Requirement: uninstall removes hook entries and the flag file, preserving state.json

The `uninstall` subcommand SHALL remove all feynman hook entries from the target's settings
file and SHALL delete the `.feynman-active` flag, and SHALL NOT delete `state.json`.

#### Scenario: Successful uninstall for claude

- **WHEN** `feynman uninstall --target claude` runs and a hook is registered
- **THEN** all feynman entries are removed from `~/.claude/settings.json`, the flag
  `~/.claude/.feynman-active` is deleted, and `~/.claude/.feynman/state.json` is preserved

#### Scenario: Idempotent uninstall

- **WHEN** `feynman uninstall` runs and no feynman hook is registered
- **THEN** the CLI exits 0 and prints that nothing was found to uninstall

### Requirement: the CLI ships with zero runtime dependencies per ADR 0001

The `install`, `doctor`, and `uninstall` subcommands SHALL run using only Node.js built-in
modules, with `dependencies` in `package.json` staying `{}`. In development the `.ts` source
runs directly via Node's type-stripping at Node >=22.6; the published npm package ships
compiled `.js` files with no build step on the user's machine.

#### Scenario: No third-party imports at runtime

- **WHEN** `bin/feynman.ts` or its compiled `.js` counterpart runs any install, doctor, or
  uninstall command
- **THEN** all imports are from `node:fs`, `node:path`, `node:os`, `node:child_process`,
  `node:module`, or `package.json` — no `node_modules` package is loaded

#### Scenario: Published package settings.json merge is in-process

- **WHEN** `feynman install` updates a target's settings file
- **THEN** the merge is performed in-process by `bin/feynman.ts` (read → JSON.parse → mutate →
  JSON.stringify → writeFileSync) and no external command is shelled out for the merge
