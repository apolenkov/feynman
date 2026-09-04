# plugin-install Specification

## Purpose

Define installation, health checks, and removal for the Codex-only feynman
distribution.

## Requirements

### Requirement: Node baseline is enforced

The CLI SHALL refuse to run on Node.js older than 22.18 with a non-zero status
and a human-readable error.

#### Scenario: unsupported runtime

- **WHEN** an install command runs on Node.js below 22.18
- **THEN** it exits with status 1 and reports `Node.js >=22.18 required`

### Requirement: install registers the Codex SessionStart hook

The `install` command SHALL register an idempotent `SessionStart` hook in
`~/.codex/hooks.json` and bootstrap `~/.codex/.feynman/state.json` with enabled
`true` and Intensity `full` when state is absent.

#### Scenario: first install

- **WHEN** `feynman install` runs without an existing feynman registration
- **THEN** Codex receives a hook referencing `feynman-session-start` and local state is created

#### Scenario: repeat install

- **WHEN** `feynman install` runs with an existing feynman registration
- **THEN** the hook is not duplicated and the command exits successfully

#### Scenario: literal filesystem paths

- **WHEN** the package or user home path contains spaces, quotes or dollar signs
- **THEN** the generated command invokes that literal path without shell expansion
- **AND** repeated install and uninstall still identify that command correctly

### Requirement: install reflects enabled state

The CLI SHALL create `~/.codex/.feynman-active` when state is enabled and SHALL
remove it when state is disabled.

#### Scenario: enabled state

- **WHEN** install completes with `enabled: true`
- **THEN** the active flag exists and contains the current Intensity

#### Scenario: disabled state

- **WHEN** install reads `enabled: false`
- **THEN** the active flag is absent

### Requirement: the CLI has one Codex installation surface

The CLI SHALL install, inspect, and remove only the Codex integration. It SHALL
not expose a target-selection option; commands always use `~/.codex`.

#### Scenario: install uses Codex

- **WHEN** `feynman install` runs
- **THEN** it writes only the Codex hook and state paths

#### Scenario: target option is rejected

- **WHEN** a command receives `--target`
- **THEN** it reports an unsupported option and exits with code 2

### Requirement: doctor is advisory and checks Codex health

The `doctor` command SHALL check the hook registration, readable hook file,
valid state, and active-flag consistency. It SHALL print a status report and
exit 0 even when a check fails.

#### Scenario: healthy installation

- **WHEN** `feynman doctor` runs after a successful install
- **THEN** checks report `OK`, the status is `OK`, and the exit code is 0

#### Scenario: missing registration

- **WHEN** the hook is absent
- **THEN** the registration check reports `FAIL`, the status is `ISSUES`, and the exit code remains 0

### Requirement: uninstall preserves user state

The `uninstall` command SHALL remove feynman's Codex hook entries and active
flag, preserve `state.json`, and leave unrelated Codex hooks unchanged.

#### Scenario: registered hook

- **WHEN** `feynman uninstall` runs after installation
- **THEN** feynman's registration and active flag are removed while state remains

#### Scenario: already absent

- **WHEN** `feynman uninstall` runs without a feynman registration
- **THEN** it exits 0 and reports that nothing was found

#### Scenario: unrelated script with a similar name

- **WHEN** another hook invokes `not-feynman-session-start.js` or only mentions Feynman in a message
- **THEN** install adds its own hook and uninstall leaves that unrelated entry intact

#### Scenario: invalid configuration shape

- **WHEN** `hooks.json` is a JSON array, scalar, or contains malformed hook groups
- **THEN** installation fails without rewriting the existing bytes

### Requirement: failed writes preserve user files

Settings and state SHALL be written through a staged file and atomic rename.
A write, flush or rename failure SHALL leave the previous destination intact.
Corrupt state SHALL be backed up before replacement; backup failure SHALL stop
recovery without overwriting the original bytes.

### Requirement: state is managed through one Codex CLI surface

The CLI SHALL show and change local Feynman state through `feynman state` and
the `feynman status` alias. It SHALL keep `state.json` and the active flag
consistent without requiring a user or skill to edit either file directly.

#### Scenario: state change

- **WHEN** `feynman state lite` runs
- **THEN** `state.json` has intensity `lite` and `.feynman-active` contains
  `lite` when state is enabled

#### Scenario: disable state

- **WHEN** `feynman state off` runs
- **THEN** `state.json` has `enabled: false` and `.feynman-active` is absent

#### Scenario: late hook bookkeeping

- **WHEN** a SessionStart injection began before a preference change completed
- **THEN** its counter update does not rewrite or revert those preferences
- **AND** the CLI continues exposing the advisory counter through the state store

### Requirement: bootstrap exports an operable local bundle safely

Bootstrap SHALL include the CLI, hook and their core dependencies. Forceful
replacement SHALL require existing Feynman ownership metadata and SHALL reject
symlinked destinations and ancestors of the current worktree, home or runtime.

#### Scenario: unowned output

- **WHEN** `bootstrap --force` targets an unrelated existing directory
- **THEN** it fails without deleting its files

#### Scenario: exported runtime

- **WHEN** bootstrap exports to a new directory
- **THEN** its CLI and linter run without importing the original repository

### Requirement: the published package has no runtime dependencies

Install, doctor, and uninstall SHALL use only Node.js built-ins. Development
may run TypeScript directly on Node.js 22.18+; the published package SHALL ship
compiled JavaScript and SHALL declare an empty `dependencies` object.

#### Scenario: package inspection

- **WHEN** the package is packed for publication
- **THEN** it contains compiled CLI/hook files and no third-party runtime dependency

### Requirement: the native Codex skill is discoverable and self-contained

The repository SHALL publish a native Codex plugin with a marketplace entry,
manifest, and `SKILL.md`. Its name, description, and keywords SHALL describe
visual architecture and ASCII diagram use cases. The skill SHALL invoke the
published CLI through `npx` for a state operation and SHALL not require an MCP
server or a globally installed binary.

#### Scenario: visual explanation without CLI installation

- **WHEN** the user asks the installed native skill to explain a structure
- **THEN** its packaged instructions describe visual selection and fact preservation
- **AND** the explanation requires no CLI invocation, network access, or local state read/write

#### Scenario: settings are explicitly requested

- **WHEN** the user asks to inspect or change Feynman settings
- **THEN** the skill uses the documented CLI state operation
- **AND** it does not apply this operation to an ordinary explanation request

#### Scenario: plugin search and invocation

- **WHEN** a user searches the Codex plugin browser for visual architecture,
  ASCII diagrams, flows, comparisons, or status
- **THEN** the Feynman marketplace entry and skill metadata describe that
  capability, and the skill can manage state with `npx`
