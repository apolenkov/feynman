# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## 1.0.1 - 2026-05-22

### Fixes

- Public docs (README pitch, docs/launch.md positioning, CHANGELOG summary)
  no longer claim "status into frames" as the rules-emitted shape. The
  smallest-visual-fits ladder still keeps frame as a last-resort fallback
  when lighter forms lose information — docs now match that contract
- Plan-writer checklist in docs/token-economy-planning.md updated from
  "status frame" to "status list"

## 1.0.0 - 2026-05-22

Stability marker after four breaking releases (0.4 IDE compat, 0.5 ABC ruleset,
0.6 ESM, 0.7 SessionStart). Frame blocks are no longer the default for status
visuals — dot-leader and markdown table take over; the smallest-visual-fits
ladder still allows frame as a last resort when lighter forms lose information.

### Changed

- **Breaking behaviour:** rules no longer recommend `frame block` for status
  visuals. `<intensity name="lite|full|ultra">` triggers map `status` to
  `dot-leader list` (default) or `markdown table` for ≥6 items. The
  `<patterns selection="one-of">` block (status→frame, retro→frame,
  handoff→frame, review→frame, incident→frame, release→frame,
  decision→frame, verification→frame, roadmap→frame, phase→frame,
  UAT→frame, risk-register→frame) is removed entirely
- Motivation: frame blocks (`┌─...─┐`) wasted tokens on `─` and `│`
  decoration without adding semantic separation in linear chat output.
  Dot-leader lists and markdown tables convey the same status structure
  with lower visual noise
- Mutex semantics preserved: the `Mutex: at most one primary visual per
  response.` rule moved from `<patterns>` into the `<contract>` block
  of full intensity

### Maintenance

- CI matrix dropped Node 20 (incompatible with `engines.node >=22.6`
  since v0.6.0)
