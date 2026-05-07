# Phase 5: Distribution (NPX + bash) - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated

<domain>
## Phase Boundary

feynman ships as an NPM package installable via `npx @albinocrabs/feynman install`. Bash one-liner remains as fallback and delegates to the same Node logic (DRY). A `feynman doctor` subcommand validates installation health.

**Delivers:**
- bin/feynman.js — unified CLI (install / uninstall / doctor / lint / version / help)
- install.sh — refactored to call `node bin/feynman.js install` (no logic duplication)
- uninstall.sh — calls `node bin/feynman.js uninstall`
- README install section — `npx @albinocrabs/feynman install` primary, bash one-liner secondary
- package.json — `bin` field maps `feynman` and `feynman-lint` commands
- LICENSE — MIT (if missing)
- npm publish: NOT executed in this phase — Phase 7 ships it. We make the artifact publish-ready and verify locally via `npm pack && npm install -g ./feynman-0.2.0.tgz`.

**Does NOT deliver:** docs (Phase 6), self-improvement design (Phase 6.5), git tag/release (Phase 7).

</domain>

<decisions>

### CLI architecture
- **D-01:** `bin/feynman.js` is the single source of truth for install/uninstall/doctor logic. Pure CommonJS, zero runtime deps, Node ≥18.
- **D-02:** Subcommand dispatch via `process.argv[2]`. Unknown subcommand → print help + exit 2.
- **D-03:** Subcommands: `install`, `uninstall`, `doctor`, `lint <file>`, `version`, `help`.
- **D-04:** `feynman lint` delegates to existing `bin/feynman-lint.js` logic (require + invoke, no spawn).
- **D-05:** Output: human-readable lines for TTY; respects `NO_COLOR` env. No JSON output (Phase 6.5/v0.3.0).

### Install logic (extracted from current install.sh)
- **D-06:** `install` writes hook entry to `~/.claude/settings.json`. Merge-preserves other hooks. Idempotent: re-running detects existing feynman entry by `command` substring `feynman-activate.js` and skips.
- **D-07:** `install` resolves absolute path via `path.resolve(__dirname, '..', 'hooks', 'feynman-activate.js')` — works from any cwd.
- **D-08:** `install` creates `~/.claude/.feynman/` dir + initial `state.json` if absent (bootstraps state). Sets `~/.claude/.feynman-active` flag.
- **D-09:** `install` prints status frame: registered hook path, settings.json path, state path. Exit 0 on success.

### Uninstall logic
- **D-10:** `uninstall` removes feynman hook entries from settings.json (filters out entries with `feynman-activate.js` in command). Preserves other hooks.
- **D-11:** `uninstall` does NOT delete state.json or rules — user data preserved. Removes `.feynman-active` flag only. Print: "feynman disabled. State preserved at ~/.claude/.feynman/. Re-enable: npx @albinocrabs/feynman install".
- **D-12:** Idempotent: running uninstall twice is safe.

### Doctor (NPX-06)
- **D-13:** Checks (each prints PASS/FAIL line):
  1. settings.json exists at `~/.claude/settings.json`
  2. UserPromptSubmit hook entry references `feynman-activate.js`
  3. hook script file exists + readable
  4. rules file `rules/feynman-activate.md` exists + non-empty
  5. state.json exists + parses as JSON + has `enabled` field
  6. `.feynman-active` flag present
  7. Stop-hook for feynman-lint registered (optional, just report status — not a failure)
- **D-14:** Final summary: `OK` if all required checks pass, `ISSUES (n)` otherwise. Exit 0 always (advisory tool).

### Bash install refactor
- **D-15:** `install.sh` becomes thin wrapper: `node "$(dirname "$0")/bin/feynman.js" install "$@"`. Same for `uninstall.sh`.
- **D-16:** Bash wrapper checks Node ≥18 with `node -v` parse + clear error message if missing/old.
- **D-17:** Existing tests/install.test.js must still pass — install.sh behavior preserved.

### package.json
- **D-18:** `bin: { "feynman": "./bin/feynman.js", "feynman-lint": "./bin/feynman-lint.js" }`. Shebang `#!/usr/bin/env node` on both files. `chmod +x` via prepublish or via files field implicit.
- **D-19:** `files` already includes hooks/, lib/, bin/, rules/, skills/, install.sh — verify `LICENSE` and `package.json` itself implicitly included by npm.
- **D-20:** Add `keywords: ["claude-code", "ascii", "diagrams", "claude", "plugin", "hook"]`, `author: "apolenkov"`.

### README updates
- **D-21:** Replace install section. Primary: `npx @albinocrabs/feynman install`. Secondary (Manual / no Node global): bash `curl ... | bash` or git-clone + bash. Existing manual settings.json block preserved as last fallback.
- **D-22:** Add npm version badge (shields.io: `https://img.shields.io/npm/v/@albinocrabs/feynman`).

### Claude's Discretion
- Exact wording of doctor output frame
- Whether to use `console.log` or `process.stdout.write` for CLI output (consistent with hooks: `process.stdout.write` for hook JSON; CLI human output → `console.log` is fine)
- Whether to support `feynman install --force` (re-add even if exists) — yes, simple flag

</decisions>

<canonical_refs>
- .planning/REQUIREMENTS.md — NPX-01..06
- install.sh — current bash logic to extract into Node
- bin/feynman-lint.js — pattern for CLI structure
- hooks/feynman-activate.js — knows the bootstrap state schema
- tests/install.test.js — install behavior contract under test
- package.json — current bin field empty; needs `feynman` mapping
</canonical_refs>

<code_context>
- Existing CLI pattern in bin/feynman-lint.js: shebang, parse argv, dispatch, exit codes 0/1/2
- settings.json merge pattern: read JSON, mutate `hooks.UserPromptSubmit` array, write back with 2-space indent
- State schema: `{enabled: boolean, intensity: 'lite'|'full'|'ultra', injections: number}`
- HOME resolution: `os.homedir()` (NEVER tilde literal — bug #8810)
</code_context>

<specifics>
- All install/uninstall paths must work with `HOME` env override (tests rely on this — D-08 of Phase 4)
- `npm pack` should produce a tarball ≤50KB (no node_modules, no .planning/, no tests/, no .github/)
- Verify `.npmignore` OR `files` whitelist excludes: tests/, .planning/, .github/, .gitignore, *.log
- After Phase 5: `npx @albinocrabs/feynman --help` runs, `npx @albinocrabs/feynman doctor` runs, `npx @albinocrabs/feynman install` writes correct settings.json
- All Phase 4 tests still pass (install.test.js covers install.sh which now delegates to Node)
</specifics>

<deferred>
- npm publish itself — Phase 7
- `feynman bench` subcommand — v0.3.0
- `feynman rules list` / `feynman rules explain L01` — v0.3.0
- Auto-update check — v0.3.0
- Windows install.ps1 — v0.3.0 (not in v0.2.0 scope per PROJECT.md)
</deferred>

---
*Phase: 5-Distribution-NPX*
*Context gathered: 2026-05-06*
