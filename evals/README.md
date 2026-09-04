# Explanation usefulness evaluation

`evals.json` preserves the original 20 scenario IDs and categories. Version 1
replaces open-ended and time-dependent assumptions with supplied facts and
task-specific answer keys. Freeze its SHA-256 before generating any answers.
There are 12 structured tasks and 8 suppression tasks. A partial live run is
retained under the ignored `eval/usefulness-v1/` directory; it is not acceptance
evidence. On 2026-09-04, one hook-condition answer completed, then the baseline
attempt failed because the Codex usage limit was reached. No paired score or
usefulness claim can be derived from this run.

Run each task three times in each condition: baseline, standalone skill, and
full-intensity hook Contract. Use the same exact model identifier, reasoning
settings, task prompt, tool permissions, and empty project environment. Record
the Codex version and source revision, including the dirty diff hash when
applicable. Never let the baseline inherit the user's installed skills, hooks,
project instructions, or global preferences. Establish isolated installation
and activation separately; directly injecting instructions tests their effect
but does not prove discovery or plugin installation.

Retain all 180 attempts, including errors and retries, with raw events, final
answer, instruction and prompt hashes, duration, and available token usage.
Missing usage stays `unavailable`. A failed generation is not an omitted sample
or a successful answer. Do not mix completed samples from different versions
of the Contract. Keep outputs outside the published package.

## Review before revealing conditions

Shuffle responses with a recorded random seed and give reviewers anonymous
IDs, the task, the comprehension question, and its answer key. Keep the mapping
to conditions separate until scores are recorded. The answer must make the
question answerable; it need not literally repeat the answer key.

Score each dimension independently:

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Factual preservation | Contradicts or invents a material fact | Omits a required fact without contradiction | Preserves all required facts and uncertainty |
| Comprehension | Cannot answer the task question correctly | Answer requires inference from scattered information | Answer is directly recoverable from the explanation |
| Readability | Structure obscures relationships or is broken | Understandable with avoidable effort | Relationships are clear and easy to locate |
| Unnecessary content | Violates explicit format or adds substantial irrelevant content | Minor repetition or decoration | Concise, relevant, and follows the requested format |

A diagram receives no automatic credit. Record explicit instruction violations
and suppression violations separately from scores. On suppression tasks,
unnecessary diagrams, frames, and tables fail suppression even if factual.

## Decision

Use the acceptance thresholds in
[`repository-quality/spec.md`](../openspec/specs/repository-quality/spec.md).
Compare task-level means over the three repetitions: comprehension plus
readability must improve on at least 7 of the 12 structured tasks, with no
overall reduction, no factual or explicit-instruction regression, and all
suppression cases passing. Report wins, ties, losses, individual scores,
reviewer identity/method, tokens, answer lengths, and latency. Automated or
agent review must be identified as such; it is not a human user study.

Retain a failing run before changing instructions. Rerun all conditions for a
new candidate without editing tasks or answer keys to fit the outputs. A green
unit-test suite does not establish usefulness.

## Running the evaluation

After confirming an available Codex session and its usage allowance:

```bash
node scripts/evaluate.ts <exact-model-id> eval/<new-run-directory>
```

The runner uses medium reasoning, rotates condition order, and stops at the
first failed attempt. It refuses to overwrite an existing run directory. It
copies existing file-based Codex authentication into a private temporary home,
retains the current proxy/certificate settings, and deletes the temporary home
after each attempt. Credentials are never included in result artifacts. It
does not install anything into the user's Codex home. The run manifest records
instruction/task/runner hashes and the source revision; dirty revisions are
explicitly identified and require final-revision confirmation before acceptance.
