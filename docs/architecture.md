# Architecture

feynman is a small Codex-only plugin with a compact Onion / Ports-and-Adapters
shape. The core has no knowledge of Codex or the filesystem; commands and
adapters depend on that core, never the other way around.

```text
Core — no I/O
  rules/feynman-contract.md          Contract: Structure, Trigger, Visual
  lib/state/model.ts                 state shape and pure style formatting
  lib/state/rules.ts                 intensity parsing and tag validation
                 ▲
Application
  bin/commands/                      install, doctor, state, uninstall,
                                     bootstrap, examples, lint
                 ▲
Adapters — Codex and filesystem boundary
  bin/adapters/codex-config.ts       ~/.codex/hooks.json
  bin/adapters/codex-hook.ts         command construction
  bin/adapters/state-store.ts        ~/.codex/.feynman state and flag
  hooks/feynman-session-start.ts     SessionStart input and stdout
                 ▲
Runtime
  ~/.codex/hooks.json
  ~/.codex/.feynman/state.json
```

There are deliberately no empty domain, service, or repository layers. The core
never imports an outer layer; adapters never import commands. Commands
coordinate the concrete local adapters because this small product has one
runtime, so adding one-implementation interfaces would obscure rather than
protect the design. `state-store.ts` is the sole state-I/O gateway, so a command
or hook cannot reimplement JSON, flag, or recovery policy.

## SessionStart flow

Codex invokes the registered `SessionStart` hook for `startup`, `resume`,
`compact`, and `clear`:

```text
Codex event
  → hooks/feynman-session-start.ts
  → validate session input
  → read/reconcile ~/.codex/.feynman/state.json
  → select <intensity name="lite|full|ultra">
  → write best-effort local counter
  → stdout: plain-text Contract
```

Missing state is bootstrapped; corrupt state is backed up and recovered to a
default. Disabled state emits nothing, and a stale flag is reconciled. The hook
never reads prompt or response content.

## CLI boundary

`bin/feynman.ts` is only an argument parser and dispatcher. Command behavior is
under `bin/commands/`; Codex configuration, hook construction, JSON I/O, and
filesystem helpers are under `bin/adapters/`. `bin/cli/` contains presentation
only. There is no target-selection option.

```text
feynman install   → ~/.codex/hooks.json + ~/.codex/.feynman/
feynman doctor    → read-only health report
feynman state     → show or change local state and active flag
feynman uninstall → remove feynman hook and active flag; keep state.json
feynman lint      → lib/lint/ parser → rules → reporter
```

The native marketplace package under `plugins/feynman/` exposes the Codex
skill's self-contained visual-explanation instructions. The npm package supplies
the linter, preferences CLI and compiled hook. The optional hook injects the
separately maintained Contract; both delivery paths support Codex only.

## Lint pipeline

The linter is a sibling application path, independent of hook state:

```text
markdown/stdin → lib/lint/parser.ts → lib/lint/rules.ts → reporter
```

Both `lib/state/` and `lib/lint/` are pure core modules. ESLint permits only
static imports of sibling core modules and rejects runtime imports, outer-layer
dependencies, package metadata reads, and ambient I/O. Tests exercise the gate
with prohibited imports and verify that rules and autofix accept frozen inputs.
Input node fields, frame rows and options are readonly; local algorithm buffers
remain mutable and never alias caller-owned arrays.

Autofix shares frame detection with lint, but detection does not authorize
discarding content. A frame containing non-empty unclassified rows is skipped
by frame alignment and conversion so the user can repair it without text loss.

Rules L01–L15 validate the rendered Visual after it exists. The injected
Contract chooses a Visual; the linter checks its layout. `npm run lint` is the
product linter, while `npm run eslint` checks TypeScript source.

## State contract

```json
{
  "enabled": true,
  "intensity": "full",
  "output_style": "full",
  "injections": 0
}
```

State is local to Codex, user-owned, and intentionally small. `intensity`
controls the size of the injected Contract; `output_style` controls the visual
suffix; `injections` is an informational local counter. The schema is consumed
by the hook, CLI, and Codex skill, so a rename requires a coordinated change.
The supported mutation boundary is the CLI:

```text
feynman state [on|off|lite|full|ultra]
feynman state style short|middle|full
feynman status
```

The skill never writes state files directly.

The store reads the advisory counter from `.feynman/injections`, using the
value in `state.json` as its initial value when no valid counter exists.
SessionStart updates only this bookkeeping file; it never rewrites preferences
to increment a counter. A late hook therefore cannot undo `state off` or an
intensity/style change. Concurrent counter increments may coalesce; this is
usage information, not an exact event ledger. CLI status exposes the merged
logical state through the same store.

Settings, state and counter writes stage complete bytes in the destination
directory and rename them into place. Write or rename failures preserve the
previous file; existing permissions and symlink destinations are retained.

## Packaging

TypeScript source is checked in. Development runs on Node.js 22.18+ with
Node's built-in type stripping; `npm run build` creates the compiled `.js`
package for consumers. The published package has zero runtime npm
dependencies.

See [CONTEXT.md](../CONTEXT.md) for domain vocabulary and
[docs/adr/0001-typescript-source-with-packaging-build.md](adr/0001-typescript-source-with-packaging-build.md)
for the source/package trade-off.
See [ADR-0006](adr/0006-codex-only-ports-and-adapters.md) for the boundary
decision.
