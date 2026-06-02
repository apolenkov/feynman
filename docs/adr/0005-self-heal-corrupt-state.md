---
status: accepted
date: 2026-06-02
amends: 0004
---

# Self-heal a corrupt state.json instead of failing safe

ADR-0004 made `reconcileState` fail-safe on a corrupt `state.json`: not active,
unlink a dangling flag, leave the file untouched. This ADR reverses that one
consequence — corrupt state now self-heals.

## Context

The fail-safe never rewrites the file. Because `reconcileState` keys first-run
bootstrap on `!stateExists`, a *present but corrupt* `state.json` is read as
`null` on every run, returns not-active every run, and never gets repaired. The
plugin goes silently dead forever — until the user notices feynman stopped
injecting and manually deletes the file. A missing file self-heals (bootstrap);
a corrupt file does not. That asymmetry is the defect.

ADR-0004 justified the fail-safe with the bare-primitive case (`42`), which is
unreachable in practice (nothing writes a primitive). The reachable cause of
corruption — a partial write, a disk fault, a hand-edit with a trailing comma —
is exactly the case the fail-safe strands.

## Decision

On corrupt `state.json`, `reconcileState` self-heals: rename the unreadable file
to `state.json.bak` (best-effort — a failed rename does not block recovery), then
bootstrap default state and activate, the same path as first run. Both hooks
recover on the next session.

`doctor` reports a leftover `state.json.bak` as an informational line, so the
reset is visible on demand without the hooks writing to stderr or polluting the
assistant context.

## Considered options

- **Keep the fail-safe (ADR-0004)** — conservative, never overwrites user data,
  but leaves the plugin silently dead. Rejected: a corrupt file holds no
  recoverable data, and silent death is the worse failure mode.
- **Visible-only (doctor warns, file untouched)** — preserves the file, but the
  user must fix it by hand and the plugin stays dead until they do. Rejected:
  self-heal with a `.bak` keeps the bytes *and* recovers automatically.

## Consequences

- A user who deliberately disabled feynman (`enabled=false`) and then hit a
  corrupt file is re-enabled on the next session: the prior `enabled` is
  unrecoverable from corrupt bytes, so it resets to the default (`true`). The
  `.bak` preserves the original content but not the intent.
- `state.json.bak` is overwritten if corruption recurs, and persists after
  recovery (a permanent doctor info line). Acceptable: corruption is rare and a
  stale backup is harmless.
- ADR-0004's "corrupt JSON → flag unlinked, not active" behaviour change and its
  pinning tests are inverted: corrupt now injects and keeps the flag. The valid
  `enabled=false` unlink rule is unchanged.
- The raw `readState` doctor checks (e.g. the bare-primitive `'enabled' in state`
  check) are unaffected — they never route through `reconcileState`, so a
  primitive `state.json` is still reported as invalid by `doctor` without being
  self-healed underneath it.
