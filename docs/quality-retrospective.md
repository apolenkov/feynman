# Quality retrospective

Audit date: 2026-09-05. Scope is limited to the user's requirements for code
quality, simplicity, immutability, strictness, and acceptance. Session history
was filtered to records whose `session_meta` working directory was this
repository in the 2026-09-04 and 2026-09-05 date partitions. The opaque IDs below
are session/thread IDs; timestamps are UTC. Live experiment scores and blinded
evaluation data were not inspected.

## Finding

The repository had a green configured ESLint run, but the evidence did not
prove the stronger quality contract that was requested. At the audited
pre-fix revision `fa0d2d5521ae7f21576d8f67152a8cc9d69dc504`,
`bin/feynman-lint.ts:46-88` parsed arguments by mutating six local flags (`useJson`, `useStrict`,
`useFix`, `useExplain`, `filePath`, and `useStdin`). The assignments are at
`bin/feynman-lint.ts:56-87`. This is an observed local-state mutation; it does
not demonstrate mutation of caller-owned input. The targeted command
`npx --no-install eslint bin/feynman-lint.ts --max-warnings=0` exited 0 at that
revision because the configured rule set did not forbid this pattern.

The user's initial request in session
`01a06de2-ad58-7913-bd11-f8e47ba65009` at `2026-09-04T19:26:47Z` explicitly
asked for a very strict code-quality standard and code that is simple and as
non-mutable as possible. The later complaint at `2026-09-04T22:10:46Z` named
the six flags directly. The assistant then acknowledged at
`2026-09-04T22:10:55Z` and `2026-09-04T22:11:14Z` that the review had checked
input mutation but had missed the quality of the argument parser itself.

## What the related sessions establish

| Evidence | What was reported | Retrospective reading |
|---|---|---|
| `01a06de5-4df9-7ff2-8458-a34f18bac463`, `2026-09-04T19:31:49Z` | The research pass listed type-aware strict lint, branch coverage, and other acceptance gaps as work still required. | The initial research correctly identified the risk, but its requirement was not converted into a final, rule-level gate. |
| `01a06de2-ad58-7913-bd11-f8e47ba65009`, `2026-09-04T19:49:12Z` and `2026-09-04T19:51:16Z` | The assistant reported type-aware lint across first-party TypeScript, zero warnings, and a passing CI run. | Those statements prove only the configured checks. They did not prove an immutable or otherwise deliberately simple parser. |
| `01a06de2-ad58-7913-bd11-f8e47ba65009`, `2026-09-04T22:15:03Z` | After the user's complaint, the assistant reported 301 findings from the full strict `typescript-eslint` set in 57 TypeScript files and said the previous configuration covered only part of it. | This is a direct admission that the earlier “strict” wording was broader than the enforced configuration. It is a historical assistant report, not a fresh count in this document. |
| `01a06e7b-85a1-7710-8c83-4171c9ce5a04`, `2026-09-04T22:17:52Z` | A current-state review confirmed `strict` compiler options and `recommended-type-checked`, while strict and stylistic presets were still disconnected. | This corroborates the configuration-level gap after the mutation was noticed. |

## Lost or weakly translated requirements

