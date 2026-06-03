## 1. Extract shared helpers (leaves-first, no command depends on a later step)

- [x] 1.1 Move shared interfaces to `bin/cli/types.ts` (`TargetConfig`,
  `ExampleEntry`, `InstallResult`, `UninstallResult`, `TargetAdapter`); import
  them back into `bin/feynman.ts`. Gate green. Commit.
- [x] 1.2 Move ANSI helpers to `bin/cli/ansi.ts`; import back into
  `bin/feynman.ts`. Gate green. Commit.
- [x] 1.3 Move all `*_HELP` strings and `cmdHelp` to `bin/cli/help.ts`; import
  back. Gate green. Commit.
- [x] 1.4 Move `ensureDir`, `copyFileIfExists`, `copyMarkdownDir` to
  `bin/cli/fs-utils.ts`; import back. Gate green. Commit.
- [x] 1.5 Move the settings/config helpers (`fatal`, `readJsonConfig`,
  `readSettings`, `writeSettings`, `isFeynmanHookCommand`,
  `isSessionStartHookCommand`, `hasFeynmanHook`, `hasAnyFeynmanHook`,
  `extractHookScriptPath`, `removeFeynmanHooks`, `bootstrapState`,
  `installClaudeCommand`) to `bin/cli/settings.ts`; import back. Gate green. Commit.
- [x] 1.6 Move target config + adapters (`targetConfig`, `targetNames`,
  `parseTarget`, `hookCommandFor`, `readIntensityRules`, `createHookAdapter`,
  `createOpenCodeAdapter`, `installOne`, `uninstallOne`) to `bin/cli/targets.ts`;
  import back. Gate green. Commit.

## 2. Extract command bodies (each depends only on bin/cli/* from step 1)

- [x] 2.1 Move `examplesIndex`, `cmdExamples` to `bin/commands/examples.ts`;
  dispatcher imports `cmdExamples`. Gate green. Commit.
- [x] 2.2 Move `cmdVersion` to `bin/commands/version.ts` and `cmdLint` to
  `bin/commands/lint.ts`; dispatcher imports both. Gate green. Commit.
- [x] 2.3 Move `cmdBootstrap` to `bin/commands/bootstrap.ts`; dispatcher imports
  it. Gate green. Commit.
- [x] 2.4 Move install/uninstall (`installHookTarget`, `cmdInstall`,
  `uninstallHookTarget`, `readOpenCodeSettings`, `installOpenCodeTarget`,
  `uninstallOpenCodeTarget`, `cmdUninstall`) to `bin/commands/install.ts`;
  dispatcher imports `cmdInstall`/`cmdUninstall`. Gate green. Commit.
- [x] 2.5 Move doctor (`renderDoctorReport`, `cmdDoctorOpenCode`, `cmdDoctor`) to
  `bin/commands/doctor.ts`; dispatcher imports `cmdDoctor`. Preserve the 2-arg
  opencode `renderDoctorReport` call verbatim (pre-existing divergence, commit
  163eaa6 — out of scope). Gate green. Commit.

## 3. Reduce the entrypoint and lock the invariant

- [x] 3.1 Confirm `bin/feynman.ts` is now argv parsing + the `switch` dispatch
  only (target ~80 lines), importing every `cmd*` and the help constants. Remove
  any now-dead local code. Gate green.
- [x] 3.2 Add the structural guard test (`tests/cli-structure.test.ts`):
  `bin/feynman.ts` is at or below the line cap AND contains no `function cmd…`
  declaration. Run it — it passes for the reduced entrypoint.
- [x] 3.3 Run the full gate (`npm run typecheck`, `npm run eslint`, `npm test`,
  `npm run test:docs`) — all green. Commit the dispatcher reduction + guard test
  as `refactor(cli): reduce feynman.ts to a dispatcher; guard the structure`.
