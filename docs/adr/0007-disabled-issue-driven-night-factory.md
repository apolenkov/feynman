# ADR0007: Repository-only issue-driven factory with activation disabled

Status: Accepted design; source implementation pending final review.

## Context

Verified review findings need durable issues and bounded repairs. The existing Codex product has no factory implementation. The authorized source scope is this public repository; hosted authority, model transport/budget and additional targets are not assigned.

## Decision

Keep the factory under repository `scripts/` and four native workflow entrypoints, separate from the npm/plugin runtime. Import the accepted protocol unchanged and apply an explicit current host binding. One controller owns durable accounting; job roles isolate model, secretless repro/gates and trusted writes. Initial policy is disabled and unknown capabilities deny effects. Required check tuples and squash-only protection are preserved.

The release manifest includes the complete static control policy. A separate reviewed data-only activation policy pins the existing release, manifest and genesis; its canonical digest is calculated after its bytes exist. An independently approved exact locator/pin is required to trust that activation policy. No such pin is supplied by this disabled source package, so activation denies rather than relying on a self-hash or mutable input.

## Consequences

Local real-Git/transport/subprocess fault evidence can establish source behavior; it cannot establish hosted queue/job-token/merge-closure, a genuine live finding or elapsed rollout eligibility. Additional targets remain Waiting; no model calls or settings/state/issue publication result from landing this source package. Future deployment and activation require separate reviewed identities, finite budgets, bootstrap/stop proof and explicit authorization.

See [the change](../../openspec/changes/issue-driven-night-factory/design.md), [requirements](../../openspec/changes/issue-driven-night-factory/specs/night-factory/spec.md) and [exact protocol import](../../openspec/changes/issue-driven-night-factory/factory-protocol-v1.md).
