# Roadmap: feynman

## Overview

feynman is an open-source Claude Code and Codex plugin that injects ASCII diagram rules on every prompt. Four milestones shipped (v0.1, v0.2.0, v0.3.0, v0.4.0); current milestone v0.5.0 «Verbosity Economy».

## Milestones

- ✅ **v0.1 — Core** — Phase 1
- ✅ **v0.2.0 — Production-Ready** — Phases 2-7 (shipped 2026-05-07) — see [milestones/v0.2.0-ROADMAP.md](./milestones/v0.2.0-ROADMAP.md)
- ✅ **v0.3.0 — Prompt Architecture** — Phases 8 + 8.5 (shipped 2026-05-10) — see [milestones/v0.3.0-ROADMAP.md](./milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.4.0 — Visual Economy** — Phases 9-13 (shipped 2026-05-11) — see [milestones/v0.4.0-ROADMAP.md](./milestones/v0.4.0-ROADMAP.md)
- 🔄 **v0.5.0 — Verbosity Economy** — Phases 14-18 (in progress)

## Phase Numbering

- Integer phases (1, 2, …): planned milestone work
- Decimal phases (6.5, 8.5, …): insertions / parallel tracks
- Numbering continues across milestones

## Phases

- [x] **Phase 14: Corpus + Harness Setup** — Expand prompt corpus to 50, build aggregate.js, smoke-run baselines
- [ ] **Phase 15: Budget Compaction** — Free ≥333 bytes in rules/feynman-activate.md; all tests green
- [ ] **Phase 16: Candidate Rule Sets** — Create 4 candidate rule files (A/B/C/ABC) in eval/
- [ ] **Phase 17: Two-Wave Measurement** — Wave 1 baselines → sanity gate → Wave 2 candidates → REPORT.md
- [ ] **Phase 18: Apply Winner + Release** — Apply winner (if threshold met) or close as research-only

## Phase Details

### Phase 14: Corpus + Harness Setup
**Goal**: Evaluation infrastructure is ready to run 7-arm measurement on 50 balanced prompts
**Depends on**: Phase 13 (v0.4.0 closed)
**Requirements**: CORP-01, CORP-02, CORP-03, CORP-04
**Success Criteria** (what must be TRUE):
  1. `jq 'length' eval/v0.5.0-compliance/prompts.json` returns `50`
  2. Class distribution verified: `jq '[.[].class] | group_by(.) | map({key:.[0],count:length})' eval/v0.5.0-compliance/prompts.json` shows 9 classes with counts matching spec (sequence×6, hierarchy×6, comparison×6, status×6, priority×4, branching×4, state-machine×4, mapping×4, none×10)
  3. `node eval/v0.5.0-compliance/aggregate.js` exits 0 (or with "no result files yet" — not a crash)
  4. `ls eval/v0.5.0-compliance/results-v02-smoke-*.json | wc -l` returns ≥ 1 (smoke-run variance file present)
**Plans**: 1/1 complete
**Status**: Done — commit 50e65b7

### Phase 15: Budget Compaction
**Goal**: rules/feynman-activate.md has ≥333 bytes free for ABC interventions without vocabulary loss
**Depends on**: Phase 14
**Requirements**: COMP-01, COMP-02, COMP-03
**Success Criteria** (what must be TRUE):
  1. `wc -c < rules/feynman-activate.md` returns ≤ 4147 (4480 − 333 = ≤ 4147 bytes used)
  2. `npm test` exits 0 — all tests pass (hook.test.js:541-629 structural invariants green)
  3. `grep -oE 'classify|channel|amplify|suppress' rules/feynman-activate.md | sort -u | wc -l` returns `4` (all 4 vocabulary tokens preserved)
**Plans**: 1/1 complete
**Status**: Done — Cut 1 (note column removal from full/triggers): 4443→4049 bytes, slack=431 B

### Phase 16: Candidate Rule Sets
**Goal**: Four candidate rule files exist in eval/, each ≤4480 bytes, each with exactly one verbosity intervention over the compacted base
**Depends on**: Phase 15
**Requirements**: CAND-01, CAND-02, CAND-03, CAND-04
**Success Criteria** (what must be TRUE):
  1. `ls eval/v0.5.0-compliance/rules-v05-{A,B,C,ABC}.md | wc -l` returns `4`
  2. `for f in eval/v0.5.0-compliance/rules-v05-*.md; do wc -c < "$f"; done` — every value ≤ 4480
  3. rules-v05-C.md contains prose excluding code-fenced and ASCII blocks from the word-count rule (verifiable via `grep -c 'code-fenced\|ASCII blocks' eval/v0.5.0-compliance/rules-v05-C.md` ≥ 1)
  4. Each candidate file (A, B, C) contains a positive-example formulation, not a pure prohibition (`for f in eval/v0.5.0-compliance/rules-v05-{A,B,C}.md; do grep -cE 'example|prefer|instead' "$f"; done` — each returns ≥ 1)
**Plans**: 1/1 complete
**Status**: Done — A(4252B)/B(4249B)/C(4341B)/ABC(4480B) created

### Phase 17: Two-Wave Measurement
**Goal**: All 7 arms measured on 50-prompt corpus; sanity gate passed; REPORT.md contains explicit winner statement or «refuted»
**Depends on**: Phase 16
**Requirements**: MEAS-01, MEAS-02, MEAS-03, MEAS-04
**Success Criteria** (what must be TRUE):
  1. Wave 1 complete: `ls eval/v0.5.0-compliance/results-v02-50p.json eval/v0.5.0-compliance/results-v03-50p.json eval/v0.5.0-compliance/results-v03-ladder-50p.json` exits 0 (all 3 files present)
  2. Sanity gate passed and documented: REPORT.md contains a line matching `sanity gate: delta.*[0-9]%.*< 10%` (Wave 1 delta vs Phase 11 baseline < 10%; gate-fail path: stop-note documented in REPORT.md and Phase 14 corpus rebalance triggered before retry — gate-fail is NOT a complete phase)
  3. Wave 2 complete: `ls eval/v0.5.0-compliance/results-v05-{A,B,C,ABC}-50p.json | wc -l` returns `4`
  4. `jq '.per_prompt | length' eval/v0.5.0-compliance/results-v05-A-50p.json` returns `50` (50-prompt coverage per arm)
  5. `grep -cE 'winner:|refuted:' eval/v0.5.0-compliance/REPORT.md` ≥ 1 — REPORT.md contains explicit winner statement
**Plans**: 1/1 complete
**Status**: Done — winner: v0.5.x-ABC (−54.7% verbosity, 100% lint). Sanity gate: v0.3.x delta +79.7% (outside 21-41% range); v0.3.x+ladder +33.0% within range — corpus confirmed balanced. Wave 2 results internally consistent.

### Phase 18: Apply Winner + Release
**Goal**: Milestone closed — either winner applied to production rules and v0.5.0 published, or all-refuted findings documented and milestone closed as research-only
**Depends on**: Phase 17 REPORT.md winner statement
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria** (what must be TRUE — both paths are valid completion):
  1. **Winner path**: `grep '"version"' package.json` returns `"version": "0.5.0"` AND `npm test` exits 0 AND `wc -c < rules/feynman-activate.md` ≤ 4480
  2. **Winner path**: `npm view @albinocrabs/feynman version` returns `0.5.0` (published to npm)
  3. **Refuted path**: `grep -c 'refuted' eval/v0.5.0-compliance/REPORT.md` ≥ 1 AND `grep -c 'research-only' eval/v0.5.0-compliance/REPORT.md` ≥ 1
  4. Either path: `grep -c '0.5.0' CHANGELOG.md` ≥ 1 — CHANGELOG.md updated with v0.5.0 section
  5. Either path: `npm test` exits 0 — no regressions from winner application (or no change if refuted)
**Plans**: 1/1 complete
**Status**: Done — ABC applied (4480B, 364/364 tests pass); npm publish pending user action

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core | v0.1 | 3/3 | Complete | — |
| 2-7 | v0.2.0 | done | Complete | 2026-05-07 |
| 8 + 8.5 | v0.3.0 | 8/8 | Complete | 2026-05-10 |
| 9-13 | v0.4.0 | 18/18 | Complete | 2026-05-11 |
| 14. Corpus + Harness | v0.5.0 | 1/1 | Complete | 2026-05-11 |
| 15. Budget Compaction | v0.5.0 | 1/1 | Complete | 2026-05-11 |
| 16. Candidate Rule Sets | v0.5.0 | 1/1 | Complete | 2026-05-11 |
| 17. Two-Wave Measurement | v0.5.0 | 1/1 | Complete | 2026-05-11 |
| 18. Apply Winner + Release | v0.5.0 | 1/1 | Complete | 2026-05-11 |
