# Whole-text ASCII transformation acceptance

This is a new product acceptance contract for the user's clarified purpose:
turn all supplied prose into accurate, readable ASCII/text diagrams. Earlier
usefulness experiments, including the failed 7-of-12 comparison at `3ab9de4`,
remain historical failures. Do not rerun, rescore, pool, or retroactively pass
them. Existing `evals/evals.json` and failure reports remain unchanged.

## Frozen inputs and scope

Use all 14 tasks in `ascii-transformation.json`. Every fact is mandatory;
questions sample multiple relationships but never reduce the factual denominator.
Each task includes genuinely continuous prose, atomic gold claims, two or three
hidden reading questions, and an 80-column budget except A13's 60-column budget.
Gold claims identify their source through the exact source prose and named
entities; compound source sentences are split into independent claims. Audit
that every source assertion is represented before freezing the task file.

The task's `facts` and `questions` are private evaluator inputs. Generation
receives only `prompt`, a blank line, `source`, and a final instruction stating
`Maximum diagram width: {maxColumns} display columns.` Explain that ASCII
means ASCII structural marks with source-language Unicode labels permitted;
preserve names, and use fenced monospaced text for the visual. Do not provide
the gold claims, question answers, expected layout, recovered graph, or this
review protocol to the generator. The same prompt construction applies to all
main conditions. Record the exact template and its hash before generation.

Before the final run, record a clean final source SHA; SHA-256 hashes of this
protocol, task file, unchanged original task file, packaged skill, all hook
instruction blocks and style suffixes, package/install artifacts, generation
runner, prompt template, width checker, recovery instructions and review tools;
Codex/runtime versions; exact exposed model identifier and reasoning setting.
Use the same model and reasoning setting across final conditions. Record when
an immutable provider model-build fingerprint is unavailable. Do not substitute
a new source revision or edited prompt midway through the run.

Local development experiments are authorized separately: label and retain their
inputs, revision, outputs, failures and costs. They are development evidence,
never hidden final attempts. Freeze this final suite before final generation;
retain every final attempt. A changed candidate needs a newly identified,
explicitly reported run, not a silent score-driven retry or selected replacement.

## Final-run denominator: at most 67 answers

| Group | Native plugin | Actual hook | Baseline | Total |
|---|---:|---:|---:|---:|
| All 14 transformation tasks | 14 | 14 | 14 optional | 28 or 42 |
| All 8 original suppression tasks | 8 | 8 | 0 | 16 |
| A02 across 3 intensity x 3 style settings | 0 | 9 | 0 | 9 |
| Total | 22 | 31 | 0 or 14 | 53 or 67 |

Decide whether to include all 14 baseline answers before generation. Do not
select baseline cases after viewing outputs. The 9 setting cases include a
separately recorded full/full case; do not reuse its earlier main answer.
Use one attempt per cell with no selective retries. Stop on a failed generation,
retain it and report the incomplete denominator; a partial run cannot pass.
Record condition order before execution and balance or rotate it across tasks.

Use all eight cases categorized `should-not-trigger` in the unchanged original
task file, IDs 13 through 20, with their exact prompts, factual and explicit-intent
checks. Record those IDs in the frozen manifest; do not choose new cases. This is
a compatibility gate, not a repeat of the old 20-task usefulness experiment.

The main hook condition is enabled with intensity `full` and style `full`.
The setting matrix is every combination of `lite`, `full`, `ultra` and `short`,
`middle`, `full`, using A02 verbatim. A direct request for a diagram must still
produce an accurate diagram with `short`; style may reduce commentary and
decoration, not erase the requested structure. Explicit prose-only requests
and the other applicable suppression instructions continue to take precedence
over automatic visual triggers.

## Real delivery and isolation

Use isolated, owned temporary Codex homes and project directories. Baseline
must not inherit Feynman, unrelated installed skills, hooks, global instructions,
or local preferences. Install the exact frozen native package in the native
condition; retain installation/discovery evidence and a runtime record showing
the skill was activated and its packaged instructions loaded for the request.
Do not simulate native activation by pasting the skill into developer text.
For automatic-discovery tasks, do not replace a discovery failure with an
explicit skill invocation. Fix whether each request uses explicit invocation or
automatic discovery in the run manifest before generation; the 14 native main
tasks must include both paths, with the chosen task IDs recorded in advance.

Install the frozen npm package and genuinely register its SessionStart hook in
the hook condition. Retain hook registration, selected settings, invocation and
emitted instruction evidence. Do not pass the hook Contract as developer text.
Capture native settings/configuration snapshots after installation and before
and after explanation; explanation must not invoke a setup CLI, fetch packages,
or change user preferences. Hook bookkeeping counters may change as documented;
preferences must not. Redact credentials from artifacts. Never touch the real
user's configuration. Missing activation evidence is unproven, not a pass.

Read-only, in-memory calculations on the supplied content, such as checking
display width, are permitted in every condition. They must not fetch task facts,
install software, invoke settings/bootstrap commands, or read or change user
preferences. Record all command and other tool activity. A successful skill
read proves activation independently of a subsequent calculation; neither a
successful process exit nor unchanged settings proves that every tool action was
permitted. Every model tool trace requires an explicit external review against
these restrictions, including commands credited as a packaged skill read and
unclassified activity. Keep that gate missing until reviewed, and reject
prohibited activity even when generation completed successfully.

The hook evaluation may use a transparent observation adapter around the exact
installed command. The adapter must execute that command with the original
stdin and relay its actual stdout/stderr without changing bytes. Freeze and
retain the adapter source/hash, original and wrapped command, trusted definition,
per-call capture and exit/relay status. Require successful emission matching
the selected packaged Contract and style suffix byte-for-byte. Counter growth
alone proves invocation, not emission. This is observed runtime execution,
never developer-text injection or a separately fabricated equivalent output.

