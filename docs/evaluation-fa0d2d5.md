# Live evaluation of fa0d2d5

The evaluated revision did **not** meet the frozen usefulness acceptance.
This is historical evidence for `fa0d2d5521ae7f21576d8f67152a8cc9d69dc504`,
not evidence for subsequent implementation changes.

The corrected candidate's full rerun is recorded separately in
[evaluation-72c6eb9.md](evaluation-72c6eb9.md).

## Protocol and provenance

The unchanged public 20-task set was run three times under each condition:
baseline, standalone skill instructions, and full hook Contract. Generation
used `gpt-5.6-luna`, medium reasoning, Codex CLI 0.153.3 and isolated temporary
homes. Instructions were injected directly; this experiment does not establish
native skill discovery. There were 180 successful planned answers, collected
in two phases, plus one retained empty SIGTERM interruption: 181 attempts total.
The pause followed all nine answers for task 14. All 126 pre-pause successful
answers and their 378 artifacts remained byte-identical after resumption.

Two fresh reviewers (`gpt-6-astra`) independently scored randomized, anonymous
paired answers, one candidate cohort each. Each reviewed 120 answers including
a separately scored copy of the same baseline. The candidate mapping remained
hidden until both cohorts had finished. Scores and answers were not rewritten.
The operational analysis plan was frozen after the coordinator saw two early
answers, before scoring; the public tasks, rubric and threshold predated the run.
The primary candidate was the standalone skill, selected before scoring.

Local raw evidence is retained under `eval/usefulness-fa0d2d5-retry1/`; blinded
packets, scores, private mapping and `results.json` are under
`eval/blind-fa0d2d5-v2/`. These ignored directories are not shipped in packages.
The results file records source, runner, task, instruction, plan and score hashes;
the private provenance also records resumption lineage hashes.

## Frozen acceptance results

A candidate needs at least seven strict task wins out of twelve structured tasks,
no overall comprehension/readability reduction, no per-task factual regression,
no material factual errors, no explicit instruction violations and suppression
on all 24 suppression answers. Baseline errors do not excuse candidate errors.

| Measure | Standalone skill | Full hook |
|---|---:|---:|
| Wins / ties / losses, structured tasks | 0 / 10 / 2 | 0 / 10 / 2 |
| Baseline comprehension + readability, maximum 4 | 3.9722 | 3.9444 |
| Candidate comprehension + readability | 3.8333 | 3.8333 |
| Tasks with factual regression | 9, 11 | 12, 15 |
| Material factual errors, answers | 3 | 3 |
| Explicit instruction violations, answers | 3 | 0 |
| Suppression answers without extra visuals | 24 / 24 | 24 / 24 |
| Acceptance | Fail | Fail |

For skill, tasks 9 and 11 lost; every other structured task tied. For hook,
tasks 4 and 9 lost; every other structured task tied. All eight suppression
tasks tied on comprehension/readability, which does not erase factual errors.

Skill answer `9-2-skill` contradicted supplied outgoing state transitions.
Answers `11-2-skill` and `11-3-skill` introduced message directions despite an
explicitly unspecified direction and drew inconsistent bus topology. Hook
answers for task 15 invented a literal echo of initial sequence numbers in
acknowledgment fields; the supplied prompt described acknowledgment, not that
mechanism. Task 12 also had a lower factual mean than its baseline.
These are defects requiring correction independently of the numerical threshold.

## Observed cost and latency

Each condition has 60 answers with reported usage. Values below are totals
except answer length and latency. Reasoning tokens are reported separately and
must not be blindly added to output tokens as a billing calculation.

| Metric | Baseline | Skill | Hook |
|---|---:|---:|---:|
| Input tokens | 726,960 | 756,102 | 750,585 |
| Cached input tokens | 537,600 | 528,640 | 528,640 |
| Output tokens | 4,047 | 6,406 | 4,268 |
| Reported reasoning output tokens | 361 | 2,233 | 905 |
| Mean answer characters | 252.68 | 265.23 | 216.93 |
| Median elapsed seconds | 15.355 | 15.536 | 15.566 |
| P95 elapsed seconds | 19.010 | 21.862 | 19.085 |

## Interpretation and remaining decision

This run supplies no positive usefulness evidence. It also exposes a ceiling
in the current rubric/task combination: the skill cohort's baseline has room
for a strict improvement on only one of twelve tasks; the hook cohort has room
on only two. Even a perfect candidate cannot produce seven wins against these
fixed baseline ratings. This arithmetic applies to this rated baseline, not a
claim that every future sample will receive identical scores.

The current threshold remains binding. A possible next protocol is to retain
these 20 tasks as non-regression cases and add a separately frozen, harder
held-out set with measurable comprehension questions before generating answers.
That would change acceptance and therefore requires a user decision; it has not
been silently substituted. Repeating the full run solely to obtain favorable
random baseline ratings is not an acceptable remedy.

Limitations: agent judgments are not a human comprehension study; visual style
can suggest a condition despite hidden labels; the provider's immutable model
build fingerprint was unavailable; generation was interrupted once. Native
installation/activation checks are separate evidence. No result here supports
claiming universal activation, user benefit, or completion of the repository goal.
