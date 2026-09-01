---
status: accepted
---

# Keep feynman Codex-only with compact ports and adapters

## Context

feynman used to carry several client-specific installation paths. That made a
small plugin harder to explain, test, package, and hand to another team. Its
state code also mixed pure interpretation with filesystem persistence, which
blurred the boundary that protects the hook and CLI from configuration drift.

## Decision

The product supports Codex only. The inner core is `rules/` plus
`lib/state/model.ts` and `lib/state/rules.ts`; these modules have no Codex or
filesystem dependency. `bin/commands/` owns use cases. `bin/adapters/` owns
Codex configuration, hook-command construction, filesystem utilities, and the
single state-I/O gateway. `hooks/feynman-session-start.ts` is the outer Codex
event adapter.

We deliberately do not add interfaces, repositories, or service classes that
have one implementation. The core never imports an outer layer, adapters never
import commands, commands do not import other commands, and state I/O crosses
`bin/adapters/state-store.ts`. That is the dependency rule enforced by
structure and tests.

## Consequences

The installation surface is one predictable path: `~/.codex`. A breaking major
release is appropriate because retired client targets and their hook metadata
are no longer shipped. Future integrations must be separate adapters and need a
new architecture decision; they cannot be added as branches inside commands or
the state core.
