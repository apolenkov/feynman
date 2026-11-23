## Why

Issue #1 asks how much of Feynman a green build actually checks and where a maintainer should start simplifying it. The existing repository-quality capability owns those decisions. Its Q07 calls for justified complexity, but does not specify when a growing implementation unit needs review.

## What Changes

- Record the fixed-revision audit in [the audit index](audit/README.md). Keep evidence with this change so it remains available when archived and stays outside the shipped docs tree.
- Complete the source-reading requirement at the pinned commit. Bind each full-file read and its executable ranges to the Git blob, record new findings and acceptance checks, and record the independent challenge of the report at `777491d`.
- Propose a review threshold and a per-symbol exception policy for Q07. Internal extractions preserve existing entry points and behavior.
- Specify fail-safe handling for a preference file that cannot be inspected or read and an incomplete documentation drift sweep. Disposable controls confirmed both behaviors at the audited revision.
- Reconcile the already-owned scanning work before starting the dependent extractions. [Tasks](tasks.md) describe future implementation and acceptance.

## Impact

Implementation would affect maintainers of the lint core, evaluation tooling, release scripts and repository-only automation. This change delivers documents and evidence only. Runtime, install paths, authority boundaries, dependencies and release settings retain their snapshot contracts.
