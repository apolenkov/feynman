# Design

## Context

See [proposal](proposal.md) for the motivation. The existing product is Codex-only and has no factory entrypoints. This repository is the sole authorized public target; its current main uses squash merges, strict Node 22 Ubuntu/macOS checks with null app IDs, conversation resolution and linear history. Additional targets are unassigned. The source package is disabled; unknown provider transport, budgets and approved deployment identities deny effects.

The accepted [protocol v1](factory-protocol-v1.md) is imported byte-for-byte, SHA256 `fc2cb373232d3693de2da29d9b179d99aa547d78bd2ce047abb2d15b0f51d28f`, complete sections 1–9. Historical host observations in that file are replaced only by the explicit binding below; they grant no authority to this repository. No reduced duplicate protocol is created.

## Goals / Non-Goals

**Goals:** implement complete publication/presence, durable controller accounting, guarded repair publication and stop/preservation contracts with realistic local failure evidence. Keep all 26 assertion boundaries, distinguishing local Git proof from hosted queue/job-token/closure proof.

**Non-Goals:** activation, bootstrap, provider invocation, live scan/issue/fix acceptance, assigning five new targets or changing the product CLI/hook/Contract. The published npm runtime keeps zero dependencies. Existing CI/security/coverage/protection settings remain intact.

## Decisions

### One controller and explicit job boundaries

Use native workflow-level `factory-control-v1`, `queue:max`, `cancel-in-progress:false`, and the protocol's single-parent durable journal plus external checkpoints. Adapters submit validated identifiers without holding the controller group while awaiting children. Model, secretless repro/gate, state, issue, dispatch and trusted patch/merge/closure roles remain separate jobs; write roles do not run repair-branch tests or lifecycle code. A second scheduler/private journal would add another authority and is excluded.

Every side effect independently proves approved control bytes, authentic run/attempt/producer/archive/log tuple, canonical predecessor/tail and stop/admission policy. Descendant default commits alone do not approve changed control. Authenticated orphan reservations remain consumed; reruns, rollback, cancellation, aliases and issue/PR recreation cannot refund or create a third reservation.

### Checkpoint marker binding

The coordinator accepted the checkpoint-specific interpretation without schema extension or changes to the imported protocol. `marker.kind = checkpointCore.kind = "checkpoint"`; `marker.phase = "checkpoint"` is matched against the fixed completed approved producer. `marker.transition_id` equals independently read Git checkpoint `last_transition_id` and the referenced receipt transition. `marker.receipt_sha256` hashes the actual uploaded checkpoint core using SHA256/JCS; the inner `checkpointCore.receipt_sha256` remains the separate preceding receipt digest.

Verification independently binds archive bytes/digest, actual Git commit/tree/blob/checkpoint file/payload/receipt, epoch/sequence/predecessor/bootstrap anchor and API run/attempt/source/release. Negative controls mutate every marker/core field individually, recomputing outer transport digests where needed to reach the specific binding. A trusted digest cannot substitute for these semantic checks.

### Release policy and activation authority

The coordinator accepted two distinct policy roles. The immutable executable release R has a complete manifest M including the full static control-policy blob, workflows, scripts and pins. No fields are stripped to avoid a hash cycle. A separate reviewed data-only activation policy A pins the already existing R/M and genesis G; P is SHA256/JCS of the actual A bytes and is never embedded in A itself.

An independently approved exact Git locator and pin must identify A through reviewed repository administration. Mutable main, an input document or P from unverified state cannot approve A. Missing locator/pin, substituted A/R/M/G or an executable input outside the complete closure denies effects. The current disabled package supplies no active locator and creates no activation authority. Removing executable bootstrap requires a new reviewed active release/manifest while retaining the historical bootstrap release for genesis verification.

Remaining ambiguous authority is denied and recorded as a deployment prerequisite. Activation is a separate package after source review, rather than an inferred consequence of this PR.

### Exact host overlay