1. **“Strict ESLint” has no operational definition.**

   `docs/quality-research.md:83-94` distinguishes recommended, type-checked,
   strict, and stylistic configurations and says to apply the strongest
   compatible configuration deliberately. The active spec compresses that into
   Q05, “Strict TypeScript, type-aware ESLint and formatter checks pass,” at
   `openspec/specs/repository-quality/spec.md:31`. The implementation spreads
   `flat/recommended` and `flat/recommended-type-checked` at
   `eslint.config.mjs:24-30`; it does not spread `flat/strict-type-checked` or a
   stylistic type-checked preset. The effective config has `prefer-const`, but no
   readonly-parameter or immutable-data rule, and `no-param-reassign` is scoped
   to `lib/**/*.ts` at `eslint.config.mjs:87-93`.

   **Inference:** a clean `npm run eslint` was allowed to stand in for a stricter
   property than the configuration actually defined. The official
   [typescript-eslint configuration guidance](https://typescript-eslint.io/users/configs/)
   makes these presets distinct and warns that strict presets are opinionated;
   the project must either select the intended preset set or document every
   deliberate omission.

2. **Immutability is tested at the core boundary, not at the parser boundary.**

   Q06 requires readonly core contracts and frozen-input tests, and
   `tests/core-boundaries.test.ts:98-123` does cover frozen frames, options, and
   diagnostics. The structural guard in `tests/cli-structure.test.ts:1-5` and
   `:70-83` constrains `bin/feynman.ts`, not `bin/feynman-lint.ts`. Nothing in
   the active contract or tests requires the standalone linter's argument
   parser to return an immutable result or explains why six independently
   mutated mode flags are the simplest representation.

   **Inference:** the phrase “local mutation is permitted” in
   `docs/quality-research.md:96-102` was broad enough to admit the exact code
   the user questioned. It should distinguish algorithmic loop/buffer state from
   mutable command-mode state and require a local justification or an immutable
   parse result for the latter.

3. **The coverage report is transparent but not a complete gate.**

   The research note says to enumerate production files and inspect critical
   negative branches (`docs/quality-research.md:110-118`), and Q10 repeats that
   requirement at `openspec/specs/repository-quality/spec.md:37`. The checker
   enumerates the inventory and reports missing records at
   `scripts/check-coverage.ts:177-223`, but it fails only when the aggregate
   line percentage is below 95%; a non-empty `missingProductionFiles` list does
   not fail the command. The current coverage record documents 36 production
   TypeScript files, 29 LCOV records, and seven absent scripts in
   `docs/coverage.md:25-32`.

   **Observed consequence:** an aggregate line result can pass while some
   first-party scripts have no LCOV record. Disclosure is better than silently
   narrowing scope, but it is not positive evidence that the whole declared
   source scope was exercised.

4. **The research and acceptance documents are baseline-bound without a final
   quality re-audit.**

   Both `docs/quality-research.md:3-8` and
   `openspec/specs/repository-quality/spec.md:3-6` name baseline
   `3d470161b5709da6cad764b23f9e10ae734b14df`. The research note's statement at
   `:83-84` that typed linting is absent was accurate for that baseline, while
   the current config now has `recommended-type-checked`. The baseline qualifier
   prevents a literal contradiction, but no final section records the effective
   rule set and the remaining immutability gap at the release candidate SHA.

## Acceptance corrections for the next audit

1. Make Q05 name the exact effective ESLint preset/rule set. If the project
   chooses `flat/strict-type-checked` and stylistic type-checked rules, add
   negative sentinel fixtures that must fail under representative rules. If it
   chooses a smaller compatible set, record each omitted category and its reason;
   “ESLint passes” is not enough.
2. Extend Q06/Q07 with a parser-specific invariant: argument parsing accepts a
   `readonly` argv and returns a readonly value object without mutable mode
   flags, or every retained local mutation has a named reason. Add a structural
   check aimed at `bin/feynman-lint.ts`; the existing `bin/feynman.ts` guard does
   not cover it.
3. Turn coverage inventory disclosure into a decision gate. Require
   `missingProductionFiles` to be empty, or record an explicit reviewed
   exclusion with an owner, reason, and behavior test. Keep critical negative
   branches as named tests rather than relying on the 95% aggregate.
4. Add a final-audit record containing the exact `HEAD`, resolved ESLint config,
   source inventory, command outcomes, and justified exceptions. Rebind the
   baseline observations in the research note instead of using them as current
   acceptance evidence.

## Unresolved questions

- Which exact `typescript-eslint` preset combination is the repository's intended
  “strict” standard, and which rule exceptions are genuinely necessary for this
  small plugin?
- Does the project intend to forbid mutable local command state generally, or
  only caller-owned input mutation and hidden/global state? The current wording
  does not answer this, and that ambiguity enabled the parser gap.
- Is a disclosed production file with no LCOV record acceptable for Q10? The
  current implementation reports the condition but does not define it as pass
  or fail.

## Decisions following the retrospective

The strengthened [implementation contract](../openspec/specs/repository-quality/strict-code.md)
resolves these questions: both full strict and stylistic type-checked presets
apply, immutable command decisions are required, and retained scanner/buffer
mutations need exact reviewed permissions. Coverage inventory is a failing gate;
a missing record cannot be accepted through disclosure alone. Effective-config
sentinel tests and the source-wide mutation guard supplement behavioral tests.
Final source-revision evidence remains necessary; these decisions are not a
claim that acceptance has already passed.
