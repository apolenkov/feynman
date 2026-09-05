# Live evaluation of 72c6eb9

The corrected candidate did **not** meet the unchanged usefulness acceptance.
Neither delivery passed. The earlier failed run remains documented in
[evaluation-fa0d2d5.md](evaluation-fa0d2d5.md); its answers and ratings were not
replaced or pooled with this run.

## Protocol and provenance

Generation ran on clean `72c6eb96726838ded4b37097252f4636d381078f` from
2026-09-04 23:59:11.622 UTC to 2026-09-05 00:46:54.072 UTC. All 180 planned
answers completed in one uninterrupted run, with no failed or extra attempts
and no tool calls. The 20 tasks, three repetitions, baseline instructions,
model `gpt-5.6-luna`, medium reasoning, and Codex CLI 0.153.3 matched the first
experiment. Both candidate instruction hashes changed after concrete
factual-preservation corrections. This was their first full rerun.

The calculation plan was saved before generation with SHA-256
`7cae07acf70ea28289255587b2e77d5da314228aa9dfd8bce8224e1b5529947d`.
The coordinator knew the earlier results but did not inspect the new answers
before scoring. Two fresh, context-isolated `gpt-6-astra` reviewers scored
separate randomized paired cohorts: 120 ratings each, including independently
scored copies of the same 60 baseline answers. The condition mapping was opened
only after both reviewers had stored all initial scores. No scores were changed.

The standalone skill remained the primary candidate; the hook was evaluated
separately. Direct instruction injection tests answer behavior, not native
installation or discovery. Native live checks remain separate evidence.

Local raw evidence: `eval/usefulness-72c6eb9-v1/` (544 files). Anonymous packets,
scores, provenance, generation integrity and the immutable aggregate are under
`eval/blind-72c6eb9-v1/`. These directories are excluded from Git and packages.

## Frozen acceptance results

Acceptance still requires at least seven strict wins on twelve structured
task means, no overall reduction, no factual regression, no material factual
errors, zero explicit instruction violations and all suppression cases passing.

| Measure | Standalone skill | Full hook |
|---|---:|---:|
| Wins / ties / losses | 0 / 11 / 1 | 1 / 9 / 2 |
| Baseline comprehension + readability, maximum 4 | 3.9722 | 3.9722 |
| Candidate comprehension + readability | 3.9444 | 3.9444 |
| Tasks with lower factual means than baseline | 0 | 0 |
| Material factual errors, candidate answers | 3 | 2 |
| Explicit instruction violations, candidate answers | 0 | 1 |
| Suppression answers without extra visuals | 24 / 24 | 24 / 24 |
| Acceptance | Fail | Fail |

Skill lost task 9 and tied every other structured task. Hook won task 11,
lost tasks 4 and 9, and tied the remaining nine. The earlier incorrect state
transitions and invented bus directions were not found in the corrected
candidate answers. That narrow improvement does not establish overall benefit.

The remaining material errors were all in task 15. The source describes an
acknowledgment exchange; it does not say that an acknowledgment literally
copies an initial sequence number. All three skill answers and hook answer
`15-2-hook` added that stronger mechanism. Hook answer `15-3-hook` ended by
reversing whose number the received acknowledgment refers to. The coordinator
checked these statements against the supplied prompt and preserved the scores.
The baseline also made material errors; the frozen protocol explicitly does
not permit baseline errors to excuse candidate errors.

Hook answer `18-3-hook` asked both who uses the page and what problem they face.
The reviewer marked this as two independently answerable requests instead of
one focused question. This is a rubric judgment, despite the answer containing
one grammatical question mark; it is retained with its reasoning.

## Cost and latency

All 60 answers per condition reported usage. Token counts are reported fields,
not a price calculation; reasoning tokens must not be blindly added to output.
Elapsed time includes process startup and network time in the serial runner.

| Metric | Baseline | Skill | Hook |
|---|---:|---:|---:|
| Input tokens | 726,975 | 762,675 | 750,543 |
| Cached input tokens | 528,640 | 537,600 | 537,600 |
| Output tokens | 3,984 | 6,479 | 4,540 |
| Reported reasoning output tokens | 364 | 2,346 | 1,150 |
| Mean answer characters | 256.77 | 256.92 | 214.43 |
| Median elapsed seconds | 15.310 | 16.119 | 15.237 |
| P95 elapsed seconds | 17.741 | 18.623 | 18.288 |

## Decision boundary

In each cohort, baseline received the maximum comprehension/readability mean
on eleven of twelve structured tasks. Against these fixed ratings, even a
perfect candidate could achieve only one strict win, below the required seven.
This is an arithmetic limit of this rated sample, not proof that future samples
must have identical scores. The same ceiling occurred in the earlier run.

Repeating unchanged conditions merely to seek lower random baseline scores
would not be a remedy. Two full experiments provide no positive usefulness
evidence, and remaining factual errors still require attention. Neither result
authorizes lowering the threshold, dropping cases or declaring the goal complete.

A change to the acceptance protocol requires the user's decision. One possible
direction is to retain all twenty cases as strict factual and intent regression
checks, and separately preregister a harder held-out usefulness set with
measurable comprehension questions. No replacement tasks or criteria have been
adopted, and no new acceptance claim is made here.

Limitations: these are agent ratings, not a human comprehension study. Visual
style can suggest condition labels; independent reviewers can disagree on
subjective readability. An immutable provider model-build fingerprint was
unavailable. Later test-isolation or documentation changes do not retroactively
change the evaluated revision or its recorded instruction hashes.
