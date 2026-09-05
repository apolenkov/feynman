# Repository quality and product usefulness

This acceptance contract was established before the quality refactor, against
baseline `3d470161b5709da6cad764b23f9e10ae734b14df`. It includes the user's
clarifications: prove usefulness and reconsider the delivery form. Research
sources and applicability decisions belong in `docs/quality-research.md`.
The 2026-09-05 user-requested implementation re-audit adds the binding
[S01–S09 strict-code contract](strict-code.md), including exact lint presets,
immutable command decisions and individually justified local mutation.
The subsequent 2026-09-05 user clarification makes accurate whole-text-to-ASCII
transformation the product objective and authorizes corrective iterations.
The [ASCII transformation protocol](../../../evals/ascii-transformation-protocol.md)
now governs Q03 and the corresponding live Q02/Q04 checks. The earlier paired
comparison below is retained as a historical failed acceptance contract; it is
not retroactively passed or rerun merely to beat its score ceiling.

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
| Q03 | Contract accurately transforms text into readable diagrams | Complete source-fact preservation and unambiguous rendered relationships under the ASCII transformation protocol; baseline comparison is reported separately |
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

## Requirement: Accurate ASCII explanations

For whole-text transformations, every supplied fact within the requested scope
SHALL survive in the rendered result, with zero invented or changed facts.
Relationships SHALL retain identities, type, direction or its uncertainty,
conditions, negation, and conjunctive or alternative prerequisites. A graph
SHALL NOT become an apparent tree by losing shared nodes or return edges.
Width SHALL be checked in display columns against the supplied budget.

### Scenario: Independent output reconstruction

- GIVEN source texts, atomic facts and reader questions frozen before generation
- WHEN the native skill and actual installed hook produce the diagrams
- THEN an independent reviewer reconstructs each diagram without the source
- AND the reconstructed facts are compared with the complete frozen fact set
- AND ambiguous connectors and unsupported prose are treated as defects
- AND corrupted control diagrams demonstrate the review can detect semantic errors.

### Scenario: User intent and settings

- WHEN the user explicitly requests an ASCII diagram
- THEN intensity and output style do not suppress that requested diagram
- AND the requested width is respected without removing facts
- AND ordinary prose-only and applicable suppression requests remain diagram-free.

The complete task counts, delivery evidence, negative controls and reporting
rules live in the linked protocol. This measures correctness and structural
answerability on the frozen tasks, not human reading speed or universal model
reliability. New failures SHALL be retained and addressed with source changes;
criteria SHALL NOT be relaxed after seeing outputs to obtain a pass.

## Historical requirement: Useful explanations

The system SHALL be evaluated against an unassisted baseline, not against the
presence of diagram characters. The initial comparison SHALL retain all 20
cases in `evals/evals.json`, with frozen, factual task inputs replacing vague
or time-dependent assumptions before any model outputs are collected.

### Scenario: Paired evaluation (revised 2026-09-05)

- GIVEN the unchanged 20 original tasks plus 12 new tasks in `evals/usefulness.json`
- AND the same model/version, settings, task inputs and isolated environment
- WHEN each task runs once with no Feynman, skill-only, and hook Contract (96 answers)
- THEN retain every response, failure, elapsed time and available token count
- AND record the exact source revision, prompt hashes and runner version
- AND randomize anonymous answer pairs for review.

The review rubric scores factual preservation, answerability of a task-specific
comprehension question, readable structure, and unnecessary content separately.
Each score uses 0 (fails), 1 (partial), or 2 (satisfies). Criteria and answer keys
must be fixed before generation. Diagram presence alone earns no credit.

Acceptance requires zero material factual errors, zero explicit-instruction
violations and no factual regression; all suppression cases must avoid
unnecessary visuals. Original tasks retain their factual, intent, suppression
and overall comprehension/readability nonreduction gates. On the 12 new tasks,
the standalone skill, designated as primary before generation, must improve
the combined comprehension/readability score on at least 7 tasks and not reduce
its overall average. Hook results are separate; both deliveries must satisfy
all hard factual and intent gates. A usefulness claim for hook additionally
requires its own 7-of-12 and nonreduction pass. The two task sets are not pooled.
Report ties and failures, total/per-case tokens, output length and latency;
unavailable usage must be marked unavailable. This is a project acceptance
experiment, not a claim of statistically established benefit for all users.

The user authorized a revised comparison and fewer experiments on 2026-09-05.
This explicitly transfers the majority gate from the original tasks to the new
12 and reduces three repetitions to one. It does not retroactively pass earlier
runs, whose failures remain in `docs/evaluation-fa0d2d5.md` and
`docs/evaluation-72c6eb9.md`. The complete frozen protocol is
[`evals/protocol-v2.md`](../../../evals/protocol-v2.md).

### Scenario: The current design fails the comparison

- WHEN a candidate does not meet the frozen rubric
- THEN retain the failure and request a product decision before any further experiment
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
