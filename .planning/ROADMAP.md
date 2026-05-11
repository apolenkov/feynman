# Roadmap: feynman

## Overview

feynman is an open-source Claude Code and Codex plugin that injects ASCII diagram rules on every prompt. Four milestones shipped (v0.1, v0.2.0, v0.3.0, v0.4.0); next milestone TBD.

## Milestones

- ✅ **v0.1 — Core** — Phase 1
- ✅ **v0.2.0 — Production-Ready** — Phases 2-7 (shipped 2026-05-07) — see [milestones/v0.2.0-ROADMAP.md](./milestones/v0.2.0-ROADMAP.md)
- ✅ **v0.3.0 — Prompt Architecture** — Phases 8 + 8.5 (shipped 2026-05-10) — see [milestones/v0.3.0-ROADMAP.md](./milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.4.0 — Visual Economy** — Phases 9-13 (shipped 2026-05-11) — see [milestones/v0.4.0-ROADMAP.md](./milestones/v0.4.0-ROADMAP.md)

## Phase Numbering

- Integer phases (1, 2, …): planned milestone work
- Decimal phases (6.5, 8.5, …): insertions / parallel tracks
- Numbering continues across milestones

## Current Milestone

None — v0.4.0 closed 2026-05-11. Start the next milestone with `/gsd-new-milestone`.

## Backlog (candidate themes for v0.5.0+)

From `.planning/PROJECT.md` Future and from Phase 11 findings:

- **Pixel/raster logo to replace README pencil emoji** — user wants a real drawing (crab, on-brand with `@albinocrabs` scope) instead of Apple's pencil PNG. ASCII-crab variant rejected ("неаскитукраб"); pixel art via image-gen API or commissioned art. Deferred 2026-05-11.
- **Verbosity reduction beyond ladder** — Phase 11 3-arm measurement showed the smallest-visual-first ladder closes only -3.5% of the +31% v0.2.x→v0.3.x gap. Real causes (caption brevity, classify-first CoT preamble, prose-around-visual) untouched. Highest-impact research target.
- **Domain packs** — separate rule sets for arch / db / devops use cases
- **feynman.config.yaml** — team-level customization without hot-patching state.json
- **Per-project intensity / style override** — override global state.json from project-local file
- **Marketplace submission** — Claude Code + Codex stores (submission process undocumented)
- **Self-improvement loop** — design spec exists in `docs/self-improvement.md`, never implemented
- **Windows install.ps1** — DIST-V3-01
- **3rd compliance harness arm: real live API** — current harness uses subagent simulation; live-API arm would cost $5-15 but validate methodology

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core | v0.1 | 3/3 | Complete | — |
| 2-7 | v0.2.0 | done | Complete | 2026-05-07 |
| 8 + 8.5 | v0.3.0 | 8/8 | Complete | 2026-05-10 |
| 9-13 | v0.4.0 | 18/18 | Complete | 2026-05-11 |
