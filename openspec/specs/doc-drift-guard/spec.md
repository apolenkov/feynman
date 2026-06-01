# doc-drift-guard Specification

## Purpose
TBD - created by archiving change refresh-deps-and-doc-drift-guard. Update Purpose after archive.
## Requirements
### Requirement: Superseded toolchain contract is blocked on live surfaces

The documentation gate `scripts/check-docs.ts` (run in CI via `npm run test:docs` and `npm run ci`) SHALL fail with a non-zero exit code when a superseded toolchain contract phrase appears on a live surface.

The superseded phrases are the fixed set `CommonJS-only`, `CommonJS only`,
`Node >= 18`, `Node.js >= 18`, and `no build step`. Live surfaces are all tracked
text files EXCEPT the decision records under `docs/adr/`, `CHANGELOG.md`, and
`openspec/changes/`, plus the guard script `scripts/check-docs.ts` itself (which
holds the phrases as its source-of-truth constants and would otherwise flag
itself).

#### Scenario: Stale phrase on a live surface fails the gate

- **WHEN** a tracked file outside the decision-record paths (e.g. `install.sh`
  or `AGENTS.md`) contains `Node >= 18`
- **THEN** `npm run test:docs` exits non-zero and names the offending file and phrase

#### Scenario: The same phrase inside a decision record passes

- **WHEN** `CommonJS-only` or `no build step` appears only inside `docs/adr/`,
  `CHANGELOG.md`, or an `openspec/changes/` proposal that quotes it as superseded
- **THEN** `npm run test:docs` passes — decision records are excluded by design

#### Scenario: A clean tree passes

- **WHEN** no superseded phrase appears on any live surface
- **THEN** `npm run test:docs` passes with no drift findings

### Requirement: Forbidden phrases are a single named constant

The forbidden-phrase set and the excluded decision-record paths SHALL be defined
as named constants in `scripts/check-docs.ts`, not inlined as magic strings at
the call site, so the contract being enforced is auditable and editable in one
place.

#### Scenario: Auditing the enforced contract

- **WHEN** a maintainer opens `scripts/check-docs.ts`
- **THEN** the full list of forbidden phrases and excluded paths is readable as
  named constants without tracing through scan logic

