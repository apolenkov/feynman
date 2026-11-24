# Feynman reference-quality audit · 23–24 November 2026

All **109/109 first-party source files** have a direct semantic review at the snapshot below. The initial pass reviewed 30. The completion pass read the remaining 79 in full and found eight additional issues. The highest-priority new finding is a handoff failure: the controller rejects the issue marker that the publisher writes (F18).

The independent review of `777491d` is complete. The reviewer confirmed the four original High findings, revised five priorities (F01, F03, F15, F16, F20) and reported seven findings (F24–F26, F28–F31). The author added F27. The reviewer later measured quadratic parser work on continuous prose without blank lines. The four new High findings cover truncated CLI output and three performance defects.

| Pass (revised severity) | High | Medium | Low | Total |
|---|---:|---:|---:|---:|
| Initial, F01–F15 | 2 | 8 | 5 | 15 |
| Completion, F16–F23 | 1 | 4 | 3 | 8 |
| Reviewer, F24–F26 and F28–F31 | 3 | 0 | 4 | 7 |
| Author, F27 | 1 | 0 | 0 | 1 |
| Total | 7 | 12 | 12 | 31 |

F01–F07 have landed source fixes. F08–F31 remain open. The [criteria and DoD](criteria.md) record the original isolated CI failure (C4), completed challenge (G2), and outstanding public issue backlink (G5 and DoD 8).

## Passport

| Field | Value |
|---|---|
| Repository and request | apolenkov/feynman, issue #1, AUDIT_AND_PLAN. The issue's earlier main revision describes preparation only. |
| Checkout | docs/audit-issue-1, forked from fix/code-scanning-audit. The initial audit began with a clean index and worktree. The source-reading pass resumed from pushed audit commit 7ed64f7. |
| Commit | a7dac0d0feb681b2b91da19856e901436d6fbec8 |
| Tree | de24352b5ade769cbdb6f51a82fb92fca7258151 |
| Environment | Darwin 27.2.0 arm64; Node 26.13.1, npm 11.20.0, TypeScript 6.0.3, OpenSpec 2.1.1. The package supports Node 22.18+. |
| Comparison boundary | The four commits after 6bb6c18 are included. The combined PR will carry both scanning fixes and the audit via merge `631aa3d`. Later source dispositions at `2f72cee` are recorded separately. Documentation-only audit additions are outside the denominator. |
| Single home | The existing quality standard, retrospective and research describe product acceptance and earlier revisions. This change owns the dated evidence and future implementation tasks. Keeping the registers here avoids shipping them through scripts/build-package.ts, which copies docs recursively. Proposal, tasks and audit retain their relative links when archived together. |

## Read the results

1. [Acceptance criteria and Definition of Done](criteria.md) and [gate evidence](evidence/gates.md).
2. [Findings with snapshot locations](findings.md), including the integrated status refresh and local challenge checks.
3. [Project standard](standard.md) and [target architecture and migration table](target-architecture.md).
4. [Change proposal](../proposal.md), [quality](../specs/repository-quality/spec.md), [state](../specs/rules-injection/spec.md) and [docs-check](../specs/doc-drift-guard/spec.md) deltas and [ordered implementation tasks](../tasks.md).
5. [File inventory](inventory.jsonl), [function and execution register](functions.jsonl), [module graph](evidence/modules.jsonl), [workflow graph](evidence/workflows.jsonl), and [size-rule candidates](evidence/size-candidates.jsonl).

## What the counts mean

| Inspection unit | Count | Evidence |
|---|---:|---|
| Direct semantic source review | 109 | 106 TS files, one MJS config and two shell entrypoints. Read module initialization, functions, methods, nested callbacks and shell execution in their containing files. |
| Other structural inspection | 182 | Documents and fixtures, project metadata, manifests, YAML workflows and changes. JSON/YAML decoded, Markdown heading structure indexed. |
| Media | 5 | Three binary format headers and two XML-parsed SVGs; no pixel-level visual quality claim. |
| External/lock artifacts | 3 | Resolved dependency maps in the root, Codex and OCR lockfiles parsed as lockfile v3. Dependency implementation source is external to the tree. |
| **Total** | **299** | 109 + 182 + 5 + 3. All 299 reviewed in the recorded mode; excluded 0, blocked 0, pending 0, in progress 0 for inventory inspection. |

The two registers join on path and blob. In the file inventory, `range` covers the whole source and `reviewNote` records the behavior inspected. The function register is AST-generated for TypeScript/MJS, with additional shell and workflow records. Semantic evidence is the per-file review note. In the function register, `lines` gives the inclusive reviewed range for each executable unit. Source entries in both registers carry `status: REVIEWED` and a `reviewPass`. Workflow records describe structural inspection.

| Direct read | Files | Physical lines | Source execution records |
|---|---:|---:|---:|
| Initial | 30 | 2,413 | 214 |
| Completion | 79 | 36,208 | 2,892 |
| Total | 109 | 38,621 | 3,106 |

The isolated CI invocation exited 1 during an upstream download. Separate stages measured 16,827/17,566 covered lines (95.79%) across 55/55 expected sources. One of 981 tests failed fetching the same tool and passed on focused retry. Full CI was invoked once.

Each inventory row binds its range to the complete blob, with Git mode, size, category, subsystem, purpose, consumer and actual inspection. Static importers replace the default audience where known. A blob change invalidates its previous disposition. Of 3,234 execution records, 2,997 are TS/MJS functions/methods/constructors/callbacks, 107 are module records, two are shell entrypoints, 28 are workflow jobs and 100 are inline shell steps. A module row supplies statement ranges for top-level execution; declarations and initializers can overlap nested functions. The JSONL lists 107 modules with 595 import/export edges including external or type-only dependencies. Dynamic runtime lookup and shell dispatch also appear in the architecture traces.

## Sources and authority

| Kind | Source | Audit decision |
|---|---|---|
| Owner requirement | Issue #1 plus the execution brief | A–G, fixed snapshot, one CI invocation, disposable canaries, same-branch fixes excluded; report/plan only. Issue publication reserved to owner. |
| Documented product contract | CONTEXT.md, AGENTS.md, CONTRIBUTING.md, docs/architecture.md, docs/adr/0001 through 0007, docs/release.md and openspec/specs/ | Codex only, two delivery paths, pure core, owned state gateway, reproducible compiled package. Preserve Q01–Q15 and S01–S09 evidence boundaries. |
| Current implementation | Snapshot tree, named source locations, effective configurations, tests and package smoke | New findings refer to this revision. Closed scanning work refers to commits. The September retrospective and historical evaluation reports provide comparison, not current acceptance. |
| Proposed requirement | Q07 review thresholds, per-identity exceptions, preservation on preference-read failure and reporting of incomplete drift inspections | Adopt only after review. Other fixes preserve existing contracts except for the explicit gate/error corrections in the plan. |
| Unknown / external | Hosted results and live explanation quality | No account changes, model evaluations, deployment, live factory activation or hosted security scan in this run. Read source evidence and conditional claims separately. |

Start with R00's preference-preservation regression. R02 owns the newly identified bounded-work sites and R18 owns piped lint output. The [task list](../tasks.md) gives the remaining dependencies and acceptance criteria.