- Release workflow now pins Node 22
- devDependencies bumped via dependabot (PR #3 `@types/node`, #4 eslint 10,
  #5 typescript 6) — merged in this release

### Migration

- Existing installations: run `npx @albinocrabs/feynman install` to pick up
  the new rules. `state.json` and `injections` counter are preserved
- Plugin authors who depended on the `<patterns selection="one-of">` block
  in feynman-activate.md must switch to the survived mutex rule in
  `<contract>`

## 0.7.0 - 2026-05-17

### Changed

- **Breaking behaviour:** rules now inject only at `SessionStart`
  (`startup|resume|compact|clear`). The `UserPromptSubmit` hook is removed.
  Token cost per session drops by ~1 100 tokens × number of user turns.
  Rules survive `/compact` and `/clear` natively via the expanded matcher.
- Motivation: per-turn injection was redundant once rules entered session
  history. Cache-invalidation framing was investigated and rejected — the
  verified cause of cache misses in long sessions is `/compact` summarisation
  rewriting history, not feynman injection. The real gain is reduced context
  noise and fewer tokens per turn.
- Installer (`feynman install`) now registers only the `SessionStart` hook.
  Legacy `UserPromptSubmit` feynman entries are removed during any install
  (migration path for v0.6.x users).
- `feynman doctor` no longer checks for a `UserPromptSubmit` hook entry.

## 0.6.1 - 2026-05-12

### Fixes

- build pipeline: publish compiled .js tarball, not raw .ts sources

## 0.6.0 - 2026-05-12

Changes since v0.5.0.

### Features

- TypeScript + ESM migration (Node.js v26 native strip-types, no build step)
- WR-01/02/03: sanity-assert `<intensity>` tag pairs with malformed-rules fallback
- explicit application of rules to markdown plan files

### Documentation

- token-economy-planning article with v0.5.0 benchmark data
- subagent-delegation cross-reference
- v0.5.0 milestone archive + v0.4.0 audit backfill
- lint `--fix` before/after sample for frame alignment

## 0.5.0 - 2026-05-11

Changes since v0.4.0.

### Features

- verbosity economy: apply winner ABC rule set to production rules
  - A: caption brevity — shortest noun phrase labels, no articles or verbs
  - B: no narration — diagram-first, no "Here is the X:" preamble
  - C: length budget — ≤50 prose words (structural) / ≤120 (general)
  - combined ABC achieves −54.7% verbosity vs v0.4.x on 50-prompt corpus
  - lint compliance: 100% (364/364 tests pass)
- rules compaction: free 431 bytes (4443 → 4049 base) before ABC addition

### Evaluation

- 7-arm measurement on 50-prompt corpus (eval/v0.5.0-compliance/)
- all 4 candidates (A/B/C/ABC) exceed −20% verbosity threshold with 100% lint
- ABC is the clear winner: −54.7% average verbosity reduction

## 0.4.0 - 2026-05-11

Changes since v0.3.3.

### Features

- rules add smallest-visual-first ladder per intensity
- compliance A/B harness — 2-arm subagent run + REPORT.md
- IDE compat — install/doctor for cline, cursor, windsurf (IDE-01..04)
- /feynman style subcommand + status output (STYLE-02)
- output_style suffix injection in hook (STYLE-01 + STYLE-03)
- autofixFrameToDotLeader + dispatcher with two orthogonal opts
- add --explain CLI flag with per-frame cost annotation
- implement L13_double_wrap detection rule
- implement L12_token_budget + estimateFrameCost helper
- implement L11_overdecoration detection rule

### Documentation

- morning housekeeping — Phase 11 closed, rule ext logged
- autonomous overnight handoff — Phases 9/10/12 closed
- add SUMMARY — Phase 12 IDE compat complete
- README adds IDE Support section listing 5 targets (IDE-05)
- add SUMMARY — Phase 10 output-style presets complete
- README + architecture.md document output_style axis (STYLE-04)
- add SUMMARY — Phase 9 complete (22/22 reqs, +70 tests)
- document L11/L12/L13 + --explain flag (DOCS-L11)
- SUMMARY — LINT-14 autofix shipped via two-opt dispatcher
- Phase 9 — 4 of 6 plans shipped (323 tests)
- add SUMMARY — --explain CLI flag complete
- add SUMMARY — L13 complete; Phase 9 detection trio done
- add SUMMARY — L12 + estimateFrameCost complete
- add SUMMARY — L11 detection complete
- Phase 9 planned and ready to execute
- generate context for Phase 9 from research notes
- create milestone v0.4.0 roadmap (5 phases)
- define milestone v0.4.0 requirements
- start milestone v0.4.0 Visual Economy
- retroactive VERIFICATION.md + milestone audit passed
- SUMMARY for 03 + close 04 (was PARTIAL) + STATE sync to v0.3.3

### Tests

- add failing hook tests for output_style suffix (RED)
- add failing tests for autofixFrameToDotLeader (RED)
- add failing CLI tests for --explain flag (RED)
- add L13 unit tests + L11/L13 complementarity check
- add failing fixtures for L13_double_wrap (RED)
- add L12 unit tests for cost-shape and threshold
- add failing fixtures for L12_token_budget (RED)
- add L11 unit tests for boundary + whitelist behaviour
- add failing fixtures for L11_overdecoration (RED)

### Maintenance

- gitignore .planning/memory/ (local handoff mirror)
- remove REQUIREMENTS.md for v0.3.0 milestone
- archive v0.3.0 milestone files

### Other

- revise 09-04 fixtures + 09-05 walker per plan-checker
- smallest-visual-first lint rules — 6 plans, 16 tasks, 5 waves

## 0.3.3 - 2026-05-10

Changes since v0.3.2.

### Features

- wire autofix into Stop-hook with fallback to rule-feedback
- extract lib/lint/width.js as single source — L08/L09 use visual width

### Documentation

- L10 entry + L09 visual-column note + README --fix mention
- add short/middle/full output-style preset proposal
- token-economical ASCII visuals + proposed L11/L12/L13
- SUMMARY for 01/02/04(partial); STATE sync to v0.3.2

### Tests

- add L08/L09 fixtures for combining marks, ZWJ, CJK, Unicode markers (RED)

## 0.3.2 - 2026-05-10

Changes since v0.3.1.

### Features

- CLI --fix flag — repair frames in place using autofix engine
- Wave 1 — autofix engine + L10 mixed-script rule
- /feynman accepts bump/highlight/eval subcommands

### Fixes

- replace c8 with native Node coverage (Node 26 compat)

### Tests

- add failing autofix tests (RED)

### Other

- runtime alignment check + autofix — CONTEXT, SPEC, 4 plans

## 0.3.1 - 2026-05-10

Changes since v0.3.0.

### Fixes

- close 6 WARNING from advisory code review (v0.3.1)

### Documentation

- sync ROADMAP+STATE after v0.3.0 release
- add 0.3.0 entry — 25 commits since v0.2.6

## 0.3.0 - 2026-05-10

Changes since v0.2.6.

### Features

- run iteration-2 3-way A/B harness — 60 answer.md files + findings
- rewrite feynman-activate.md as XML three-faced contract (GREEN)
- implement dual-format XML+HTML intensity extractor (GREEN)
- add L09 right-edge alignment rule (detection-only); bump v0.2.7

### Documentation

- mark VERIFICATION passed — human-verify items approved during 08-04 checkpoint
- complete iteration-2 plan — add SUMMARY.md
- produce 08-VERIFICATION.md — all 14 SPEC criteria ✓ with evidence
- complete plan — add SUMMARY.md (executor stalled, orchestrator rescue)
- update CLAUDE.md rule-file format section to XML element form
- complete hook XML intensity extractor plan
- complete plan — add SUMMARY.md
- explain compaction-survivor value-prop in README
- capture phase context — implementation decisions for XML rewrite
- SPEC + Q-2026-05-09-01 XML compat answer + runglish research
- capture Phase 8 evidence base — research + 28-run eval iteration
- pre-dispatch plan for L09 right-edge alignment lint rule

### Tests

- add failing rules-file integrity tests (RED)
- add failing XML intensity extraction tests (RED)
- add failing fixtures for L09 right-edge alignment

### Maintenance

- v0.3.0 — XML rule contract, token economy, suppression
- merge executor worktree (worktree-agent-ad5a4e26a5943d96d)
- merge executor worktree (worktree-agent-af28cf8b6f28457e1)
- merge executor worktree (worktree-agent-a7bc6060fbee54b82)
- merge quick task worktree (worktree-agent-a26deefae26181a12)

### Other

- 4 plans across 3 waves for XML rewrite phase

## 0.2.6 - 2026-05-08

Changes since v0.2.5.

### Features

- harden feynman runtime checks
- add roadmap phase uat risk patterns
- add sdlc output patterns to feynman
- add terminal-safe feynman rendering rules

### Fixes

- clarify terminal table rendering rules
- harden feynman hook lifecycle

### Documentation

- restore GSD validation coverage

### Tests

- cover codex app-server hook visibility
- cover ci threshold branches

### Maintenance

- use global gsd defaults
- remove gsd model bindings from repo config

## 0.2.5 - 2026-05-08

### Features

- add SessionStart hook priming alongside UserPromptSubmit reinforcement
- keep full diagram rules enabled by default for Claude Code and Codex

### Fixes

- preserve explicit /feynman off behavior with silent hooks
- keep feynman hooks quiet by omitting status messages

### Maintenance

- bump package and plugin manifest versions to 0.2.5
- expand tests for SessionStart registration and runtime behavior

## 0.2.4 - 2026-05-07

Changes since v0.2.2.

### Fixes

- normalize hook bypass docs and lint-safe examples

### CI/CD

- make coverage badge commit non-blocking on protected branch
- stabilize release note extraction by version section
- auto-update release notes and add npm publish verification

### Documentation

- expand examples gallery and add activity sequence
- update changelog for v0.2.3
- add advanced before-after examples

### Maintenance

- v0.2.4
- regenerate changelog for 0.2.3 updates
- auto-merge #2
- finalize launch docs, examples and PR auto-merge wiring
- complete v0.2.0 milestone audit docs
- sync plugin manifest versions for 0.2.2

## 0.2.3 - 2026-05-07

Changes since v0.2.2.

### Fixes

- normalize hook bypass docs and lint-safe examples

### CI/CD

- make coverage badge commit non-blocking on protected branch
- stabilize release note extraction by version section
- auto-update release notes and add npm publish verification

### Documentation

- expand examples gallery and add activity sequence
- update changelog for v0.2.3
- add advanced before-after examples

### Maintenance

- auto-merge #2
- finalize launch docs, examples and PR auto-merge wiring
- complete v0.2.0 milestone audit docs
- sync plugin manifest versions for 0.2.2
