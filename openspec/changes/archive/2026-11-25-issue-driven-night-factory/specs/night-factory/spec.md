# Spec Delta

## Purpose

Preserves verified repository findings through a durable issue-driven repair lifecycle while separating confidence, authority, quotas, publication and hosted readiness.

## ADDED Requirements

### Requirement: Issue before repair
The system SHALL persist the canonical issue before any repair or dispatch effect. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC01 observable contract
- **WHEN** publication succeeds and a later dispatch fails
- **THEN** the issue remains bound to the finding and no duplicate issue is created

### Requirement: Independent confidence
The system SHALL keep adjudication confidence separate from repair and transport outcomes. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC02 observable contract
- **WHEN** a confirmed finding has a rejected push, a disputed finding is present, or a finding is refuted
- **THEN** confidence stays confirmed for the push failure; disputed stays visible without automatic repair; refuted creates no issue

### Requirement: Complete presence
The system SHALL establish complete compatible presence before applying severity, path or quota filters and deny absence closure for incomplete scans. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC03 observable contract
- **WHEN** a scan is truncated, failed, tokenless, missing coverage or incompatible with the last scan
- **THEN** no absence-based issue closure occurs

#### Scenario: Previously known findings remain present
- **WHEN** a successful full scan observes an identifiable finding whose fingerprint was already known and skips its repeated verification
- **THEN** the scan preserves that fingerprint as presence without consuming the single new-finding slot or declaring truncation solely for that skip
- **AND** presence alone does not create, refresh, reopen, confirm or authorize repair of an issue

#### Scenario: Invalid known presence is refused
- **WHEN** known-skipped indices do not identify scan comments, overlap verification verdicts, or the publication presence contains a malformed fingerprint
- **THEN** the input is refused before publication effects; unverified and unidentifiable findings still make the scan incomplete

### Requirement: Bounded selection
The system SHALL preserve all identified presence and create at most three new canonical issues per publication run. Existing issue refreshes and refuted findings SHALL NOT consume that creation cap. This cap clarification is the coordinator's 2026-10-13 F6 decision; the accepted protocol import remains unchanged.

#### Scenario: AC04 observable contract
- **WHEN** three existing findings precede four new candidates and the creation cap is three
- **THEN** existing issues are refreshed, at most three new issues are created, and every candidate remains present without a false disappearance

### Requirement: Paginated deduplication
The system SHALL reconcile canonical issues across complete pagination without a permanent seen-set. Only the repository owner or github-actions[bot] SHALL author canonical issues; foreign authors SHALL be skipped before marker parsing. Existing issues SHALL refresh title, body, severity labels and `source:ocr-scan` without duplicates.

#### Scenario: AC05 observable contract
- **WHEN** a matching issue appears beyond item500 or its prior repair state changed
- **THEN** the existing issue is refreshed without duplicates or permanent retry suppression

#### Scenario: Foreign issue markers
- **WHEN** a foreign author supplies a duplicate or malformed finding marker
- **THEN** that issue is skipped before parsing and does not block publication or bootstrap

#### Scenario: Per-issue disappearance authority before mutation
- **WHEN** a complete scan has multiple missing canonical issues and one node-keyed authority is invalid
- **THEN** every missing issue's authority is checked before any PATCH, including refreshes, and no issue is modified

### Requirement: Trusted admission
The system SHALL require authentic owner or approved producer ingress and durable admission evidence. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC06 observable contract
- **WHEN** a valid authorized issue or CI request satisfies every active-policy and provenance binding
- **THEN** the corresponding authenticated admission record is created before effects

### Requirement: Provenance denial
The system SHALL deny foreign, forged, edited, expired or unrecognized authority before reservation, provider or write effects. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC07 observable contract
- **WHEN** a request has a wrong source, repository, attempt, producer job, marker or archive binding
- **THEN** the intended authority check fails and no effects occur

#### Scenario: Independently approved activation policy
- **WHEN** the exact independently approved activation-policy locator or pin is missing, or the activation policy, static release closure or genesis anchor is substituted
- **THEN** effects are denied; mutable main and an unverified state digest do not approve activation

#### Scenario: Independent checkpoint field corruption
- **WHEN** any marker or checkpoint-core field is independently corrupted, with outer transport digests recomputed for semantic mutations
- **THEN** the corresponding authority binding denies the checkpoint without mixing the uploaded-core digest with the preceding-receipt digest

### Requirement: Bounded manual recovery
The system SHALL allow only verified owner recovery of an exact known patch within remaining allowance. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC08 observable contract
- **WHEN** a label is removed or an unknown user requests retry without authentic owner proof
- **THEN** the request does not gain repair authority or reset quota

### Requirement: Persistent repair quota
The system SHALL share at most two consumed reservations across stable issue/PR/CI lineage identities. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC09 observable contract
- **WHEN** one issue repair and one CI repair are consumed and aliases are recreated or rebased
- **THEN** a third reservation is denied without refund

### Requirement: Single writer continuity
The system SHALL retain single-parent continuity and preserve conflicting objects under the sole native controller. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC10 observable contract
- **WHEN** real sibling state publications conflict or a ref rolls back
- **THEN** the conflict is preserved and unproven effects are denied; local evidence does not claim hosted serialization

