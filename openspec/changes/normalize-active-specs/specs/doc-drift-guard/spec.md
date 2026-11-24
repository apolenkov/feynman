## MODIFIED Requirements

### Requirement: Superseded toolchain contract is blocked on live surfaces

The documentation gate `scripts/check-docs.ts` SHALL exit nonzero when a
superseded toolchain phrase appears in live tracked text. Live surfaces exclude
`docs/adr/`, `CHANGELOG.md`, `openspec/changes/` and the guard script itself.
CI SHALL run it through `npm run test:docs` and `npm run ci`.

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

#### Scenario: The fixed set of superseded phrases

- **WHEN** live tracked text includes any exact phrase in the fixed set
  `CommonJS-only`, `CommonJS only`, `Node >= 18`, `Node.js >= 18`, or
  `no build step`
- **THEN** the gate fails and identifies the file and the phrase
- **AND** listing the phrases in the guard's source-of-truth constants does
  not itself trigger a finding
