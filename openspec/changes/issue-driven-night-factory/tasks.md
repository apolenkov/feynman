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

## Workflow follow-up

### Opus PR54 prerequisites before activation

These findings are deferred from the disabled source PR by the coordinator on 2026-10-13. Each must be resolved and verified before activation; this list grants no live authority.

- [ ] F5: wire the hosted `admit`, `operation-intent`, `operation-outcome`, `retry-claim` and request-driven `preflight` chain, or remove unsupported dispatch choices; prove ingress and manual retry reach their actual controller jobs.
- [ ] F7: let an owner-authorized emergency stop work when control files have drifted, with repository/registry identity checks; implement setting `stop.json` or remove its dead check, and verify stop/readback under drift.
- [ ] F8: memoize the verified actionlint download promise per process and clean its private temporary directory after use; verify repeated workflow validation avoids duplicate downloads and leaves no tool directories.
- [ ] F9: explicitly grant `actions: read` to hosted jobs that authenticate runs, jobs, logs and artifacts; verify actual token access rather than assuming local fixtures prove it.
- [ ] F10: share the protected-path matcher between publication eligibility and the writer so `.env*` findings are consistently denied; verify the common boundary.
- [ ] F11: document squash-only ancestry as a branch-preservation limitation, or remove the unreachable REST DELETE path; do not claim expected-old CAS or automatic squash cleanup.
- [ ] F14: before activation, remove `labels` from refresh PATCH and use `POST /issues/{n}/labels` plus `DELETE /issues/{n}/labels/{name}` to eliminate stale label replacement and preserve owner opt-in; also record that partially created/refreshed issues are currently omitted from the `needs-human` failure result, which does not roll back earlier effects.

- [ ] Devin readiness: preserve the observed nullable required-check tuples while authenticating their origin separately through approved workflow/run identity; verify a complete target with `app_id: null` without inventing app IDs before activation.
- [ ] Devin disappearance: persist originating scan scope/inventory/tool/configuration, require compatible prior/current coverage and bind every absence proof to the current scan source and operation; narrowed or incompatible scans must not close unseen findings before activation.
- [ ] Devin security: before activation, establish trusted pinned admission before any repository/dependency execution, install with `npm ci --ignore-scripts`, and keep every privileged job platform-disabled until that trusted bootstrap and its denial tests are accepted; a guard loaded after lifecycle execution is insufficient.

- Coordinator alone authorizes merge; no source merge without his word.
- Hosted H1/H2/H3, bootstrap/activation/provider calls, genuine scan→issue→PR→merge→closure and 14-day/three-update observation require later assignments and are outside this disabled source delivery.
- Additional targets stay Waiting: targets not assigned; only feynman is authorized. Keep the contract template Prepared with no fabricated rows.
- Archive after the repository’s accepted review/delivery steps, without converting unexercised external acceptance into checked source tasks.