### Requirement: Durable interruption
The system SHALL preserve consumption through process interruption at receipt, append and checkpoint boundaries. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC11 observable contract
- **WHEN** a process is killed after durable reservation evidence but before the provider gate
- **THEN** recovery keeps the consumed reservation and does not reinvoke its provider

### Requirement: Bootstrap and recovery
The system SHALL enforce the exact genesis-active dependency order, permanent anchors, complete independent checkpoint discovery and both100-record ceilings. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC12 observable contract
- **WHEN** G/P null rules, ticket, inventory, parent, newest checkpoint, run inventory or101st transition violates the accepted protocol
- **THEN** bootstrap/recovery denies without reinitializing or selecting an older convenient checkpoint

### Requirement: Persisted transport retry
The system SHALL permit only the initial operation and one durably claimed identical transport retry. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC13 observable contract
- **WHEN** a retry result is lost, the authority upload has no durable retry proof, or a provider times out
- **THEN** retry allowance remains spent or denied; provider timeout cannot be retried as transport

### Requirement: Remote failure classification
The system SHALL classify rejecting, stale, unreadable and ambiguous remotes using authenticated reads rather than stderr guesses. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC14 observable contract
- **WHEN** a real remote rejects a push or its expected head changes or becomes unreadable
- **THEN** the failure is explicit, work is preserved, and an uncertain write is not blindly repeated

### Requirement: PR publication recovery
The system SHALL recover a successful exact-head push and failed PR publication using the same commit and canonical lineage. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC15 observable contract
- **WHEN** push succeeded but PR creation failed or its response was lost
- **THEN** discovery reuses the same head and at most one PR without model regeneration

### Requirement: Patch guard
The system SHALL bound autonomous patches to25files/600changedlines and protect existing tests, policy, lifecycle, dependencies and unsafe file kinds. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC16 observable contract
- **WHEN** a patch changes a protected path, deletes a file, includes a binary/symlink/submodule or exceeds the cap
- **THEN** the corresponding guard denies before publication while a valid bounded patch remains eligible

### Requirement: Immutable behavioral repro
The system SHALL require a relevant unchanged behavioral RED reproduction followed by GREEN and the full secretless gate. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC17 observable contract
- **WHEN** the evidence is only an import/syntax/environment failure, the repro changes, or the full gate fails
- **THEN** the patch cannot be admitted as a confirmed successful repair

### Requirement: Exact head closure
The system SHALL bind check origins, independent review, live base, canonical issue and merged exact head before closure. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC18 observable contract
- **WHEN** foreign prose contains a Fixes reference or checks/linkage/review/provenance are unknown
- **THEN** no foreign or unproven issue closes; a verified repeat closure is idempotent

### Requirement: Bot merge transport
The system SHALL use explicit closure dispatch or bounded sweep when bot events do not cascade. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC19 observable contract
- **WHEN** a local transport fixture simulates bot merge without an actual hosted token run
- **THEN** the local contract can pass but hosted merge-dispatch-closure acceptance remains unexercised

### Requirement: Complete stop
The system SHALL stop every registered factory mutator, cancel nonterminal runs, disarm factory PRs and require complete terminal readback. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC20 observable contract
- **WHEN** readback is incomplete, an independent writer returns, or an armed factory PR remains
- **THEN** the result is Waiting rather than STOPPED and quotas remain retained

### Requirement: Observation continuity
The system SHALL record genuine observation start and restart the applicable stable window on material component changes. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC21 observable contract
- **WHEN** the window is day13, material policy changes or timeline evidence is absent
- **THEN** rollout eligibility remains Waiting

### Requirement: Genuine observation threshold
The system SHALL require at least14elapsed days and three genuine registered autonomous Dependabot updates with exact-head and no-human-repair evidence. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC22 observable contract
- **WHEN** human probes, source PRs, night fixes or closed-unmerged PRs are counted as updates
- **THEN** those items are excluded and cannot establish rollout eligibility

### Requirement: Remote preservation
The system SHALL preserve unique, unmerged, open, unknown or moved remote branches until actual delivery and ownership evidence permits safe removal. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC23 observable contract
- **WHEN** a remote branch is unique, unmerged, has an open PR or moved from the expected head
- **THEN** the branch and unique commits remain intact

### Requirement: Local preservation
The system SHALL preserve dirty, untracked, unique, unmerged, wrong-owner or unknown worktrees. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC24 observable contract
- **WHEN** an owned worktree still contains untracked or unique material or delivery is unproven
- **THEN** it is retained; only a clean delivered owner-released control is removable without force

### Requirement: Exact target preflight
The system SHALL validate prepared workflow/security gates, strict check tuples and protected paths without modifying a target. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC25 observable contract
- **WHEN** a check has a null app ID, strict is true or a security/provider/stop capability is unknown
- **THEN** null and strict are preserved; unknown capability denies technical-ready status and no target write occurs

### Requirement: Fail closed readiness
The system SHALL keep activation disabled for missing provider, auth, budget, deployment or target authority. The complete accepted protocol is normative; historical host observations are replaced only by this change’s explicit repository binding.

#### Scenario: AC26 observable contract
- **WHEN** only a secret name exists, no additional targets are assigned or a model transport is unknown
- **THEN** the contract stays Prepared/Waiting, provider invocation is denied, and no excluded repository receives rollout
