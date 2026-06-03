## Why

`bin/feynman.ts` has grown to 1204 lines and ~39 functions — help text, target
config, settings IO, filesystem helpers, every command body, and the dispatcher
all in one file. It is the largest file in the repo, well past the ~250–300 line
guideline, and the single place a reader must hold entirely in their head to
change any one command. There is no requirement change here; this is purely about
keeping the CLI navigable and stopping the file from silently regrowing.

## What Changes

- Split `bin/feynman.ts` into a thin dispatcher plus per-command and per-concern
  modules. Command bodies move to `bin/commands/*` (install, doctor, bootstrap,
  examples, lint, version); shared helpers move to `bin/cli/*` (help text, target
  config/adapters, settings/config IO, filesystem utils). Functions move
  **verbatim** — no logic change.
- `bin/feynman.ts` is reduced to argv parsing and the `switch` dispatch only
  (target ~80 lines).
- Add a structural guard test that fails if `bin/feynman.ts` exceeds the line cap
  or defines command bodies inline, so the invariant can't silently regress.
- **Not a behaviour change**: every subcommand behaves byte-identically, no flags
  added or renamed, no dependency change. The known pre-existing doctor
  divergence (opencode `renderDoctorReport` is called 2-arg, no INFO, vs the
  general 3-arg path — commit 163eaa6) is preserved as-is.

## Capabilities

### New Capabilities
- `cli-structure`: the `feynman` CLI entrypoint is a thin dispatcher; command
  implementations and shared helpers live in their own modules, enforced by a
  structural guard so the entrypoint stays small.

### Modified Capabilities
<!-- none — no requirement of plugin-install, diagram-lint, or rules-injection changes -->

## Impact

- Code: `bin/feynman.ts` shrinks to a dispatcher; new modules under
  `bin/commands/` and `bin/cli/`. No change to `lib/`, hooks, or the lint engine.
- Tests: one new structural guard test; all existing CLI/integration tests must
  stay green unchanged (they pin the behaviour the move must preserve).
- No CLI flags, no dependencies, no runtime behaviour change.
- Non-goals: no L-rule or doctor logic change, no settings-format change, and no
  spec delta for any behaviour capability (there is none).
