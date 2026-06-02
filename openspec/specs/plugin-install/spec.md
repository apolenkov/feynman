# plugin-install Specification

## Purpose
TBD - created by archiving change add-plugin-install-spec. Update Purpose after archive.
## Requirements
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

### Requirement: install for the opencode target registers a rules file via instructions[]

The `install` subcommand for the `opencode` target SHALL bootstrap `state.json`, write a
`rules.md` file under `~/.config/opencode/.feynman/` (containing the active Intensity rule block
when enabled, or an empty file when disabled), and register that file's absolute path in the
`instructions[]` array of `~/.config/opencode/opencode.json`, creating `opencode.json` as `{}`
if it does not exist. Registration SHALL be check-before-append (idempotent unless `--force`).
Unlike `claude` and `codex`, opencode is driven by an `instructions[]` file path, not a
`SessionStart` hook.

#### Scenario: First install for opencode target

- **WHEN** `feynman install --target opencode` runs and the path is not yet registered
- **THEN** `~/.config/opencode/.feynman/rules.md` is written with the `full` Intensity content
  and its absolute path is appended to `instructions[]` in `~/.config/opencode/opencode.json`

#### Scenario: Idempotent opencode re-install

- **WHEN** `feynman install --target opencode` runs and the rules path is already in `instructions[]`
- **THEN** the path is not duplicated and `opencode.json` is left unchanged

#### Scenario: Disabled state writes an empty opencode rules file

- **WHEN** `feynman install --target opencode` runs and `state.json` has `enabled: false`
- **THEN** `~/.config/opencode/.feynman/rules.md` is written empty

### Requirement: supported install surface is the three CLI agent targets only

feynman's supported install surface SHALL be the three CLI agent targets `claude`, `codex`, and
`opencode` (the `all` / `*` aliases expand to exactly these three). The IDE adapters still present
in `bin/feynman.ts` — `cline`, `cursor`, `windsurf` — SHALL be treated as deprecated and out of
scope for this capability; their behavior is not contracted here and is slated for removal in a
follow-up change.

#### Scenario: all expands to the three supported targets

- **WHEN** `feynman install --target all` (or `--target '*'`) runs
- **THEN** the install is performed for `claude`, `codex`, and `opencode` in sequence, and no IDE
  target is touched

### Requirement: doctor for hook targets reports health and always exits 0

The `doctor` subcommand for hook targets (`claude`, `codex`) SHALL check whether the
`SessionStart` hook is registered, the hook script file is readable, `state.json` is valid,
and the `.feynman-active` flag matches the enabled state, then SHALL print a status report
and SHALL exit 0 (advisory-only, never blocks). The optional lint-hook check SHALL always be
reported as `[INFO]` and SHALL never count toward failures or change the exit status.

#### Scenario: All checks pass

- **WHEN** `feynman doctor --target claude` runs on a healthy install
- **THEN** all items show `[OK]` and the output ends with "Status: OK"

#### Scenario: Missing hook registration

- **WHEN** `feynman doctor` runs and no feynman `SessionStart` hook is registered
- **THEN** the hook registration check shows `[FAIL]` and the CLI still exits 0

#### Scenario: lint-hook check is informational only

- **WHEN** `feynman doctor` runs whether or not the optional lint hook is registered
- **THEN** the lint-hook line is reported as `[INFO]`, never as `[FAIL]`, and does not affect the exit status

### Requirement: uninstall removes hook entries and the flag file, preserving state.json

The `uninstall` subcommand SHALL remove feynman's registration from the target's settings file —
the `SessionStart` hook entries for `claude`/`codex`, or the rules path in `instructions[]` plus
the `rules.md` file for `opencode` — and SHALL delete the `.feynman-active` flag, and SHALL NOT
delete `state.json`.

#### Scenario: Successful uninstall for opencode

- **WHEN** `feynman uninstall --target opencode` runs and the rules path is registered
- **THEN** the path is removed from `instructions[]` in `~/.config/opencode/opencode.json`,
  `~/.config/opencode/.feynman/rules.md` is deleted, the flag is deleted, and `state.json` is preserved

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

