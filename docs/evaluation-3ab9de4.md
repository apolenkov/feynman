# Single-run evaluation of 3ab9de4

The reduced, user-authorized experiment did **not** meet product acceptance.
Standalone skill tied baseline on all twelve new usefulness tasks. Hook tied
ten and lost two. Both deliveries also failed mandatory gates. No further
model experiment is started or authorized by this result.

## Design and provenance

The user approved retaining the original regression checks, moving usefulness
comparison to harder tasks and using fewer experiments. The committed
[protocol](../evals/protocol-v2.md) fixes one response per task and condition:
20 unchanged original tasks plus 12 new tasks, three conditions, **96 answers**.
Standalone skill is primary; hook is secondary. The original majority-gate
application and three repetitions were explicitly revised before generation.
The earlier failed experiments remain unchanged; their scores are not pooled
or retroactively passed.

Generation used clean `3ab9de43d325a37007e330d5b785a5ef012523f7`, Codex CLI
0.153.3, `gpt-5.6-luna`, medium reasoning, and isolated temporary homes. It ran
from 2026-09-05 07:23:19.847 UTC to 07:51:47.139 UTC: **28 minutes 27.292 seconds**.
All 96 attempts succeeded, with no tool calls, interruptions or retries.
Raw records and events comprise 293 files under the ignored
`eval/usefulness-3ab9de4-v2/` directory.

`eval/usefulness-v2-freeze.json` was written before generation. It records the
source, protocol, task, instruction, runner and review-tool hashes. The
coordinator verified all frozen hashes and the clean revision again after
generation. The original task SHA256 remains
`31ad60b4115f8fa03781de68f54380dc4fa6ba68e119aeffc368ad3b49eb1307`;
the new task SHA256 is
`bca2ccca725a3fa258c2ef0e5955e93a9b086b0793bd14cd34f8b4775f321442`.
The provider's immutable model-build fingerprint was unavailable.

Two fresh, context-isolated `gpt-6-astra` reviewers each rated 64 anonymous
answers in separate randomized paired cohorts. Each independently scored a
copy of the same 32 baseline answers. All 64 score files were locked before
conditions were revealed; no initial scores were changed. The coordinator did
not inspect answer text before both reviewers finished. Review packets,
initial scores and the immutable aggregate are in `eval/blind-3ab9de4-v2/`.

## Results

| Measure | Standalone skill | Full hook |
|---|---:|---:|
| New-task wins / ties / losses | 0 / 12 / 0 | 0 / 10 / 2 |
| Required strict wins | 7 / 12 | 7 / 12 for hook usefulness |
| New-task baseline comprehension + readability, maximum 4 | 4.0000 | 4.0000 |
| New-task candidate comprehension + readability | 4.0000 | 3.8333 |
| Original-task baseline comprehension + readability | 3.9500 | 3.9500 |
| Original-task candidate comprehension + readability | 4.0000 | 3.9500 |
| Tasks with lower factual scores than paired baseline | 1 | 3 |
| Candidate material factual errors | 0 | 1 |
| Baseline material factual errors in the same cohort | 4 | 5 |
| Candidate explicit instruction / intent violations | 1 / 1 | 0 / 0 |
| Suppression cases passing | 8 / 8 | 8 / 8 |
| Overall acceptance | Fail | Fail |

The skill's single explicit-instruction and intent flags refer to the same
answer, not two different incidents. Baseline factual-error counts differ
because reviewers scored independently; no consensus regrading replaced them.
The lower candidate material-error counts are a favorable observation in this
sample, but they do not override the frozen majority, factual-regression or
instruction gates.

Both graders gave baseline the maximum comprehension/readability score on all
twelve new tasks. The new set therefore did not remove the grading ceiling.
Against these fixed scores, no candidate can achieve a strict win. That is a
limitation of this evaluated sample and rubric, not proof that Feynman can
never help. It also does not justify another task redesign or random retry
after the user's request to limit experiments.

## Checked failure evidence

The coordinator checked the relevant prompts and actual answers after
unblinding and retained the reviewers' original scores.

- `18-1-skill` asks who uses the billing page **and** what difficulty they have.
  The rubric treats those as two independently answerable requests despite one
  question mark. The new one-question instruction did not prevent that failure.
- `15-1-hook` adds that an acknowledgment returns the received sequence number
  advanced by one. That arithmetic is absent from the supplied simplified
  example, so it violates the source-only contract. This finding concerns
  unsupported detail in this task, not a claim that adding one is generally
  incorrect TCP behavior. Skill's answer avoided the added mechanism in this
  run; baseline also added unsupported literal repetition of the number.
- On N05 (runtime task 25), skill omits the required same-ferry constraint and
  hook omits positive cargo capabilities of two rejected ferries. Both still
  give the correct selected ferry. Their factual scores fall below baseline
  because required facts are omitted, not because the final choice is wrong.
- Hook's N06 (26) schedule places the Labeling branch under the Polishing
  region, making its Cutting prerequisite unclear. Its N12 (32) schedule groups
  two parallel jobs and their successors into shared arrows, obscuring the
  individual prerequisites and overlapping intervals. These are the two new
  readability losses; the reported finish times remain correct.
- Hook's N10 (30) lists effective temperatures but omits the inheritance and
  override distinctions. Together with N05 and N06, it accounts for the three
  hook factual-score regressions. Other omitted required facts are retained in
  the detailed scores even when baseline omissions mean no paired regression.

These observations do not establish that Feynman caused every error, or that a
textual instruction can guarantee model compliance. They show that the revised
instructions did not satisfy the accepted behavioral gates in this run.

## Cost and latency

All 32 answers per condition reported usage. These are reported token fields,
not prices. Reasoning tokens must not be blindly added to output-token counts.
Elapsed time includes CLI startup and network time.

| Metric | Baseline | Skill | Hook |
|---|---:|---:|---:|
| Input tokens | 389,326 | 410,790 | 402,299 |
| Cached input tokens | 286,720 | 283,648 | 286,720 |
| Output tokens | 2,733 | 4,047 | 3,328 |
| Reported reasoning output tokens | 688 | 1,754 | 1,260 |
| Mean answer characters | 252.00 | 243.16 | 226.59 |
| Median elapsed seconds | 17.0905 | 17.8340 | 17.0720 |
| P95 elapsed seconds | 22.722 | 23.376 | 21.631 |

## Decision and technical boundary

Stop model experiments and leave useful-explanation acceptance unfulfilled.
Do not add another prompt patch and comparison automatically. The next step
requires a product decision about Feynman's purpose and acceptance; it is not
permission to lower criteria or claim a win.

Technical checks are separate: the evaluated source passed all six local
Linux/macOS and Node 22/24/26 combinations, each with 520 tests, zero skips and
98.11% line coverage across all 38 executable sources. Package reproducibility
and isolated release smoke passed. Actual 2.0.1 preparation succeeded in an
owned copy with its own Git repository; the real checkout remains version
2.0.0. Evidence is in `eval/acceptance/3ab9de43d325a37007e330d5b785a5ef012523f7/`.

These local checks do not establish a hosted run of the revised workflow or a
completed native-skill explanation on this revision. The comparison uses
instruction injection. No push or publication was performed. This is one
agent-graded project experiment with one repetition, not a human comprehension
study or a statistical claim about all users. The overall goal remains unmet.
