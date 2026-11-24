## MODIFIED Requirements

### Requirement: The feynman CLI entrypoint is a thin dispatcher

The entrypoint `bin/feynman.ts` SHALL contain only argument parsing and
dispatch to imported subcommand modules and SHALL stay within a small fixed
line cap. Command bodies SHALL live under `bin/commands/`, presentation
under `bin/cli/`, and Codex/filesystem boundaries under `bin/adapters/`.
Every subcommand SHALL behave exactly as it did before the split.

#### Scenario: the entrypoint stays a dispatcher

- **WHEN** the structural guard test inspects `bin/feynman.ts`
- **THEN** the file is at or below the line cap and defines no command body
  inline (no `function cmd…` declaration); the test fails if either condition is
  violated

#### Scenario: every command resolves through an imported module

- **WHEN** the CLI runs any subcommand (`install`, `uninstall`, `doctor`,
  `state`, `status`, `bootstrap`, `examples`, `lint`, `version`)
- **THEN** the dispatcher delegates to that command's module under
  `bin/commands/` and the command produces the same output and exit code as
  before the decomposition

#### Scenario: behaviour is unchanged by the split

- **WHEN** the existing CLI and installed-hook integration tests run against the
  decomposed entrypoint
- **THEN** they pass unchanged, confirming no subcommand's behaviour, flags, or
  exit codes drifted during the move

#### Scenario: Responsibilities stay in their modules

- **WHEN** the CLI implementation is inspected
- **THEN** the command bodies for install, doctor, state, bootstrap, examples,
  lint and version are under `bin/commands/`
- **AND** presentation and Codex/filesystem boundaries remain under `bin/cli/`
  and `bin/adapters/`, respectively
