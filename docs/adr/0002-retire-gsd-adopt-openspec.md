---
status: accepted
date: 2026-06-01
---

# Retire GSD planning system, adopt OpenSpec

feynman shipped through v1.2.1 under the GSD planning system, with plans and
tasks stored in `.planning/`. On 2026-06-01 the `.planning/` directory was
retired and OpenSpec was adopted as the single planning system, consistent with
the sibling repos that already use it.

## Context

The GSD system tracked features and tasks but produced no durable behavioral
contract: the shipped behavior of the hook (Intensity tiers, Structure→Visual
Trigger mapping, injection Contract) existed only in code, with no recorded
specification that could be verified, referenced by agents, or used to guard
against drift.

At the same time the CONTEXT.md domain glossary (Structure, Trigger, Visual,
Intensity) and the `docs/agents/` scaffolding were introduced, establishing the
vocabulary that specs and agent skills should use. OpenSpec — already in use
across sibling repos — is designed to record exactly this: durable capability
specs tied to a domain vocabulary, plus a structured change process.

The migration was a pure documentation and planning-tool switch; no hook, rules
file, linter, or CLI behavior was changed.

## Decision

Adopt OpenSpec as the planning and specification system for feynman.

- Planning work lives in `openspec/changes/` (one directory per change).
- Capability specifications live in `openspec/specs/` (one directory per
  capability, e.g. `diagram-rules`).
- The `AGENTS.md` canonical-sources table records `openspec/` as the home for
  planning and specs.
- `.planning/` is retired; no new content goes there.

## Considered options

- **Keep GSD** — familiar, already present. Rejected: leaves shipped behavior
  unspecified and breaks consistency with sibling repos.
- **Adopt OpenSpec (chosen)** — gives durable capability specs, a structured
  change process, and a shared vocabulary (Structure, Trigger, Visual, Intensity
  from CONTEXT.md). Matches the sibling repos so agents and contributors operate
  identically across the project family.

## Consequences

- The first OpenSpec change (`establish-feynman-openspec-baseline`) backfills
  the behavioral contract for already-shipped capabilities, starting with the
  `diagram-rules` spec.
- Future behavior changes require a capability spec entry or a change record in
  `openspec/` before the code lands.
- Agents consulting `docs/adr/` will find this record as the authoritative
  statement that `.planning/` is retired; they must not create new content there.
- Specs reuse the CONTEXT.md vocabulary exactly — Structure, Trigger, Visual,
  Intensity — with no synonyms.
