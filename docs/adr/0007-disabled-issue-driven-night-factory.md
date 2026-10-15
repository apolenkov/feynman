# ADR0007: Repository-only issue-driven factory with activation disabled

Status: Accepted design; source implementation pending final review.

## Context

Verified review findings need durable issues and bounded repairs. The existing Codex product has no factory implementation. The authorized source scope is this public repository; hosted authority, model transport/budget and additional targets are not assigned.

## Decision

Keep the factory under repository `scripts/` and four native workflow entrypoints, separate from the npm/plugin runtime. Import the accepted protocol unchanged and apply an explicit current host binding. One controller owns durable accounting; job roles isolate model, secretless repro/gates and trusted writes. Initial policy is disabled and unknown capabilities deny effects. Required check tuples and squash-only protection are preserved.

The release manifest includes the complete static control policy. A separate reviewed data-only activation policy pins the existing release, manifest and genesis; its canonical digest is calculated after its bytes exist. An independently approved exact locator/pin is required to trust that activation policy. No such pin is supplied by this disabled source package, so activation denies rather than relying on a self-hash or mutable input.

## Consequences

Local real-Git/transport/subprocess fault evidence can establish source behavior; it cannot establish hosted queue/job-token/merge-closure, a genuine live finding or elapsed rollout eligibility. Additional targets remain Waiting; no model calls or settings/state/issue publication result from landing this source package. Future deployment and activation require separate reviewed identities, finite budgets, bootstrap/stop proof and explicit authorization.

Emergency stop exception (proposed, pending coordinator acceptance; valid until protocol v2): the control-closure check that ordinary effects must pass (release ancestry and approved control-file blobs) is skipped for the dedicated `stop` role only, so an owner stop still works when control files drifted from the approved release. Repository, owner, actor, workflow registry and run identity checks still apply. `verifyControlSource(context, true)` refuses every other role. This departs from protocol section 3 and is not extended to any other role or command. The stop role has no `contents` write and does not set `stop.json`; the authoritative stop state is the readback of disabled mutating workflows, cancelled runs and unarmed PRs, while `stop.json` stays fail-closed for ordinary effects (absent or non-false denies).

Night-scan rollout (PR-B): the daily `night-review.yml` only dispatches the controller as `night-scan`; the model pass runs in one key-job in the existing `ci` environment with a pinned, signature-checked OCR tool, and its bundle is turned into at most one finding per night with a verifier receipt followed by a scan receipt, then published by the `factory-privileged` job. One finding per night follows from one authority job and marker per run attempt (protocol v1); a batch receipt would need protocol v2. A full scan whose open issue lacks disappearance proof keeps the issue open instead of failing. The scheduled bot actor is accepted as `approved-publisher` only for the `scan`, `verifier` and `publication` phases (repair reservations and outcomes stay owner-only) and only through a fresh `night-review.yml` parent run on `main`. `FACTORY_PRIVILEGED_JOBS_ENABLED` stays unset, so no scheduled run reaches a model or an issue until the owner enables it.

Residual risk of the bot actor: `parent_run_id` is a correlation, not an authentication. The producer bounds it by freshness (the parent started before and was last updated no earlier than the producer run, and the run started within `night_scan.parent_window_minutes` of it, which `check-factory-workflows` ties to the `night-review.yml` job timeout plus five minutes) and by single use (the parent is part of the receipt request key, and a later run finds the earlier run's receipt and refuses). Neither check proves who dispatched the run. The trust boundary of `approved-publisher` is therefore push access to the repository: anyone who can run a workflow with `actions: write` on `main` can sign a scan, verifier or publication receipt inside that window. Narrowing it further needs protocol v2.

See [the change](../../openspec/changes/issue-driven-night-factory/design.md), [requirements](../../openspec/changes/issue-driven-night-factory/specs/night-factory/spec.md) and [exact protocol import](../../openspec/changes/issue-driven-night-factory/factory-protocol-v1.md).
