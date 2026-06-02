> **DRAFT — pending review**

## Why

The `diagram-lint` capability (`bin/feynman-lint`) enforces 15 rules (L01–L15) on ASCII
Visuals produced by the assistant, but until now there has been no recorded contract for what
those rules check. Anyone changing a rule, adding a Trigger, or building a consuming tool
has no normative source: they must read `lib/lint/rules.ts` directly and hope it matches
the intent.

This change documents the shipped behavior as a contract so the rules are fixed, reviewable,
and traceable back to their rule IDs in source.

## What Changes

- Add the `diagram-lint` capability spec at `specs/diagram-lint/spec.md`, documenting all
  15 lint rules across eleven requirement groups plus one CLI-behavior requirement: box-closure
  geometry (L01), tree characters (L02), arrow-style consistency (L03), table column widths
  (L04), flow integrity (L05), priority scale completeness (L06), format-exclusivity (L07),
  frame geometry (L08/L09), mixed-script detection (L10), frame-economy (L11/L12/L13/L15),
  blank-line separation (L14), and CLI behavior (flags, exit codes).
- No behavior change. The hook, rules file, linter CLI, and autofix are not modified.

## Non-goals

- Not changing any rule logic — this is documentation of shipped behavior as a contract.
- Not adding new rules.
- Not re-litigating domain vocabulary — `CONTEXT.md` is the source of truth; specs reuse it.
- Not archiving this change — it is a DRAFT for human review.

## Capabilities

### Added Capabilities

- `diagram-lint`: lint rules L01–L15 — all constraints the linter enforces on rendered
  Visuals, with severities and fix guidance.

## Impact

- New: `openspec/specs/diagram-lint/` (on archive).
- No source files modified outside this change directory.
- Source of truth grounding: `lib/lint/rules.ts`, `bin/feynman-lint.ts`.
