---
status: accepted
---

# Consolidate state I/O behind a feynman-state store

> **Amended by [ADR-0005](0005-self-heal-corrupt-state.md):** the corrupt-JSON
> fail-safe described below (not active, flag unlinked, file untouched) is
> superseded. Corrupt `state.json` now self-heals — backup to `state.json.bak`,
> bootstrap default, activate. The rest of this ADR stands.

`lib/feynman-state.ts` grows from a schema-and-extraction module into the single
owner of `state.json` + `.feynman-active` flag I/O. Before this change the module
exported only the `FeynmanState` type, `DEFAULT_STATE`, and `readRulesForIntensity`;
the actual *policy* — path resolution, first-run bootstrap, flag/`enabled`
reconciliation, and corrupt-JSON fail-safe — was open-coded across seven sites
(both hooks plus four reads and a bootstrap in `bin/feynman.ts`).

## Context

The two injection hooks implemented the same end-state policy with different
control flow (`feynman-session-start.ts` reads state-first, the legacy
`feynman-activate.ts` reads flag-first and re-reads state). The CLI re-derived
the same merge-with-`DEFAULT_STATE` read in `bootstrapState`,
`installOpenCodeTarget`, and twice in `cmdDoctor`. The bug fixes that matter
(#35713 flag↔state race, corrupt-JSON fail-safe) lived in this duplicated
calling code, so a fix in one hook did not reach the others. The two hooks even
disagreed on corrupt-state handling: `session-start` unlinked the flag
(self-heal), `activate` left it dangling — which makes `doctor` check #6
(flag matches state) report a spurious failure on the `activate` path.

## Decision

The store exposes three functions, all parameterised by `rootDir` (supplied by
hooks via `FEYNMAN_HOME` and by the CLI via `targetConfig(t).rootDir`):

- `readState(rootDir): FeynmanState | null` — pure, no side effects; a **raw**
  `JSON.parse` (no `DEFAULT_STATE` merge), `null` on a missing or corrupt file.
  Keeping it raw preserves `doctor` check #4 (`'enabled' in state`), which would
  silently always-pass against a defaulted object. For `doctor` and install
  introspection.
- `reconcileState(rootDir): { state, active }` — the mutating policy: bootstrap
  default state if absent, merge with `DEFAULT_STATE`, reconcile the flag with
  `enabled`, fail-safe on corrupt JSON; for both hooks.
- `writeState(rootDir, state): void` — for the `activate` injection counter and
  CLI bootstrap.

The mutating entry point is named `reconcileState`, not `loadState`, so the
interface honestly signals that it writes and deletes files (an interface
includes its side effects, not just its return type).

`reconcileState` implements **one canonical rule** for both hooks: *not active +
flag present → unlink the flag*. It preserves #35713 (flag **absent** +
`enabled=false` → flag is not recreated, `active=false` — both hooks already
agreed here). It changes the legacy `activate` hook in the two cases where it
previously left a present flag dangling — both instances of the canonical rule:

1. **corrupt `state.json`** — `activate` did `catch → exit(0)`; `session-start`
   unlinked the flag.
2. **valid `state.json`, `enabled=false`, flag present** — `activate`'s flag
   block is gated on `!flagExists`, so with the flag present it skips to
   `if (!state.enabled) exit(0)` and never touches the flag; `session-start`
   unlinked it.

Both cases are the `active=false` + flag-present class that `doctor` check #6
(flag matches state) is meant to catch — reachable by a `/feynman off` race or a
manual edit.

A **third** `activate` behaviour change falls out of the same convergence, in the
opposite direction (no-injection → bootstrap + inject):

3. **`state.json` absent, flag present** — the legacy `activate` gated bootstrap
   on `!flagExists`, so with the flag present it skipped bootstrap and the step-3
   `JSON.parse` threw `ENOENT → exit(0)` (no state, no injection). `reconcileState`
   gates first-run on `!stateExists` alone, so it now bootstraps default state and
   activates. This is *not* an instance of the canonical unlink rule — it is
   `activate` adopting `session-start`'s first-run self-heal (which already
   bootstrapped here). It is the most user-visible of the three, so it is pinned
   by its own test.

The `injections` counter stays a caller concern (`activate` only — incrementing
it in `reconcileState` would inflate the count on every SessionStart and change
what the metric means; see ADR-0003), but its write now routes through
`writeState` so every `state.json` mutation crosses the one seam.

## Considered options

- **Primitives only** (`readState`/`writeState`/`reconcileFlag`, policy left in
  callers) — lowest risk, but the bootstrap/flag/corrupt policy and its bugs
  stay duplicated. Rejected: a shallow seam that does not concentrate the
  complexity it was meant to hide.
- **Superset with parameters** (`reconcileState(rootDir, { unlinkFlagOnCorrupt })`)
  — keeps each hook byte-for-byte, zero behaviour change, no test churn. Rejected:
  the incidental divergence moves *inside* the seam as flag baggage instead of
  disappearing; depth is lower.
- **Hooks only, CLI keeps its own state I/O** — smaller blast radius (no
  `cli.test.ts` churn), but the four duplicated CLI reads remain. Rejected: less
  leverage; `doctor` keeps open-coding the merge it could borrow.

## Consequences

- Three observable behaviour changes on the `activate` path, all from converging
  it onto `session-start`. Two are instances of the canonical unlink rule (not
  active + flag present → unlink): (1) corrupt JSON, and (2) valid `enabled=false`.
  The third (3) is the first-run self-heal: `state.json` absent + flag present now
  bootstraps and injects (was: `exit(0)`, no state). `session-start` already did
  all three. Pinned by three new `activate` tests (corrupt + present flag → flag
  unlinked; valid `enabled=false` + present flag → flag unlinked; absent state +
  present flag → bootstrap + inject). #35713 is re-verified separately (flag
  **absent** + disabled → flag not recreated), since that case is unchanged.
- `doctor` check #6 is now self-consistent for the whole `active=false` +
  flag-present class (corrupt or disabled), not just corrupt, on every target.
- The change touches `cli.test.ts` and `hook.test.ts`; happy-path output
  (plain stdout for `session-start`, JSON-wrapped `additionalContext` plus the
  `injections` increment for `activate`) is unchanged.
- `readState` returns `null` for a non-object JSON primitive (e.g. a bare `42`),
  not the raw value, so callers can safely `'enabled' in state`. The pre-seam
  `doctor` wrapped parse + check in one `try/catch`; concentrating the parse in
  `readState` means the guard must live there. Pinned by a `cli.test.ts` doctor
  test on a primitive `state.json`. This also **unifies** behaviour the seam
  previously left divergent: a bare primitive is now corrupt for every consumer,
  where the old `session-start`/`bootstrapState` spread it into `DEFAULT_STATE`
  and treated it as enabled. The input is unreachable in practice (nothing writes
  a bare primitive); the fail-safe is the more correct reading.
- Path resolution is owned by the store: `statePaths(rootDir)` is exported and the
  CLI's `targetConfig` spreads it instead of re-hardcoding `.feynman` /
  `state.json` / `.feynman-active`.
- Any future caller that needs state should cross `readState`/`reconcileState`/
  `writeState` rather than open-coding `JSON.parse(fs.readFileSync(statePath))`.
- This does not violate ADR-0003: the `UserPromptSubmit` hook and its
  `injections` counter are retained; only the counter's write path moves into
  the store.
