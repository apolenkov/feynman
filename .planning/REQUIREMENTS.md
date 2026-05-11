# Requirements: feynman v0.5.0 — Verbosity Economy

**Defined:** 2026-05-11
**Last updated:** 2026-05-11
**Core value:** Every response with structure gets an ASCII diagram without the developer asking — and prefers the cheapest visual that still conveys the structure.
**Research base:** `.planning/notes/v0.5.0-verbosity-gap-research-2026-05-11.md` + `.planning/research/SUMMARY.md`.

## v0.5.0 Requirements

### Corpus & Harness (Phase 14)

- [x] **CORP-01**: 50-prompt corpus built in `eval/v0.5.0-compliance/prompts.json`, balanced across 9 shape classes (sequence×6, hierarchy×6, comparison×6, status×6, priority×4, branching×4, state-machine×4, mapping×4, none×10), with `boundary`/`phrasing`/`domain` schema fields
- [x] **CORP-02**: Existing 15 prompts from v0.4.0 are preserved (35 new prompts added, not replacing)
- [x] **CORP-03**: Smoke-run of v0.2.x baseline (2× on same 50 prompts) to establish variance floor before Wave 1
- [x] **CORP-04**: `aggregate.js` script (~100 lines, CommonJS, zero deps) reads 7 result JSONs and outputs per-arm numeric summary for REPORT.md

### Budget Compaction (Phase 15)

- [x] **COMP-01**: `rules/feynman-activate.md` compacted by ≥333 bytes via prose-only cuts (contracts, triggers note column, second full/examples tree); no vocabulary loss (`classify`/`channel`/`amplify`/`suppress` preserved)
- [x] **COMP-02**: All structural invariants in `tests/hook.test.js:541-629` pass after every compaction step — `npm test` is the gate
- [x] **COMP-03**: Resulting slack ≥333 bytes (4480 − used ≥333) confirmed with `wc -c`

### Candidate Rule Sets (Phase 16)

- [x] **CAND-01**: `eval/v0.5.0-compliance/rules-v05-A.md` — compacted base + caption brevity rule (≤4480 bytes); rule uses positive example, not pure prohibition
- [x] **CAND-02**: `eval/v0.5.0-compliance/rules-v05-B.md` — compacted base + no-narration rule (≤4480 bytes); positive framing required
- [x] **CAND-03**: `eval/v0.5.0-compliance/rules-v05-C.md` — compacted base + response-length budget rule (≤4480 bytes); rule explicitly excludes code-fenced and ASCII blocks from word count
- [x] **CAND-04**: `eval/v0.5.0-compliance/rules-v05-ABC.md` — compacted base + A+B+C combined (≤4480 bytes)

### Measurement (Phase 17)

- [x] **MEAS-01**: Wave 1 executed — 3 baseline arms (`rules-v02`, `rules-v03`, `rules-v03-ladder`) measured on 50-prompt corpus; sanity gate checked (delta from Phase 11 <10%); `results-v02-50p.json`, `results-v03-50p.json`, `results-v03-ladder-50p.json` written
- [x] **MEAS-02**: Wave 2 executed — 4 candidate arms measured on 50-prompt corpus; `results-v05-A-50p.json`, `results-v05-B-50p.json`, `results-v05-C-50p.json`, `results-v05-ABC-50p.json` written
- [x] **MEAS-03**: Statistical analysis uses paired design (same 50 prompts across all 7 arms) + Wilcoxon signed-rank + Bootstrap 95% CI; diagram rate measured separately from verbosity
- [x] **MEAS-04**: `eval/v0.5.0-compliance/REPORT.md` with 7-arm matrix, per-class breakdown (9 classes), and explicit winner statement (or «refuted»); generated via `aggregate.js` for numbers, hand-authored interpretation

### Release (Phase 18)

- [x] **REL-01**: Winner arm passes threshold: ≥−20% verbosity vs v0.3.x on 50-prompt corpus AND ≥95% lint compliance (or «refuted» if no winner)
- [x] **REL-02**: If winner passes: winner rule applied to `rules/feynman-activate.md`; `npm test` green (364+ passing); v0.4.0 15-prompt corpus regression gate also passes
- [x] **REL-03**: If winner passes: version bumped 0.4.0 → 0.5.0 in `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`; `CHANGELOG.md` updated with REPORT.md metrics
- [x] **REL-04**: If winner passes: `npm publish @albinocrabs/feynman@0.5.0` + GitHub Release `v0.5.0`
- [ ] **REL-05**: If all refuted: `eval/v0.5.0-compliance/REPORT.md` documents findings honestly; v0.5.0 milestone closed as research-only without publish

## Future (v0.6.0+)

- [ ] Telegraph English rewrite of `rules/feynman-activate.md` — −41% tokens (arXiv 2605.04426), ~1800 bytes freed; needs own eval cycle
- [ ] Domain packs (arch / db / devops rule sets)
- [ ] feynman.config.yaml team customization
- [ ] Self-improvement loop full implementation
- [ ] Windows install.ps1

## Out of Scope (v0.5.0)

- ultra + ABC interaction — adding an 8th arm is out of scope; document as «undefined behavior» in REPORT.md
- Live Anthropic API arm for harness (cost $5–15; subagent simulation sufficient for v0.5.0)
- Modifying the linter (L01-L13) — verbosity is a rules problem, not a linter problem
- Changing hook output format — additionalContext injection stays identical

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CORP-01 | Phase 14 | Done — commit f18d93a |
| CORP-02 | Phase 14 | Done — commit f18d93a |
| CORP-03 | Phase 14 | Done — commit a0f32fe |
| CORP-04 | Phase 14 | Done — commit 77e169b |
| COMP-01 | Phase 15 | Done — commit 7110582 |
| COMP-02 | Phase 15 | Done — commit 7110582 |
| COMP-03 | Phase 15 | Done — commit 7110582 |
| CAND-01 | Phase 16 | Done — commit db99e6a |
| CAND-02 | Phase 16 | Done — commit db99e6a |
| CAND-03 | Phase 16 | Done — commit db99e6a |
| CAND-04 | Phase 16 | Done — commit db99e6a |
| MEAS-01 | Phase 17 | Done — commit 9e53e04 |
| MEAS-02 | Phase 17 | Done — commit 9e53e04 |
| MEAS-03 | Phase 17 | Done — commit 9e53e04 |
| MEAS-04 | Phase 17 | Done — commit 9e53e04 |
| REL-01 | Phase 18 | Done — winner ABC (−54.7%) — commit c149e89 |
| REL-02 | Phase 18 | Done — 364/364 tests pass — commit c149e89 |
| REL-03 | Phase 18 | Done — v0.5.0 bumped — commit c149e89 |
| REL-04 | Phase 18 | Done — @albinocrabs/feynman@0.5.0 published — commit c149e89 |
| REL-05 | Phase 18 | N/A — winner path taken |