| Field | Binding |
|---|---|
| Repository | `apolenkov/feynman`, owner ID 23296915, repository ID 1230959148, public/main |
| Existing required contexts | `Test (Node 22 on ubuntu-latest)`, `Test (Node 22 on macos-latest)`; app_id null for both, strict true |
| Merge | squash-only, linear history and resolved conversations; no admin bypass |
| Future controller/entrypoints | `.github/workflows/factory-control.yml`, `night-review.yml`, `factory-ingress.yml`, `factory-operations.yml`; numeric IDs/release manifest are unknown until deployment |
| State | `refs/heads/factory-state`; no automatic initialization from absence; G/P/epoch/ticket unknown |
| Initial policy | disabled, no configured provider/budget, no additional targets; subsequent targets are outside this initial delivery |
| Gate | existing `npm ci`, full `npm run ci`, normal hooks, original coverage/security contexts |

Unassigned fields remain unknown in the disabled-policy variant and cannot form a valid active policy. Published control never imports former host IDs as runtime authority. Required checks preserve null app IDs rather than inventing an origin; a null tuple is accepted only together with the approved CI workflow identity (`ci_workflow_id`, `ci_workflow_path`), which execution proves against the actual check run under the accepted linkage contract.

### First full-cycle deployment contract

The first full-cycle target is this repository. Signals are OCR scan findings, CodeQL/Scorecard, CI failures, Dependabot and issues. A confirmed finding becomes a canonical issue, receives at most two durable fixer attempts, produces a PR, passes required checks and is merged by a human. A signal alone is not confirmation or repair permission. Independent review and protected-branch requirements remain in force; this source does not authorize autonomous merge.

After the source PR and final independent review, deployment is a separate package using a finite OpenCode subscription budget. The amount, authenticated transport and hosted signal adapters are not assigned by this source. Missing capability or proof denies effects; disabled exports and synthetic fixtures do not establish a working signal-to-fix loop.

Configuration alone cannot activate that complete loop: authenticated Git push transport, candidate commit materialization and the complete producer/controller/writer job sequence still require source implementation and review. The current writer clears credential helpers and token environment variables, and the manual writer job checks out the approved release rather than an independently materialized candidate. These missing boundaries deny effects; they are not covered by a future activation-policy pin or budget value.

Every job holding a write-capable token (flag-gated, `FACTORY_PRIVILEGED_JOBS_ENABLED` unset) additionally requires the stock protected GitHub environment `factory-privileged`; the owner configures required reviewers and branch restriction during activation, and the repository gate rejects a write-token job without it. Dependencies install with `npm ci --ignore-scripts` in every factory job and every factory job grants `actions: read` (or `write`) explicitly. Residual before activation: the admission step is itself repository code checked out at `github.workflow_sha`; a pinned, independently verified admission before any repository code is not implemented (candidate: a custom deployment protection rule on the environment), so activation stays denied until a reviewed pinned bootstrap exists. A reference to a missing environment creates it without protection, so the owner must create it with a branch policy before activation. The static gate does not simulate that protection.

### Responsibility and interfaces

`factory-protocol.ts` owns canonical bytes, closed data variants, fixed-origin paginated transport, control-source and authority validation. `factory-publication.ts` reconciles complete presence and canonical issues; `factory-control.ts` owns admission/bootstrap/reservation/recovery/receipt/append/checkpoint. `factory-writer.ts` separates immutable secretless repro and guarded data/Git publication/closure. `factory-operations.ts` owns stop, observation and Prepared preflight. `factory-preservation.ts` owns safe cleanup; the writer evaluates remote cleanup only after verified canonical closure. All input JSON starts unknown; accepted schema and canonical digests govern decisions, not issue text.

Production interfaces are `canonicalBytes`, `sha256`, `parseProtocol`, `loadFactoryPolicy`, `createFactoryContext`, `githubRequest`, `githubPages`, `verifyControlSource`, `verifyAuthority`, `produceReceipt`, `emitAuthority`; `reconcilePublication`; `submitIngress`, `runController`; `runReproduction`, `guardPatch`, `publishPatch`, `reconcileClosure`; `stopFactory`, `observeFactory`, `prepareTarget`; `preserveOrRemoveBranch`, `preserveOrRemoveWorktree`. Functions accept readonly validated context/records, return explicit structured decisions, and do not infer missing proof as success. CLI dispatchers expose the same production paths to separate native job roles.

