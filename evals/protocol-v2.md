# Single-run usefulness evaluation

Accepted direction on 2026-09-05: fix known factual and instruction failures,
retain original regression cases, compare usefulness on harder tasks, and run
fewer experiments. This protocol replaces the proposed 288-answer design with
one 96-answer experiment. No answers were generated before this decision.

## What success means

Feynman should help a reader recover the correct answer and locate the relevant
relationships with less avoidable reading effort. Diagram presence earns no
credit. A task win means a strictly higher combined comprehension/readability
score than the paired unassisted baseline. Accuracy and explicit instructions
are mandatory independently of that score.

This measures a blind agent review of answers, not actual human comprehension
time or statistically established benefit. One repetition limits cost and also
limits precision; report that limitation even if the candidate passes.

## Fixed design

- Original regression set: all 20 tasks in `evals/evals.json`, byte-identical to
  the previous run (SHA256 `31ad60b4115f8fa03781de68f54380dc4fa6ba68e119aeffc368ad3b49eb1307`).
- New usefulness set: all 12 tasks in `evals/usefulness.json`, N01–N12 mapped
  in order to numeric runtime IDs 21–32. They were written before this run;
  they are intended to be harder, but no model pilot establishes that claim.
- Conditions: baseline, standalone skill (primary), full hook (secondary).
- One response per task/condition: 32 × 3 × 1 = 96 total. No preliminary model
  experiment, selective retry, hidden discarded attempt or favorable-result rerun.
- Same pinned Codex CLI 0.153.3, model `gpt-5.6-luna`, medium reasoning, task
  prompts, tool prohibition and isolated environment across conditions.

Original task prompts are passed verbatim. New prompts consist, in order, of:
`These facts completely define the fictional system for this task.`, a blank
line, the task's `prompt`, a blank line, each fact as `ID: text` on its own line,
a blank line, and `Comprehension question: ` followed by the task question.
Answer keys and required-fact selections are never included in generation.

Before generation, record the clean source revision and SHA256 hashes of both
task files, this protocol, the runner, instruction texts, and the preparation
and scoring scripts. Keep all inputs fixed after generation begins. Record
the exposed model identifier; explicitly state if an immutable model-build
fingerprint is unavailable. Read-only preflight and unit tests do not count as
model experiments. Stop at a failed generation and retain it; do not restart
automatically. Partial runs cannot pass acceptance.

## Blind review and decision

Use the existing independent 0–2 dimensions in `evals/README.md`: factual
preservation, comprehension, readability and unnecessary content. Randomize
anonymous paired cohorts with a recorded seed; keep the condition mapping
hidden until two fresh independent reviewers have locked their scores. Each
reviewer assesses one candidate against a separately scored copy of baseline.
Reviewers see only tasks, keys, the rubric and anonymous answers. Identify them
as agent reviewers. Record material factual errors, explicit instruction
violations and suppression violations separately.

Both candidate deliveries must have zero material factual errors, zero factual
scores of 0, zero explicit instruction violations, and no per-task factual
score below the paired baseline. Baseline mistakes do not excuse candidate
mistakes. All eight original suppression cases must pass. Original 20-task
overall comprehension/readability must not fall below baseline.

On the new 12-task suite, primary skill must achieve at least 7 strict wins and
no decrease in overall comprehension/readability. Report ties and losses. Hook
usefulness is claimed only if it independently passes the same rule. Do not
pool old and new tasks or select the better delivery after seeing results.

This explicitly changes where the old majority criterion applies and reduces
repetitions. All old failed reports, raw answers and scores remain unchanged;
this protocol never retroactively turns them into passes.

## Stop and report

Retain all 96 attempts, raw events, final text, hashes, errors, durations,
available token counts and output lengths. Missing usage is `unavailable`.
Report the full result, hard-gate failures and uncertainty. If acceptance fails,
stop model experiments and request a product decision. Do not repeatedly adjust
the prompt or choose easier tasks to obtain a pass. Unit/integration tests and
native installation checks remain separate evidence; they cannot prove useful
explanations. No push, publication or real-user configuration changes are
authorized by this protocol.
