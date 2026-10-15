# Tasks

## 1. Publication and presence

- [ ] 1.1 Implement `scripts/factory-publication.ts` and `.github/workflows/night-review.yml` with complete presence, confidence separation and bounded paginated issue reconciliation; verify AC01–05 in `tests/night-factory-publication.test.ts` with real production decisions and failure transport.
- [ ] 1.2 Document the issue/presence interface in `design.md`, preserve the accepted `factory-protocol-v1.md` digest, and verify completeness/absence-closure scenarios through native tests and OpenSpec validation.

## 2. Durable controller

- [ ] 2.1 Implement `scripts/factory-protocol.ts`, `scripts/factory-control.ts`, disabled `scripts/factory-policy.json`, `.github/workflows/factory-ingress.yml` and `factory-control.yml`; verify closed schemas, authentic authority, two consumed reservations and exact genesis-active rules in `tests/factory-control.test.ts`.
- [ ] 2.2 Exercise real Git sibling-conflict and subprocess-interruption/recovery, 100/101 ceilings, orphans and persisted transport retry in `tests/factory-control.test.ts`; record AC06–13.local evidence separately from hosted H1/H2.

## 3. Guarded writer

- [ ] 3.1 Implement `scripts/factory-writer.ts` with immutable secretless repro, protected patch limits, authenticated exact-head push/PR/closure and denied unknown provider; verify AC14–19 in `tests/night-factory-publication.test.ts` with real rejecting remotes and unchanged behavioral RED→GREEN.
- [ ] 3.2 Verify same-head PR recovery, check/linkage/review failure and idempotent dispatch/sweep through production callers in `tests/night-factory-publication.test.ts`; document local versus actual hosted closure acceptance in `design.md`.

## 4. Operations and preservation

- [ ] 4.1 Implement `scripts/factory-operations.ts` and `.github/workflows/factory-operations.yml`; verify complete stop, observation and Prepared preflight AC20–22/25–26 in `tests/factory-operations.test.ts`, with no invented targets or implicit activation.
- [ ] 4.2 Implement `scripts/factory-preservation.ts`; verify remote and local unique/dirty/untracked/moved/wrong-owner preservation plus legitimate clean delivered controls AC23–24 in `tests/factory-preservation.test.ts` using real Git.
- [ ] 4.3 Document the repository-only boundary and disabled deployment in `docs/architecture.md` and `docs/adr/0007-disabled-issue-driven-night-factory.md`; verify links and accepted protocol/host binding integrity.

## 5. Integration and delivery

- [ ] 5.1 Wire only necessary maintained JCS/tool development dependency or gate changes in `package.json`/`package-lock.json`; verify current stable versions, zero product runtime dependency drift, pinned upstream actionlint 1.7.12/checksum and its sole exact queue diagnostic ignore plus official workflow-parser 0.3.61; actual single/max, invalid max + cancel-in-progress:true and unrelated-error controls must pass without stripping queue or hiding other lint errors.
- [ ] 5.2 Run existing `npm ci`, full `npm run ci`, normal commit/pre-push hooks and exact-tree checks; preserve all failure/RED/GREEN receipts and collect final SHA for one source PR. No providers, activation, hosted dispatch or protection changes.
- [ ] 5.3 Receive independent final Opus review on the exact PR head and resolve findings before coordinator merge; retain genuine/hosted and additional-target boundaries as explicitly unexercised/Waiting.

## 6. Night scan (PR-B)

- [x] 6.1 Add the pinned OCR tool (`tools/ocr`, exact 1.13.0 with lock integrity, signatures verified by `npm audit signatures`) and `scripts/factory-model.ts`: scan, verifier and analyst passes with allowlisted environment, throwaway HOME, budgets and deadline; verify in `tests/factory-model.test.ts` against recorded OCR runs in `tests/fixtures/ocr`.
- [x] 6.2 Add `scripts/factory-scan-record.ts` (`adapt`, `fingerprintFinding`): bundle to scan draft with at most one finding per night (V1-1), incomplete scans never close findings; verify in `tests/factory-scan-record.test.ts`.
- [x] 6.3 Add `night-scan` dispatch and the verifier and scan receipt producers to `scripts/factory-control.ts` (bot-actor bound to the scheduled `night-review.yml` parent run) and the `scan` archive kind; verify in `tests/factory-control.test.ts`, including the end-to-end canary test (recorded run, adapt, verifier, scan, one issue, no key value in any output).
- [x] 6.4 Wire `night-known`, `night-model` (environment `ci`), `night-adapter`, `factory-authority-verifier`, `factory-authority-scan` and the `{scan_run_id}` publication input into `factory-control.yml`; `night-review.yml` runs on one daily cron and dispatches the controller as `night-scan`; extend the workflow gate (`validateKeyJob`, `validateSecretIsolation`, `timeout-minutes`); `factory-publication.ts` no longer fails a full scan whose open issue has no disappearance proof, it just keeps the issue open.
- [x] 6.5 Register the new control files in `CONTROL_FILES` and the transport fixture manifest; pin `actions/upload-artifact` v7.0.2, `actions/setup-node` v7.1.0 and `actions/download-artifact` v8.0.2 by SHA.
- [ ] 6.6 Hosted proof (outside this source delivery): key-job run in environment `ci`, first scheduled `night-scan`, artifact retention and `needs.*.result` semantics on the real runner.

## Workflow follow-up

### Opus PR54 prerequisites before activation

These findings are deferred from the disabled source PR by the coordinator on 2026-10-13. Each must be resolved and verified before activation; this list grants no live authority.

