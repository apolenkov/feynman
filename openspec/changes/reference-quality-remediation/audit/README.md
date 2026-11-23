# Feynman reference-quality audit · 23 November 2026

**Disposition: limited audit and implementation plan.** All 299 tracked blobs are accounted for. The main engineering risks at this revision are the unfinished bounded-work guarantee in two diagram rules, failure/coverage gaps in repository tooling, and mixed responsibilities in the lint, evaluation and factory modules. A transient state read fault also reactivated a disabled hook in an isolated test. An interrupted bootstrap replacement also lost the previous usable export. There are 15 findings: 3 high, 9 medium, 3 low. Seven already have an implementation owner. Independent challenge: **pending independent review**.

## Passport

| Field | Value |
|---|---|
| Repository and request | apolenkov/feynman, issue #1, AUDIT_AND_PLAN. The issue's earlier main revision describes preparation only. |
| Checkout | docs/audit-issue-1, forked from fix/code-scanning-audit. Clean index and tracked worktree at start; no prior audit commit on the remote branch. |
| Commit | a7dac0d0feb681b2b91da19856e901436d6fbec8 |
| Tree | de24352b5ade769cbdb6f51a82fb92fca7258151 |
| Environment | Darwin 27.2.0 arm64; Node 26.13.1, npm 11.20.0, TypeScript 6.0.3, OpenSpec 2.1.1. The package supports Node 22.18+. |
| Comparison boundary | The four commits after 6bb6c18 are included. Later work on the scanning branch is outside this revision. Documentation-only audit additions are outside the denominator. |
| Single home | The existing quality standard, retrospective and research describe product acceptance and earlier revisions. This change owns the dated evidence and future implementation tasks. Keeping the registers here avoids shipping them through scripts/build-package.ts, which copies docs recursively. Proposal, tasks and audit retain their relative links when archived together. |

## Read the results

1. [Acceptance criteria and Definition of Done](criteria.md) and [gate evidence](evidence/gates.md).
2. [Findings with snapshot locations](findings.md), including the four implemented commits and the seven open scanning items.
3. [Project standard](standard.md) and [target architecture and migration table](target-architecture.md).
4. [Change proposal](../proposal.md), [quality](../specs/repository-quality/spec.md), [state](../specs/plugin-install/spec.md) and [docs-check](../specs/doc-drift-guard/spec.md) deltas and [ordered implementation tasks](../tasks.md).
5. [File inventory](inventory.jsonl), [function and execution register](functions.jsonl), [module graph](evidence/modules.jsonl), [workflow graph](evidence/workflows.jsonl), and [size-rule candidates](evidence/size-candidates.jsonl).

## What the counts mean

| Inspection unit | Count | Evidence |
|---|---:|---|
| Source with full structural inspection and flow analysis | 109 | 106 TS files, one MJS config, two shell entrypoints. TS/MJS body traversal includes nested callbacks, direct imported calls, selected I/O calls, throws, catches and assertions. |
| Other structural inspection | 182 | Documents and fixtures, project metadata, manifests, YAML workflows and changes. JSON/YAML decoded, Markdown heading structure indexed. |
| Media | 5 | Three binary format headers and two XML-parsed SVGs; no pixel-level visual quality claim. |
| External/lock artifacts | 3 | Resolved dependency maps in the root, Codex and OCR lockfiles parsed as lockfile v3. Dependency implementation source is external to the tree. |
| **Total** | **299** | 109 + 182 + 5 + 3. All 299 reviewed in the recorded mode; excluded 0, blocked 0, pending 0, in progress 0 for inventory inspection. Semantic review depth is a separate criterion. |

The isolated CI invocation exited 1 during an upstream download. Separate stages measured 16,827/17,566 covered lines (95.79%) across 55/55 expected sources. One of 981 tests failed fetching the same tool and passed on focused retry. Full CI was invoked once.

Each inventory row binds its range to the complete blob, with Git mode, size, category, subsystem, purpose, consumer and actual inspection. Static importers replace the default audience where known. A blob change invalidates its previous disposition. Of 3,234 execution records, 2,997 are TS/MJS functions/methods/constructors/callbacks, 107 are module records, two are shell entrypoints, 28 are workflow jobs and 100 are inline shell steps. A module row supplies statement ranges for top-level execution; declarations and initializers can overlap nested functions. The JSONL lists 107 modules with 595 import/export edges including external or type-only dependencies. Dynamic runtime lookup and shell dispatch also appear in the architecture traces.

## Sources and authority

| Kind | Source | Audit decision |
|---|---|---|
| Owner requirement | Issue #1 plus the execution brief | A–G, fixed snapshot, one CI invocation, disposable canaries, same-branch fixes excluded; report/plan only. Issue publication reserved to owner. |
| Documented product contract | CONTEXT.md, AGENTS.md, CONTRIBUTING.md, docs/architecture.md, docs/adr/0001 through 0007, docs/release.md and openspec/specs/ | Codex only, two delivery paths, pure core, owned state gateway, reproducible compiled package. Preserve Q01–Q15 and S01–S09 evidence boundaries. |
| Current implementation | Snapshot tree, named source locations, effective configurations, tests and package smoke | New findings refer to this revision. Closed scanning work refers to commits. The September retrospective and historical evaluation reports provide comparison, not current acceptance. |
| Proposed requirement | Q07 review thresholds, per-identity exceptions, preservation on preference-read failure and reporting of incomplete drift inspections | Adopt only after review. Other fixes preserve existing contracts except for the explicit gate/error corrections in the plan. |
| Unknown / external | Hosted results, independent challenge, live explanation quality and full per-body semantic signoff | No account changes, model evaluations, deployment, live factory activation or hosted security scan in this run. Read source evidence and conditional claims separately. |

Start with R00's preference-preservation regression. Continue R01/R02 in their existing owner branch and R03's paired docs-read test. Obtain the independent challenge before treating the audit as accepted.
