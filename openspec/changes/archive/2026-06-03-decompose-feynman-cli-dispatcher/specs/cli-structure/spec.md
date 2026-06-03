## ADDED Requirements

### Requirement: The feynman CLI entrypoint is a thin dispatcher

The `bin/feynman.ts` entrypoint SHALL contain only argument parsing and
subcommand dispatch, with each subcommand's implementation imported from its own
module rather than defined inline. Command bodies live under `bin/commands/`
(install, doctor, bootstrap, examples, lint, version) and shared helpers under
`bin/cli/` (help text, target config/adapters, settings/config IO, filesystem
utilities). The entrypoint stays within a small fixed line cap so it cannot
silently regrow into the multi-responsibility file it replaced.

This is a structural invariant, not a behaviour change: every subcommand behaves
exactly as before the split.

#### Scenario: the entrypoint stays a dispatcher

- **WHEN** the structural guard test inspects `bin/feynman.ts`
- **THEN** the file is at or below the line cap and defines no command body
  inline (no `function cmd…` declaration); the test fails if either condition is
  violated

#### Scenario: every command resolves through an imported module

- **WHEN** the CLI runs any subcommand (`install`, `uninstall`, `doctor`,
  `bootstrap`, `examples`, `lint`, `version`)
- **THEN** the dispatcher delegates to that command's module under
  `bin/commands/` and the command produces the same output and exit code as
  before the decomposition

#### Scenario: behaviour is unchanged by the split

- **WHEN** the existing CLI and installed-hook integration tests run against the
  decomposed entrypoint
- **THEN** they pass unchanged, confirming no subcommand's behaviour, flags, or
  exit codes drifted during the move
