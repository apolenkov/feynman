## Why

The v0.6.x move to a TypeScript source + packaging build (ADR 0001) left the old
"CommonJS-only / Node >= 18 / no build step" contract scattered as stale copies.
The documentation layer was just consolidated to a single source of truth, but
two **code** tails still assert the superseded contract, and nothing automatically
stops the contract from being re-duplicated — so the same drift will recur. The
dev dependencies have also fallen a few patch/minor versions behind latest.

A reader or agent who trusts `install.sh` today is told "Node >= 18", which is
wrong (the runtime needs >= 22.6); a contributor copying the old phrasing back
into any doc would not be caught by CI.

## What Changes

- Refresh dev dependencies to latest compatible: `eslint` 10.4.0 → 10.4.1,
  `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` 8.59.x → 8.60.1.
  (`typescript` and `@types/node` are already latest. Runtime `dependencies` stay `{}`.)
- Fix `install.sh` **and `uninstall.sh`**: Node baseline check `>= 18` → `>= 22.6`,
  matching `package.json` `engines.node` and ADR 0001.
- Reword the bare `no build step` phrase in three runtime code comments
  (`bin/feynman-lint.ts`, `hooks/feynman-activate.ts`, `hooks/feynman-lint.ts`):
  `strip-types` already says it, and bare `no build step` is now stale because a
  packaging build exists (ADR 0001).
- Remove retired-GSD references from `skills/feynman/SKILL.md` (the `eval`
  subcommand still points at `.planning/notes/` and `/gsd-execute-phase`, both
  retired 2026-06-01).
- **New:** a doc-drift guard in `scripts/check-docs.ts` (already wired into
  `npm run test:docs` → CI) that fails the build if the superseded contract
  wording (`CommonJS-only`, `Node >= 18`, `no build step`) reappears anywhere
  outside ADR 0001 and CHANGELOG history.

## Capabilities

### New Capabilities
- `doc-drift-guard`: a CI invariant that keeps the single-source-of-truth
  documentation structure enforced — the superseded toolchain contract cannot
  silently reappear outside its canonical home (ADR 0001).

### Modified Capabilities
<!-- None. The dependency refresh and the two code-tail fixes are implementation
     housekeeping with no spec-level behavior change; there is no existing spec
     in openspec/specs/ to modify. -->

## Non-goals

- No runtime behavior change to the hook, rules file, linter, or CLI.
- Not introducing any runtime dependency — the zero-dep promise (ADR 0001) holds.
- Not a blanket "upgrade everything" — only latest-compatible within current
  semver ranges; no major-version jumps in this change.
- Not re-opening ADR 0001; the guard enforces it, it does not revisit it.

## Impact

- `package.json`, `package-lock.json` — dependency versions.
- `install.sh`, `uninstall.sh` — Node baseline check.
- `bin/feynman-lint.ts`, `hooks/feynman-activate.ts`, `hooks/feynman-lint.ts` —
  reword the stale `no build step` comment.
- `skills/feynman/SKILL.md` — `eval` subcommand text.
- `scripts/check-docs.ts` — new drift assertions; runs under `npm run test:docs`
  and `npm run ci`.
