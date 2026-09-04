# Strict implementation acceptance

This is the strengthened implementation contract requested on 2026-09-05 after
review of `fa0d2d5521ae7f21576d8f67152a8cc9d69dc504`. It supplements Q05–Q10 and
Q14; it does not replace or lower the live evaluation, coverage percentage,
public behavior, or delivery requirements in `spec.md`.

The baseline contains 36 tracked production TypeScript files under `bin/`,
`hooks/`, `lib/`, and `scripts/`. Tests and configuration are also in review
scope. Newly added first-party files join the scope automatically. Generated
packages, dependencies, temporary evaluation evidence, and archived historical
notes are not first-party application source.

## Required outcomes

| ID | Outcome | Required evidence |
|---|---|---|
| S01 | Strictness has an exact definition | Full `flat/strict-type-checked` and `flat/stylistic-type-checked` presets apply to all first-party TypeScript and tests; explicit additional rules and necessary exceptions are documented. Negative sentinel tests prove the effective configuration rejects representative violations. |
| S02 | Native TypeScript execution is checked | Compiler checks include `strict`, exact optional properties, checked indexing, unknown catch errors, all-path returns, side-effect import resolution and erasable-only syntax compatible with the supported Node floor. |
| S03 | Command decisions are immutable | CLI argument parsers accept readonly input, perform no I/O and return readonly discriminated results. Mode selection and report construction return new values instead of modifying several flags or an input/configuration object. Ordering, duplicates, error text and exit status remain behaviorally tested. |
| S04 | Mutation is exceptional and visible | Caller-owned data and shared defaults are never mutated. Pure data transformations use readonly contracts and non-mutating operations. Any retained local scanner, builder or I/O buffer has a named, bounded owner, a concrete linearity/lifecycle reason and a guard preventing permission from spreading to unrelated functions. Replacing `let` with a mutable `const` object does not satisfy this requirement. |
| S05 | Type assertions do not hide missing validation | Unknown external data is validated at its boundary; downstream code retains the validated type. No non-null assertions, unsafe double casts, dummy AST values or blanket rule suppressions substitute for narrowing and valid domain shapes. |
| S06 | Execution failure cannot be success | An internal lint-rule failure is observable and cannot produce `passed: true`. Child process, git-history and write failures preserve their original diagnostics; cleanup completes before exit. |
| S07 | Transformations preserve user information | Autofix retains titles, labels, statuses and unclassified content; Unicode closure and width rules agree. Changelog regeneration preserves older releases and curated Unreleased content and recognizes supported breaking-change notation. Failure after a reversible source write restores the original bytes or reports a failed restoration explicitly. |
| S08 | Coverage includes its declared scope | Every production file has a coverage record or an explicitly reviewed exceptional measurement boundary with a named behavioral test. Missing files and records outside the declared inventory cannot silently inflate the 95% acceptance result. The prior denominator is retained as a comparable baseline; changes in instrumentation are reported explicitly. |
| S09 | Final review is independent and complete | Every production file and each confirmed review finding has a disposition. A fresh reviewer checks implementation and meaningful negative tests, then the primary verifies the evidence and runs final acceptance on one source revision. A passing configured command alone is not an implementation-quality review. |

## Local mutation policy

Immutability is a project design requirement, not a claim that the TypeScript
or JavaScript standards prohibit every assignment. The default is a new value,
a readonly contract and a small, explicit transformation. Local algorithmic
state may be retained only when a specific alternative would obscure the
algorithm, introduce repeated copying or risk unbounded recursion, and the
state cannot escape or alias a caller-owned value. A whole directory's
permission for arbitrary mutation is not an acceptable exception.

Argument mode flags, normalized application state, options, diagnostic records
and configuration merges are not scanner buffers. Their construction must
follow the default immutable policy. Effectful filesystem and process
operations stay at their named adapters or script boundaries.

Each exception record must name the file and function, the operation it permits,
the reason, the owning test and its automated enforcement. New exceptions need
review; unused exceptions must fail the guard rather than become permanent
blanket permissions. Tests may deliberately mutate an owned mock or fixture
when exercising a failure or preservation guarantee, and must restore shared
runtime objects in cleanup.

## Review disposition and non-regression

The finite re-audit on the baseline found F01–F09: title loss in status-frame
conversion, an AST field mismatch in L10, Unicode closure inconsistency,
swallowed rule failures, skipped cleanup, an unperformed highlight rollback,
ignored breaking footers, changelog history deletion, and masked git errors.
Each requires a reproducer and a passing behavioral regression check. The
review also requires better typed configuration boundaries and immutable
command parsing; these are implementation criteria, not invented production
incidents.

Do not remove a public scenario or weaken a threshold to make this contract
pass. A necessary incompatible behavior or acceptance change needs a concrete
user decision. Other authorized fixes continue while that decision is pending.