### Local proof and hosted acceptance

Four flat primary owners avoid duplicate assertions: publication/writer, control, operations, preservation. Fixtures supply platform transport/faults; production code decides admission and accounting. Use real Git/ref/parent/worktree/remote failures and real subprocess interruption where required. Local sibling-writer proof is not hosted concurrency proof. A mock merge event is not actual token merge→dispatch→closure; genuine scan/finding and 14-day/three-update observation stay separately unexercised. Observation evaluates supplied candidate facts only: the public CLI keeps eligibility false until component and timeline provenance is independently established. Synthetic threshold controls do not establish a persisted material-change reset or genuine autonomous updates.

### Workflow validation

Coordinator-approved validation uses upstream `rhysd/actionlint` v1.7.12 with exact pin/checksum and full checks, plus one native `-ignore` matching only the exact unknown-queue diagnostic in concurrency. Official `@actions/workflow-parser` 0.3.61 is exact-pinned and validates single/max; the gate rejects max with cancel-in-progress:true. Positive single/max, invalid pair and an unrelated actionlint error are actual controls; other errors must still fail. The sole exception carries `shortcut: upstream issue rhysd/actionlint#657, снять после релиза с поддержкой queue`. A third-party fork was rejected for supply-chain reasons; no vendor patch, removed queue or blanket suppression is used.

## Risks / Trade-offs

- Expiring/missing artifact or job log → deny and retain consumed/unknown history, never fall back to a convenient older checkpoint.
- Fast-forward ref publication is not expected-old CAS → native serialization plus complete continuity/readback; preserve siblings/conflicts and report needs-human.
- Squash-only history gives no ancestry between a factory branch head and its delivered squash commit → remote branch cleanup (`expected...delivered` must be `ahead|identical`) preserves the branch after a squash delivery. The REST ref DELETE has no expected-old CAS; neither a CAS guarantee nor automatic cleanup after squash is claimed. Cleanup stays human-driven and the DELETE path is reachable only if the repository ever delivers by non-squash merge.
- Emergency stop verifies repository, owner, actor, registry and run identity but not control-file equality, so it still works when control files drifted from the approved release; ordinary effects keep the full control closure and fail closed on an absent or non-false `stop.json`. The authoritative stop state is the readback of disabled mutating workflows, cancelled runs and unarmed PRs; the stop role has no contents write and does not set `stop.json`.
- Dispatch choices `admit`, `operation-intent`, `operation-outcome` and `retry-claim` have no hosted job yet; the workflow gate lists them as explicitly unwired until the repair delivery wires them. The static gate also asserts the disabled posture (inactive policy, no schedule or non-token secret, no `FACTORY_*` set true), that every token-authenticating job grants `actions` explicitly and that every controller step receives the repository-variable policy pin. Actual token access and trusted pinned admission before checked-out repository code are hosted conditions.
- Bot-token PR workflows may require human approval and closed events do not cascade → actual hosted permission/CI/closure proof remains separate; explicit dispatch/sweep contract.
- No transport/budget/active deployment yet → source and local positive fixtures only; provider effects remain denied.

## Migration Plan

Land one disabled source PR after local gates and independent final review. Coordinator owns merge. Activation/bootstrap/provider and hosted acceptance require later explicit assignments; no repo settings, state ref, secrets, external issues or provider calls change as a side effect of this source PR. Existing product workflows are not disabled by the factory stop registry.

## Deferred Readiness

Additional targets are Waiting: targets have not been assigned; only feynman is authorized. The contract template stays Prepared with zero invented target rows. Unknown provider/budget and deployed producer/control IDs are expected deny states, not silently chosen defaults.
