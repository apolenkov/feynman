# Proposal

## Why

Confirmed review findings can remain unread in scan artifacts or PR threads. Repository automation should turn a verified finding into one persistent issue, preserve repair limits through retries, and publish a guarded fix PR without granting untrusted code a write token.

## What Changes

- Add a disabled issue-driven factory for this public repository, with complete scan presence, separate confidence/repair state, paginated deduplication and safe closure.
- Add the single native controller, authenticated receipts/checkpoints, durable lineage quotas, isolated secretless gates, guarded publication and complete stop/preservation routines.
- Import the accepted protocol bytes and bind them explicitly to this repository, its current strict checks and squash-only merge rule.
- Keep activation, provider transport and budgets unavailable. Missing authority denies effects; local fault fixtures are separate from hosted and genuine-finding acceptance.

## Capabilities

### New Capabilities
- `night-factory`: verified finding publication, durable admission and guarded repair lifecycle for repository automation.

### Modified Capabilities
None. The Codex-only Contract, hook, Visual linter, CLI and published runtime remain unchanged.

## Impact

Repository-only TypeScript scripts, four inactive workflow entrypoints, four flat test owners and a disabled policy. Development tooling may gain a maintained canonical-JSON dependency; the published product retains zero runtime dependencies. Existing CI contexts, coverage policy, hooks and release behavior remain intact.

## Non-goals

Activating or bootstrapping the factory, invoking a provider, publishing a real finding/fix, choosing additional targets, deploying to private repositories, replacing GitHub concurrency or changing branch protection. The single authorized target is this repository; additional-target readiness remains Waiting.
