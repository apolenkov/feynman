## Context

`bin/feynman.ts` (1204 lines) is already informally sectioned with `// ─── … ───`
banners: Types, ANSI helpers, Constants, target config, Help text, FS helpers,
examples, bootstrap, settings helpers, install, OpenCode adapter, target
adapters, uninstall, doctor, lint, version, help, dispatch. Those banners are the
natural cut lines. The file imports only from `lib/` and Node built-ins; commands
are plain functions called from the bottom `switch`. No shared mutable state — the
only globals are `argv`/`sub`/`rest` in the dispatch block, so functions move
without rewiring.

## Goals / Non-Goals

**Goals:**
- `bin/feynman.ts` becomes argv-parse + `switch` only (~80 lines).
- Each subcommand body in its own `bin/commands/*` module; shared helpers in
  `bin/cli/*`. One responsibility per file, each under the ~250-line guideline.
- A structural guard test locks the invariant so the entrypoint can't regrow.

**Non-Goals:**
- No behaviour change, no flag add/rename, no dependency change.
- No logic edits to any command, doctor check, or settings handling — functions
  move verbatim.
- No change to `lib/`, the lint engine, or the hooks.

## Decisions

**Module map (by responsibility, following the existing banners).** Import
direction is strictly one-way `feynman.ts → commands/* → cli/* → lib/*`, so no
cycles:

- `bin/cli/types.ts` — shared interfaces (`TargetConfig`, `ExampleEntry`,
  `InstallResult`, `UninstallResult`, `TargetAdapter`).
- `bin/cli/ansi.ts` — ANSI colour helpers + constants (`PROJECT_ROOT` etc. stay
  where most-used; pure constants that are shared go here or in `targets.ts`).
- `bin/cli/help.ts` — all `*_HELP` strings + `cmdHelp`.
- `bin/cli/fs-utils.ts` — `ensureDir`, `copyFileIfExists`, `copyMarkdownDir`.
- `bin/cli/settings.ts` — `fatal`, `readJsonConfig`, `readSettings`,
  `writeSettings`, `isFeynmanHookCommand`, `isSessionStartHookCommand`,
  `hasFeynmanHook`, `hasAnyFeynmanHook`, `extractHookScriptPath`,
  `removeFeynmanHooks`, `bootstrapState`, `installClaudeCommand`.
- `bin/cli/targets.ts` — `targetConfig`, `targetNames`, `parseTarget`,
  `hookCommandFor`, `readIntensityRules`, the adapters (`createHookAdapter`,
  `createOpenCodeAdapter`, `installOne`, `uninstallOne`).
- `bin/commands/install.ts` — `installHookTarget`, `cmdInstall`,
  `uninstallHookTarget`, `readOpenCodeSettings`, `installOpenCodeTarget`,
  `uninstallOpenCodeTarget`, `cmdUninstall`.
- `bin/commands/doctor.ts` — `renderDoctorReport`, `cmdDoctorOpenCode`,
  `cmdDoctor`.
- `bin/commands/bootstrap.ts` — `cmdBootstrap`.
- `bin/commands/examples.ts` — `examplesIndex`, `cmdExamples`.
- `bin/commands/lint.ts` — `cmdLint`.
- `bin/commands/version.ts` — `cmdVersion`.
- `bin/feynman.ts` — argv parse + `switch`, importing each `cmd*` + the help
  constants.

Exact placement of a few border-line helpers (e.g. which file owns shared
constants, whether `bootstrapState`/`installClaudeCommand` sit in `settings.ts`
or `commands/install.ts`) is settled per-commit by where the imports land
cleanest; the test gate catches any miswiring immediately.

**One extraction per commit, gate after each.** Each commit moves one module's
functions verbatim, adds the imports, and runs `typecheck + eslint + test +
test:docs`. Because the existing CLI/integration tests pin behaviour, a green gate
after each move is the regression proof. Order is leaves-first (help, fs-utils,
settings, targets) before the commands that depend on them, so every intermediate
commit compiles.

**Structural guard as the new requirement.** A test asserts `bin/feynman.ts` is at
most a fixed line cap (e.g. 120, with headroom over the ~80 target) AND that it
contains no `function cmd…` definition (command bodies must be imported, not
inline). This is the testable form of the `cli-structure` requirement; it fails
loudly if a future change inlines a command or lets the entrypoint regrow.

## Risks / Trade-offs

- **CLI regression from a bad move** → Mitigation: functions move verbatim (no
  edits), and the full gate — including the end-to-end installed-hook integration
  tests — runs after every single extraction commit. Any drift fails immediately
  and is isolated to one small commit.
- **Import cycle between a command and a helper** → Mitigation: strict one-way
  import direction (`feynman → commands → cli → lib`); helpers never import
  commands. `tsc` flags a cycle at typecheck.
- **Line-cap test is a blunt instrument** → Mitigation: the cap has headroom over
  the target and is paired with the "no inline `cmd` body" check, so it locks the
  shape (dispatcher-only) rather than micro-managing length.
- **Pre-existing doctor divergence could be "fixed" mid-move** → Mitigation:
  called out as a non-goal; the 2-arg opencode `renderDoctorReport` call moves
  verbatim and is left for a separate, deliberate change.
