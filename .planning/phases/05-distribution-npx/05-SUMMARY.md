---
phase: 05
plan: distribution-npx
subsystem: cli-distribution
tags: [npx, cli, install, doctor, uninstall, bin]
dependency_graph:
  requires: [phase-04-quality-tests-ci]
  provides: [npx-feynman-cli, unified-install-logic, feynman-doctor]
  affects: [install.sh, package.json, README.md]
tech_stack:
  added: [unified-cli-entrypoint]
  patterns: [thin-bash-wrapper, require-delegation, NO_COLOR-env, os.homedir]
key_files:
  created:
    - bin/feynman.js
    - uninstall.sh
    - tests/cli.test.js
    - .planning/phases/05-distribution-npx/05-VERIFICATION.md
  modified:
    - install.sh
    - package.json
    - README.md
    - tests/install.test.js
decisions:
  - D-01: bin/feynman.js is single source of truth for install/uninstall/doctor — pure CJS, zero runtime deps
  - D-04: lint subcommand delegates via require(), not spawn
  - D-11: uninstall preserves state.json (user data), removes only .feynman-active flag
  - NPX-03-deferred: npm publish deferred to Phase 7; artifact verified locally via npm pack
metrics:
  duration: 45m
  completed: "2026-05-06"
  tasks_completed: 11
  files_created: 4
  files_modified: 4
---

# Phase 5 Plan distribution-npx: Distribution (NPX + bash) Summary

**One-liner:** Unified `bin/feynman.js` CLI with install/uninstall/doctor/lint/version subcommands; bash wrappers refactored as thin Node delegates; npm artifact verified at 21.4 kB.

## What Was Built

```
[npx feynman install] → [bin/feynman.js] → [settings.json mutation]
                                          → [state.json bootstrap]
                                          → [.feynman-active flag]
                                          → [~/.claude/commands/feynman.md]

[bash install.sh]  → exec node bin/feynman.js install "$@"
[bash uninstall.sh] → exec node bin/feynman.js uninstall "$@"
```

Both bash wrappers are ≤17 lines each (Node >=18 check + exec delegate).

## Tasks Completed

| Task | Deliverable | Status |
|------|-------------|--------|
| A | `bin/feynman.js` unified CLI | Done |
| B | Install logic (idempotent, state bootstrap, flag) | Done |
| C | Uninstall logic (removes hook, preserves state) | Done |
| D | Doctor (7 checks, ASCII frame) | Done |
| E | `install.sh` refactored to thin wrapper | Done |
| F | `uninstall.sh` created | Done |
| G | `package.json` — bin, keywords, author, files | Done |
| H | `LICENSE` — already existed (MIT 2026 apolenkov) | Verified |
| I | `README.md` — npx-first install, npm badge | Done |
| J | Artifact validation (`npm pack` + isolated test) | Done |
| K | `tests/cli.test.js` — 26 tests, coverage verified | Done |

## Test Results

- Tests: 177 total (151 original + 26 new), 0 failures
- Coverage: 97.16% line (bin/feynman.js 97.4%, hooks/ 98.47%, lib/lint 99.54%)
- `feynman-lint.js` bin coverage 77% — remaining paths covered by lint.test.js

## npm pack Artifact

- Size: 21.4 kB packed (73.0 kB unpacked) — well under 50 kB target
- 14 files: no tests/, .planning/, .github/, node_modules/ artifacts
- Isolated install test: `npm install <tgz>` → all subcommands work correctly

## Deviations from Plan

### Auto-added: /feynman command install preserved in cmdInstall

- **Found during:** Task B implementation
- **Issue:** `install.sh` used to copy `skills/feynman/SKILL.md` to `~/.claude/commands/feynman.md`. The `tests/install.test.js` expected this (D-17 constraint: tests must still pass).
- **Fix:** Added SKILL.md copy logic to `cmdInstall()` in `bin/feynman.js`
- **Files modified:** `bin/feynman.js`
- **Commit:** a2f474d

### Auto-fixed: install.sh Node version check (bash integer expression error)

- **Found during:** Task E + test run
- **Issue:** `[ "$NODE_VER" -lt 18 ]` fails with "integer expression expected" when NODE_VER is empty (node not in PATH). Original line used `||` to gate the command but not the arithmetic comparison.
- **Fix:** Replaced with `command -v node` check first, then separate version arithmetic with error redirect
- **Files modified:** `install.sh`, `uninstall.sh`
- **Commit:** a2f474d

### Auto-updated: install.test.js uninstall.sh test description

- **Found during:** Task F
- **Issue:** Test was named "uninstall.sh does not exist yet (deferred to Phase 7 REL-04)" but uninstall.sh now exists. Test body already had the correct branching logic — only the name was stale.
- **Fix:** Renamed test to "uninstall.sh removes feynman hook and preserves state"
- **Files modified:** `tests/install.test.js`
- **Commit:** a2f474d

## Deferred Items

None introduced by this phase. NPX-03 (npm publish) remains deferred to Phase 7 per plan.

## Known Stubs

None. All CLI subcommands are fully wired.

## Threat Flags

None — no new network endpoints or auth paths. install/uninstall write to local filesystem only.

## Self-Check: PASSED

- `bin/feynman.js` exists: FOUND
- `uninstall.sh` exists: FOUND
- `tests/cli.test.js` exists: FOUND
- `05-VERIFICATION.md` exists: FOUND
- Commit a2f474d exists: FOUND
- 177 tests pass: VERIFIED
- npm pack 21.4 kB: VERIFIED

## Addendum: Codex Support (2026-05-06)

User requested production-ready support for both Claude Code and Codex before
release. Phase 5 distribution scope was extended accordingly.

```
npx feynman install --target claude  → ~/.claude/settings.json
npx feynman install --target codex   → ~/.codex/hooks.json
npx feynman install --target both    → both configs, no duplicate hooks
```

Added:

- `--target claude|codex|both` for install/uninstall/doctor
- `FEYNMAN_HOME` support in `hooks/feynman-activate.js`
- `.codex-plugin/plugin.json` and repo-root `hooks.json`
- `hooks/hooks.json` for Claude Code plugin packaging
- README and architecture docs for dual-client install
- Package metadata tests for plugin manifests

Verification:

- `npm test`: PASS, 190 tests
- `npm run coverage`: PASS, 96.98% lines
- `npm pack --dry-run`: PASS, tarball includes `.codex-plugin/plugin.json`,
  `hooks.json`, and `hooks/hooks.json`