- [ ] F5: wire the hosted `admit`, `operation-intent`, `operation-outcome`, `retry-claim` and request-driven `preflight` chain, or remove unsupported dispatch choices; prove ingress and manual retry reach their actual controller jobs. PR-A: reachability gate `validateDispatchReachability` added; `admit`, `operation-intent`, `operation-outcome`, `retry-claim` stay unwired (`UNWIRED_CONTROL_COMMANDS`) and are wired in PR-C - still open.
- [ ] F7: let an owner-authorized emergency stop work when control files have drifted, with repository/registry identity checks; implement setting `stop.json` or remove its dead check, and verify stop/readback under drift. PR-A: stop passes the control-drift check (stop-only role); the `stop.json` check is kept fail-closed and nothing writes `stopped:true` (stop disables workflows instead) - deviation from "implement setting stop.json", for coordinator acceptance.
- [x] F8: memoize the verified actionlint download promise per process and clean its private temporary directory after use; verify repeated workflow validation avoids duplicate downloads and leaves no tool directories. Done: the verified download is memoized per process (PR56) and the private tool directory is removed after use (PR-A).
- [ ] F9: explicitly grant `actions: read` to hosted jobs that authenticate runs, jobs, logs and artifacts; verify actual token access rather than assuming local fixtures prove it. PR-A: static gate only; real token access to runs/jobs/logs/artifacts is a hosted condition, unexercised. Static gate [x]; hosted proof [ ].
- [x] F10: share the protected-path matcher between publication eligibility and the writer so `.env*` findings are consistently denied; verify the common boundary.
- [x] F11: document squash-only ancestry as a branch-preservation limitation, or remove the unreachable REST DELETE path; do not claim expected-old CAS or automatic squash cleanup.
- [x] F14: refresh PATCH no longer sends `labels`; labels change through `POST /issues/{n}/labels` plus `DELETE /issues/{n}/labels/{name}` (own `severity:*` only), preserving owner opt-in and unrelated labels. Partially created/refreshed issues are reported as `needs-human` in the failure result; earlier effects are not rolled back, and a label already removed concurrently (DELETE 404) also ends as `needs-human` and is recomputed by the next run.

- [x] Concurrent severity edit (Devin, PR56): the label refresh reads labels once and applies POST/DELETE non-atomically, so an owner-added `severity:*` label after the read survives next to the finding severity. Before activation re-read labels after the writes and report a concurrent severity edit as `needs-human` conflict; no atomicity is claimed.
- [x] Devin readiness: preserve the observed nullable required-check tuples while authenticating their origin separately through approved workflow/run identity; verify a complete target with `app_id: null` without inventing app IDs before activation.
- [x] Devin disappearance: persist originating scan scope/inventory/tool/configuration, require compatible prior/current coverage and bind every absence proof to the current scan source and operation; narrowed or incompatible scans must not close unseen findings before activation.
- [ ] Devin security: before activation, establish trusted pinned admission before any repository/dependency execution, install with `npm ci --ignore-scripts`, and keep every privileged job platform-disabled until that trusted bootstrap and its denial tests are accepted; a guard loaded after lifecycle execution is insufficient. Keep `FACTORY_PRIVILEGED_JOBS_ENABLED` unset; only the repository owner may set it to the string `true` during activation after those prerequisites are accepted. PR-A: pin env required on every factory script step; inert-posture gate `validateInertPolicy`/`validateInertWorkflow`. Still open (hosted): pinned checkout before repository code (custom deployment protection rule or control_release_sha outside checkout).
  - Source done: `npm ci --ignore-scripts` in all factory jobs, `environment: factory-privileged` on every write-token job, explicit `actions` permission, gate `validateFactoryHardening`. Still open: trusted pinned admission before repository code (candidate: custom deployment protection rule on the environment).
- [ ] Activation checklist (owner): create environment `factory-privileged` with deployment branch policy `main` (decide required reviewers: they gate every privileged run and hold the `factory-control-v1` queue; self-review prevention blocks a single owner), verify `protection_rules` are non-empty in preflight, and keep `FACTORY_*` variables out of the environment so they cannot shadow repository variables such as `FACTORY_ACTIVATION_POLICY_PIN`.
  - Night chain: `factory-privileged` carries no required reviewers. The bot producer's parent window runs from the controller run's `created_at`, so an approval wait would push the run out of `night_scan.parent_window_minutes` and the unattended night would be refused.
- [ ] Blocker for regular nightly work: the night chain produces no checkpoint, so state appends are refused after roughly 90 to 100 nights. The checkpoint by the night chain is protocol v2 A2; the nightly schedule must not run unattended beyond that horizon until it lands.

- [ ] Night-review rollout checklist (owner/coordinator): the model key `OCR_LLM_AUTH_TOKEN` lives only in the existing environment `ci` (custom branch policy `main`); the key-job declares `environment: ci`; `OPENCODE_GO_API_KEY` in `ci` stays as the owner-approved 401 fallback and is read only by the same key-job (never removed, never used elsewhere); environment `factory-privileged` is created main-only before the first PR-B run and never holds the key; repository variables `FACTORY_PRIVILEGED_JOBS_ENABLED` and `FACTORY_ACTIVATION_POLICY_PIN` are set only by the owner/coordinator after "ready", with the pin approved by independent review; the writer environment (`factory-writer`, owner approval per repair) is decided before PR-C.

- Coordinator alone authorizes merge; no source merge without his word.
- Hosted H1/H2/H3, bootstrap/activation/provider calls, genuine scan→issue→PR→merge→closure and 14-day/three-update observation require later assignments and are outside this disabled source delivery.
- Additional targets stay Waiting: targets not assigned; only feynman is authorized. Keep the contract template Prepared with no fabricated rows.
- Archive after the repository’s accepted review/delivery steps, without converting unexercised external acceptance into checked source tasks.
