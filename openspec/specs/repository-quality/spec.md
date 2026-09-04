# Repository quality and product usefulness

This acceptance contract was established before the quality refactor, against
baseline `3d470161b5709da6cad764b23f9e10ae734b14df`. It includes the user's
clarifications: prove usefulness and reconsider the delivery form. Research
sources and applicability decisions belong in `docs/quality-research.md`.
The 2026-09-05 user-requested implementation re-audit adds the binding
[S01–S09 strict-code contract](strict-code.md), including exact lint presets,
immutable command decisions and individually justified local mutation.

## Requirement: Bounded, evidence-based acceptance

The system SHALL satisfy each applicable requirement below on the same final
source revision. Evidence SHALL identify commands, runtime versions, artifacts,
and actual outcomes. Missing live evidence, skipped tests, and infrastructure
failures SHALL remain unproven. Existing coverage scope and public behavior
SHALL NOT be weakened to obtain a pass.

### Scenario: Final acceptance

- WHEN the quality work is assessed
- THEN every ID has direct evidence or a source-backed non-applicability reason
- AND no mandatory defect remains open
- AND publishing or account changes are separately authorized.

## Acceptance matrix

| ID | Required outcome | Acceptance evidence |
|---|---|---|
| Q01 | Delivery form follows the use case | Document skill-only, plugin, and hook/CLI tradeoffs; independently install and exercise the chosen delivery paths |
| Q02 | Skill performs visual explanation without setup side effects | A clean plugin-only installation can answer an explanation request without downloading a CLI or changing user state |
| Q03 | Contract improves answers | Paired, blind-reviewed live Codex evaluation under the protocol below |
| Q04 | Contract respects user intent | Explicit prose-only requests and suppression cases pass; all intensity blocks have checked size budgets |
| Q05 | Types and style are enforced | Strict TypeScript, type-aware ESLint and formatter checks pass with zero warnings across first-party code and tests |
| Q06 | Core is pure and inputs immutable | Readonly public core data contracts; tests with frozen inputs; automated dependency rules exclude I/O and outer layers |
| Q07 | Complexity remains justified | Review core and CLI ownership; no dead compatibility scaffolding, circular dependencies, or unexplained rule suppressions |
| Q08 | State transitions are safe | Invalid commands do not write; corrupt/missing state, disabled state, repeated install/uninstall and unrelated configuration preservation are tested |
| Q09 | Tests cover real behavior | CLI, hook, parser, lint, autofix, state and packaging positive/negative tests pass; autofix preserves valid input and converges |
| Q10 | Coverage is honest | At least 95% line coverage; explicitly enumerate production files and uncovered files; inspect critical negative branches, not only totals |
| Q11 | Package is reproducible | Two clean builds from the same source/dependencies produce identical package bytes; package content and isolated lifecycle smoke tests pass |
| Q12 | CI matches local gates | npm ci and npm run ci pass on supported runtimes; workflow runs the same required gates; unavailable platform runs are not claimed |
| Q13 | Supply chain is controlled | Lockfile install, dependency audit, least-privilege workflows, immutable action references, reviewed update policy, no runtime npm dependencies |
| Q14 | Documentation reflects behavior | Requirements, architecture, CLI help, skill, README and release instructions agree; links and examples are checked |
| Q15 | Release and maintenance are operable | Version consistency, artifact verification, release rehearsal, recovery instructions, security reporting and contribution workflow are verified |

## Requirement: Useful explanations

The system SHALL be evaluated against an unassisted baseline, not against the
presence of diagram characters. The initial comparison SHALL retain all 20
cases in `evals/evals.json`, with frozen, factual task inputs replacing vague
or time-dependent assumptions before any model outputs are collected.

### Scenario: Paired evaluation

- GIVEN at least 20 frozen tasks spanning structured explanations and suppression
- AND the same model/version, settings, task inputs and isolated environment
- WHEN each task runs three times with no Feynman, skill-only, and hook Contract
- THEN retain every response, failure, elapsed time and available token count
- AND record the exact source revision, prompt hashes and runner version
- AND randomize anonymous answer pairs for review.

The review rubric scores factual preservation, answerability of a task-specific
comprehension question, readable structure, and unnecessary content separately.
Each score uses 0 (fails), 1 (partial), or 2 (satisfies). Criteria and answer keys
must be fixed before generation. Diagram presence alone earns no credit.

Acceptance requires no factual or explicit-instruction regression; all
suppression cases must avoid unnecessary visuals. On structured tasks, the
selected delivery form must improve the combined comprehension/readability
score on a majority of task-level averages and not reduce its overall average.
Report ties and failures, total/per-case tokens, output length and latency;
unavailable usage must be marked unavailable. This is a project acceptance
experiment, not a claim of statistically established benefit for all users.

### Scenario: The current design fails the comparison

- WHEN a candidate does not meet the frozen rubric
- THEN change the Contract or delivery design and rerun the same task set
- AND retain the failed run as evidence
- AND do not substitute unit tests or synthetic answers for live outcomes.

## Requirement: Proportionate implementation

The system SHALL remain Codex-only and use TypeScript for first-party code,
with no runtime npm dependencies. Immutable transformations are the default.
Local algorithm or I/O-buffer mutation requires the named, bounded justification
and enforcement in `strict-code.md`; this is not permission for mutable command
mode flags or configuration assembly. Global mutable defaults, caller-owned data
mutation and hidden state changes are not permitted.

### Scenario: Scope boundary

- WHEN implementation would require a breaking public change, a paid resource,
  changing real user configuration, external writes, or weaker acceptance
- THEN prepare the concrete change and request the necessary user decision
- AND continue independent authorized local work.
