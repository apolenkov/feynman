## Why

feynman shipped through v1.2.1 under the GSD planning system (`.planning/`), which was retired on
2026-06-01 in favor of OpenSpec — the same planning system the sibling repos use. After the
retirement, OpenSpec was initialized but empty: `openspec/specs/` had no capability specs, so the
shipped behavior carried **no recorded contract**. This change establishes that baseline so the
behavior is durably fixed, not just living in code.

It also banks the scaffolding produced alongside the migration: the `/CONTEXT.md` domain glossary
(Structure, Trigger, Visual, Intensity) and the Matt Pocock `## Agent skills` config
(`docs/agents/`), so future specs and skills reuse the same vocabulary.

## What Changes

- Add the core `diagram-rules` capability spec: the Intensity tiers, the Structure→Visual Trigger
  mapping, and the injection Contract (classify → channel/amplify/suppress, one primary Visual,
  smallest-first ladder). This is documenting already-shipped behavior as a contract.
- Establish the remaining baseline capabilities as follow-up tasks (rules-injection lifecycle,
  diagram-lint L01–L14, plugin-install CLI) so the full surface is recorded.
- Record key already-made decisions as ADRs (GSD→OpenSpec migration; toolchain contract — TS +
  packaging build, zero runtime deps, ADR 0001; SessionStart over UserPromptSubmit for injection).

## Non-goals

- No behavior change. This is documentation of shipped behavior as an OpenSpec contract; the hook,
  rules file, linter, and CLI are not modified.
- Not re-litigating the domain vocabulary — `/CONTEXT.md` is the source of truth; specs reuse it.
- Not establishing every capability in one pass — `diagram-rules` lands here; the rest are tracked
  as tasks to keep this change reviewable.

## Capabilities

### Added Capabilities

- `diagram-rules`: the Intensity tiers, Structure→Visual Trigger mapping, and injection Contract.

## Impact

- New: `openspec/specs/diagram-rules/` (on archive).
- New: `/CONTEXT.md`, `docs/agents/*` (already written this session).
- Source of truth grounding: `rules/feynman-activate.md`, `lib/lint/rules.ts`, `hooks/`.
- Follow-up specs (tracked in tasks): `rules-injection`, `diagram-lint`, `plugin-install`.
