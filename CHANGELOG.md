# Changelog

All notable changes to this project are documented here.

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
