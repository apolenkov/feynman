# Self-Improvement Loop Design

This document designs a future feedback loop for feynman rules. It is a
research spec only. Implementation is a candidate for v0.6.0 research.

The goal is not automatic rule rewriting. The goal is a reviewable trail from
lint failures to human-approved rule changes.

---

## Scope

In scope:

- Failure log schema for `feynman-lint`
- Aggregation step for recurring failures
- Rule-update proposal format
- Human review gate
- Rollout cadence
- Kill-switch
- Open questions for v0.6.0

Out of scope:

- Automatic edits to `rules/feynman-activate.md`
- Telemetry upload or remote collection
- Background daemon
- Model-generated pull requests
- Per-user analytics dashboard

---

## Loop Overview

```
[Claude response] --> [feynman-lint]
                          |
                     pass + fail
                     |        |
                     v        v
                  [silent]    [local failure log]
                               |
                               v
                         [aggregate patterns]
                               |
                               v
                         [proposal file]
                               |
                               v
                         [human review]
                               |
                       accept + reject
                       |        |
                       v        v
                [rule PR]   [archive reason]
```

The loop stays local-first. A user can inspect every captured failure before
anything affects rules.

---

## Failure Log Schema

Each failed lint run writes one JSONL row. The path is proposed for v0.6.0:
`~/.claude/.feynman/failures.jsonl`.

```json
{
  "schema": 1,
  "timestamp": "2026-05-06T21:10:00Z",
  "feynmanVersion": "0.2.0",
  "source": "stop-hook",
  "rulesetIntensity": "full",
  "documentHash": "sha256:...",
  "issues": [
    {
      "rule": "L05",
      "severity": "error",
      "line": 12,
      "column": 1,
      "message": "2 boxes on same line with no arrow between them",
      "diagramShape": "flow",
      "snippetHash": "sha256:..."
    }
  ],
  "context": {
    "fileKind": "response",
    "hasCodeFence": true,
    "diagramChars": 42,
    "lineCount": 9
  }
}
```

Privacy rule: raw response text is not logged by default. Hashes and structural
metadata are enough to find repeated failure patterns without storing content.

Optional debug mode can store redacted snippets, but only behind an explicit
local config flag.

---

## Aggregation Step

Aggregation groups failures by rule, diagram shape, and structural signature.
It runs manually, not in the hook path.

```
[failures.jsonl]
        |
        v
[group by rule + shape + signature]
        |
        v
[rank by frequency + recency + severity]
        |
        v
[candidate patterns]
```

Candidate score:

```text
score = (error_count * 3) + warn_count + recent_count - ignored_count
```

Aggregation output is a local markdown report:
`~/.claude/.feynman/proposals/YYYY-MM.md`.

---

## Rule-Update Proposal Format

Each proposal must be small enough for review in one PR.

```markdown
# Proposal: tighten L05 flow spacing guidance

## Trigger

- Rule: L05
- Pattern: parallel boxes with one or two spaces
- Count: 18 failures in 30 days

## Evidence

- Structural signature: multibox_same_line_no_arrow
- Common shape: branch output rows
- Existing docs affected: examples/api-flow.md, examples/deploy-pipeline.md

## Proposed Rule Change

Change prose in `rules/feynman-activate.md` to state that side-by-side
parallel boxes use three or more spaces.

## Test Plan

- Add one valid fixture for parallel layout
- Add one invalid fixture for adjacent boxes
- Run `npm test`
- Run `feynman-lint` over docs/examples

## Rollout

- Merge behind normal release process
- Mention in changelog
- No runtime migration
```

Proposal files are advisory. They do not modify rules by themselves.

---

## Human Review Gate

Every proposal goes through a maintainer decision.

```
[proposal]
     |
     v
[maintainer review]
     |
     +--> [accept] --> [normal PR]
     |
     +--> [revise] --> [proposal update]
     |
     +--> [reject] --> [archive with reason]
```

Review checklist:

- Does the failure repeat across multiple prompts or files?
- Is the current rule actually wrong, or is the diagram wrong?
- Would the rule change increase unwanted diagrams?
- Does it preserve declarative phrasing?
- Does it keep the rule block under the size cap?
- Does it add or update golden tests?

No proposal is accepted without tests and docs/examples self-lint.

---

## Rollout Cadence

Recommended cadence for v0.6.0:

```text
weekly    collect local failures, no action
monthly   generate proposal report
release   merge accepted rule changes
hotfix    only for false positives that block normal use
```

Rule changes should batch by release unless a linter bug causes high-noise
false positives.

---

## Kill-Switch

The loop needs a hard local off switch before implementation (candidate for v0.6.0 research).

Proposed config:

```json
{
  "selfImprovement": {
    "enabled": false,
    "logFailures": false,
    "storeSnippets": false,
    "proposalCadence": "manual"
  }
}
```

Default is off. If enabled, logging remains local. If disabled, the Stop hook
does not write failure logs.

Emergency behavior:

```
[selfImprovement.enabled=false] --> [no logs]
[logFailures=false]             --> [no logs]
[corrupt config]                --> [fail closed: no logs]
[write error]                   --> [silent; never block Claude]
```

The hook must never fail a user prompt because logging failed.

---

## Data Retention

Suggested defaults:

- Keep aggregate reports until deleted by user.
- Keep raw JSONL failure rows for 30 days.
- Never write raw response text unless debug mode is explicitly enabled.
- Provide `feynman self-improve purge` in v0.6.0 if the feature ships.

---

## Open Questions

- Should this live behind `feynman doctor` checks or a separate subcommand?
- Should proposal generation be part of `feynman lint --report`?
- Should snippet redaction exist, or should raw snippets be disallowed entirely?
- How should proposal scores account for false positives fixed in the same
  release?
- Should team-level aggregation exist, or is local-only the permanent boundary?
- Can rule proposals remain useful without storing prompt context?

---

## Deferred Implementation

Implementation is explicitly a candidate for v0.6.0 research. v0.5.0 ships
only this design document. No runtime code, CLI command, hook behavior, config
schema, or logging path is added in this milestone.
