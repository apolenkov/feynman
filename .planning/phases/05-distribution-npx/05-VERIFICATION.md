---
status: passed
phase: 05
plan: distribution-npx
verified: 2026-05-06
---

# Phase 5: Distribution (NPX + bash) — Verification

## Requirement Verification Table

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| NPX-01 | `package.json` with name "feynman", version "0.2.0", `bin` entries, `files` whitelist, `engines.node >= 18` | PASS | `package.json:1-52` — name/version/bin/files/engines all present |
| NPX-02 | `bin/feynman.js` — unified CLI; subcommands: install, uninstall, doctor, lint, version; `--help` for each | PASS | `bin/feynman.js` created; all subcommands verified via `tests/cli.test.js` (177 tests pass) |
| NPX-03 | `npm publish` — package live on npm (npx feynman@0.2.0 install) | DEFERRED | Phase 7 (REL-03). Verified locally via `npm pack` → 21.4 KB tarball; isolated install test with `npm install <tgz>` confirms all subcommands work |
| NPX-04 | `bash install.sh` refactored to call `node bin/feynman.js install` internally — DRY | PASS | `install.sh` is 17 lines, delegates via `exec node "$SCRIPT_DIR/bin/feynman.js" install "$@"`. All 151 original + 26 new tests pass |
| NPX-05 | README install section updated: primary `npx feynman install`, fallback bash, manual instructions | PASS | `README.md` — npx-first install block, bash one-liner, uninstall/doctor lines, manual `<details>` block preserved |
| NPX-06 | `feynman doctor` — checks hook registered? state.json valid? rules file readable? lint hook? prints status frame | PASS | `bin/feynman.js:260-340` — 7 checks, ASCII frame output verified |

## NPX-03 Note

Per CONTEXT.md `<deferred>` section: npm publish itself is Phase 7 work. Local artifact verification was performed:

```
npm pack → feynman-0.2.0.tgz (21.4 kB packed, 73.0 kB unpacked, 14 files)
Tarball contents verified: no tests/, .planning/, .github/ artifacts
Isolated test: npm install <tgz> && HOME=/tmp feynman install → settings.json written correctly
doctor output: Status: OK (all 6 required checks pass)
```

## Command Output Samples

### `feynman version`
```
0.2.0
```

### `feynman install` (isolated HOME)
```
┌─ feynman installed ──────────────────────────────────────────┐
│ hook:     /path/to/node_modules/feynman/hooks/feynman-activate.js
│ settings: ~/.claude/settings.json
│ state:    ~/.claude/.feynman/state.json
│ flag:     ~/.claude/.feynman-active
└──────────────────────────────────────────────────────────────┘

Restart Claude Code to activate feynman.
```

### `feynman doctor` (after install, NO_COLOR=1)
```
┌─ feynman doctor ──────────────────────────────────────────────────┐
│ [OK]   settings.json present                                     │
│ [OK]   hook registered (feynman-activate.js in UserPromptSubmit) │
│ [OK]   hook script file exists and is readable                   │
│ [OK]   rules/feynman-activate.md exists and non-empty            │
│ [OK]   state.json valid (has enabled field)                      │
│ [OK]   .feynman-active flag present                              │
│ [INFO] lint hook: not registered (optional)                      │
└──────────────────────────────────────────────────────────────────┘
Status: OK
```

## Test Results

```
ℹ tests 177
ℹ suites 49
ℹ pass 177
ℹ fail 0
ℹ duration_ms 2168
```

Original 151 tests all pass. New cli.test.js adds 26 tests.

## Coverage

```
File                  | % Stmts | % Branch | % Lines
----------------------|---------|----------|--------
bin/feynman-lint.js   |   77.23 |    27.27 |  77.23
bin/feynman.js        |    97.4 |     85.1 |   97.4
hooks/feynman-act...  |   97.02 |    73.07 |  97.02
hooks/feynman-lint.js |     100 |    88.88 |    100
lib/lint/index.js     |      96 |    74.28 |     96
lib/lint/parser.js    |     100 |     94.5 |    100
lib/lint/rules.js     |     100 |    92.65 |    100
All files             |   97.16 |    85.74 |  97.16
```

Note: `bin/feynman-lint.js` at 77% — stdin/json/strict paths not exercised by CLI tests (covered by `lint.test.js` calling the lint library directly). All critical paths in hooks/ and lib/lint/ exceed 95%.

## npm pack Tarball Verification

```
21.4 kB packed (< 50 kB target)
73.0 kB unpacked
14 files:
  LICENSE, README.md, package.json
  bin/feynman.js, bin/feynman-lint.js
  hooks/feynman-activate.js, hooks/feynman-lint.js
  lib/lint/index.js, lib/lint/parser.js, lib/lint/rules.js
  rules/feynman-activate.md
  skills/feynman/SKILL.md
  install.sh, uninstall.sh

Excluded (correct): tests/, .planning/, .github/, node_modules/, coverage/
```

## Commit

`a2f474d` — feat(05): NPX distribution + unified bin/feynman.js CLI
