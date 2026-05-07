# feynman v0.2.0 Release Notes

## Summary

v0.2.0 turns feynman from a working hook prototype into a production-ready
open-source plugin for Claude Code and Codex.

## What's New

- First-class Codex support:
  - `npx @albinocrabs/feynman install --target codex`
  - `npx @albinocrabs/feynman uninstall --target codex`
  - `npx @albinocrabs/feynman doctor --target codex`
- Dual-client install:
  - `--target claude`
  - `--target codex`
  - `--target both`
- Codex plugin metadata:
  - `.codex-plugin/plugin.json`
  - repo-root `hooks.json`
- Claude Code plugin hook metadata:
  - `hooks/hooks.json`
- `FEYNMAN_HOME` runtime selector so the same hook script can use
  `~/.claude` or `~/.codex` state without duplicating code.
- Diagram linter:
  - `feynman lint <file>`
  - `feynman-lint <file>`
  - L01-L08 structural rules
  - Stop-hook correction path
- Documentation:
  - rewritten README
  - architecture docs
  - lint rules reference
  - visual patterns guide
  - six domain examples
  - self-improvement loop design for v0.3.0

## Fixed

- Install logic is idempotent and no longer duplicates hook entries.
- Bash installer delegates to the Node CLI so install behavior has one source
  of truth.
- `uninstall.sh` removes hook entries while preserving user state.
- Runtime state uses `injections` instead of the misleading legacy `count`.
- Plugin manifests and npm package metadata now match the v0.2.0 release.

## Breaking Changes

None expected for normal users.

The state schema now uses:

```json
{
  "enabled": true,
  "intensity": "full",
  "injections": 0
}
```

The hook still reads legacy `count` once and migrates it to `injections`.

## Migration From v0.1

Run the installer again:

```bash
npx @albinocrabs/feynman install --target claude
```

For Codex:

```bash
npx @albinocrabs/feynman install --target codex
```

For both:

```bash
npx @albinocrabs/feynman install --target both
```

Then restart Claude Code or Codex.

## Verification

- `npm test`: 190 tests passing
- `npm run coverage`: 96.98% line coverage
- Public docs/examples lint: passing
- `npm pack --dry-run`: package includes Claude Code and Codex plugin metadata
- Isolated tarball install: `install --target both` plus both doctor targets pass

## Release Notes

- npm package name: `@albinocrabs/feynman`
- CLI binaries remain `feynman` and `feynman-lint`
- Git tag and GitHub release should be cut after npm publish succeeds.