The generation runner cannot mark product acceptance complete. A full 67-cell
transport run is only eligible for the independent checks below; absent review
stays explicitly missing. Reporting failures must not bypass cleanup of owned
temporary homes, and progress must retain already executed attempts.

## Absolute semantic and rendering gates

Every main answer and matrix answer must preserve 100% of its required claims
with zero added or changed factual assertions. Judge the whole output: prose
must not contradict the visual. Every representable positive relationship,
condition, comparison value and containment relationship belongs in the visual;
essential qualifications, negative facts and uncertainty may be explicit local
annotations or a concise adjacent note. A complete prose restatement next to an
incomplete or empty diagram does not pass. Explicit derived values may be shown
only if logically entailed, accurately computed, and identified as derived;
they must not replace inheritance, conditions or source relationships.

Preserve entity identity, edge endpoints, direction or its absence, relation
verb, conditions and boundary values, AND versus OR, initial states, cycles,
self-loops, disconnected components, inheritance versus overrides, and order
versus causation. An unspecified relationship is not a proved absence. Repeated
display instances of a shared node must be identifiable as the same entity.
Ambiguous junctions, endpoint attachment, grouping or condition scope fail;
the evaluator must not guess the author's intention.

First, a fresh recovery reviewer receives only an anonymous answer and the
fixed recovery instructions, without source prose, gold claims, task-specific
questions or condition metadata. It records entities, all represented labeled
relationships, attributes, conditions, uncertainty, explicit negatives and
ambiguities, citing output spans. Lock that recovery before a separate comparison
against the gold claims. Correct author intent or a correct hidden answer cannot
repair a missing or ambiguous rendered relationship. A comparison reviewer
records a pass/fail and evidence for each fact ID, plus every unsupported claim.
Resolve uncertain findings through the output itself; retain disagreements.

Only after recovery is locked, answer the hidden reading questions from the
anonymous output without exposing source or gold answers, then compare with the
keys. Require every question to be answerable correctly; this is an additional
gate, not a substitute for all-fact preservation. Unanswerability caused by
ambiguity fails even if a guess happens to match the key.

Run deterministic fence, printable-structure and display-width checks on actual
outputs. Every visual must be fenced monospaced text, use ASCII structural
marks, and fit its task's display-column limit without truncating labels. Unicode
source labels, including Cyrillic and CJK, are permitted. Use the frozen width
implementation and record its supported display model. Check examples of CJK,
combining marks and long labels independently; byte count or UTF-16 length is
not display width. Horizontal scrolling or renderer wrapping is not a repair.
Inspect actual rendered artifacts in the claimed target display environment
for intact alignment, labels and topology; do not claim universal font support.

## Qualify recovery against six frozen corruptions

Before trusting recovery of generated answers, run the same recovery and
comparison procedure on every complete corrupted output below. Give recovery
only the anonymous output, never the gold or corruption description. These are
validator qualification fixtures, not six additional generation attempts.
All six must be rejected for a defect actually present in the output; retain the
recovered claims and reasons. Correct rejection for an unrelated stylistic
preference does not qualify semantic validation.

The shared gold source is: "A sends a request to B. On approval, B sends the
request to C. On denial, B sends the request to D. D retries by sending the
request to B. These are the only routes." Its five atomic gold claims are those
five sentences. The valid control must pass the same semantic recovery check:

```text
[A] --request--> [B]
[B] --request on approval--> [C]
[B] --request on denial--> [D]
[D] --retry request--> [B]
Only these routes exist.
```

K01, deleted edge:

```text
[A] --request--> [B]
[B] --request on approval--> [C]
[B] --request on denial--> [D]
Only these routes exist.
```

K02, reversed edge:

```text
[A] --request--> [B]
[B] --request on approval--> [C]
[D] --request on denial--> [B]
[D] --retry request--> [B]
Only these routes exist.
```

K03, wrong target:

```text
[A] --request--> [B]
[B] --request on approval--> [D]
[B] --request on denial--> [D]
[D] --retry request--> [B]
Only these routes exist.
```

K04, wrong condition:

```text
[A] --request--> [B]
[B] --request on approval--> [C]
[B] --request on approval--> [D]
[D] --retry request--> [B]
Only these routes exist.
```

K05, missing label:

```text
[A] --request--> [B]
[B] --> [C]
[B] --request on denial--> [D]
[D] --retry request--> [B]
Only these routes exist.
```

K06, falsely merged targets and conditions:

```text
[A] --request--> [B]
[B] --request on approval or denial--> [C/D]
[D] --retry request--> [B]
Only these routes exist.
```

## Readability and conclusions

Assess label proximity, consistent reading direction, unambiguous routing and
absence of avoidable visual crossings on anonymous outputs. Record concrete
output evidence instead of assigning an unanchored global beauty score. Width,
topology and hidden-question recovery are structural/readability evidence, not
measured human comprehension time.

If baseline was included, compare anonymous paired layouts and hidden-question
results only as secondary evidence. Report wins, ties, losses and reasons;
there is no requirement to beat a saturated maximum score. Baseline errors do
not excuse candidate defects. Native and hook gates are independent; neither
can borrow the other's successful outputs. Acceptance requires all applicable
absolute, suppression, delivery and matrix gates, with no missing evidence.

Retain all prompts, answers, events, frozen inputs, recoveries, per-fact results,
validator qualification results, rendering artifacts, errors, durations and
available token usage. Report the exact completed/planned denominator and every
failed gate. Missing usage is unavailable. Do not claim that people read faster
from model ratings, fewer characters or unit tests. Such a claim needs a separate
human study measuring accuracy alongside time. A passing run establishes bounded
product acceptance on this suite and revision, not universal model compliance.
