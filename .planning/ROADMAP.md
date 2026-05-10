# Roadmap: feynman

## Overview

feynman is an open-source Claude Code and Codex plugin that injects ASCII diagram rules on every prompt via the `UserPromptSubmit` hook. Three milestones shipped to date — `v0.1` (core IP), `v0.2.0` (production-ready), `v0.3.0` (prompt architecture + runtime alignment + autofix). Each milestone left the project in a fully testable, shippable state.

## Milestones

- ✅ **v0.1 — Core** — Phase 1 (shipped)
- ✅ **v0.2.0 — Production-Ready** — Phases 2-7 (shipped 2026-05-07) — see [milestones/v0.2.0-ROADMAP.md](./milestones/v0.2.0-ROADMAP.md)
- ✅ **v0.3.0 — Prompt Architecture** — Phases 8 + 8.5 (shipped 2026-05-10) — see [milestones/v0.3.0-ROADMAP.md](./milestones/v0.3.0-ROADMAP.md)

## Phase Numbering

- Integer phases (1, 2, 3, …): Planned milestone work
- Decimal phases (6.5, 8.5, …): Insertions / parallel tracks
- Numbering continues across milestones

## Phases

<details>
<summary>✅ v0.1 Core (Phase 1) — SHIPPED</summary>

- [x] Phase 1: Core — Rules file + hook script + plugin manifest + README skeleton

</details>

<details>
<summary>✅ v0.2.0 Production-Ready (Phases 2-7) — SHIPPED 2026-05-07</summary>

- [x] Phase 2: Cleanup + State Schema
- [x] Phase 3: Diagram Linter (L01-L08)
- [x] Phase 4: Quality (Tests + CI)
- [x] Phase 5: Distribution (NPX + bash)
- [x] Phase 6: Documentation
- [x] Phase 6.5: Self-Improvement Research
- [x] Phase 7: Release v0.2.0

</details>

<details>
<summary>✅ v0.3.0 Prompt Architecture (Phases 8 + 8.5) — SHIPPED 2026-05-10</summary>

- [x] Phase 8: Prompt Architecture Rewrite (XML contract, token economy, suppression) — shipped as v0.3.0
- [x] v0.2.7 hotfix (out-of-phase): L09 detection-only — landed 1d4ae5f before Phase 8.5
- [x] Phase 8.5: Runtime alignment check + autofix — shipped as v0.3.2 + v0.3.3

</details>

## Progress

| Milestone | Phases | Status | Shipped |
|-----------|--------|--------|---------|
| v0.1 Core | 1 | Complete | — |
| v0.2.0 Production-Ready | 2-7 | Complete | 2026-05-07 |
| v0.3.0 Prompt Architecture | 8 + 8.5 | Complete | 2026-05-10 |

Detailed phase information moved to milestone archives in `.planning/milestones/`.
