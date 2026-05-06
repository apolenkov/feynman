# Roadmap: feynman

## Overview

feynman ships across two milestones. **v0.1** delivered the core IP — rules + hook + plugin manifest + README skeleton — plus skills, install.sh, MIT license, and GitHub publication (some via outside-GSD work). **v0.2.0 "Production-Ready"** turns that into a polished, well-tested, well-documented open-source release: cleanup, diagram linter (the main new feature), 100% test coverage, NPX install path, full domain-organized documentation, and a tagged release. Each phase leaves the project in a fully testable, shippable state.

## Phase Numbering

- Integer phases (1, 2, 3, …): Planned milestone work
- Decimal phases (6.5, 2.1, …): Insertions / parallel research tracks
- Numbering continues across milestones — Phase 1 = v0.1, Phases 2–7 = v0.2.0

## Completed Milestones

### v0.1 — Core (validated)

- [x] **Phase 1: Core** - Rules file + hook script + plugin manifest + README skeleton (the 3+1 files the user asked for first)

The skills layer (`/feynman`, `/feynman-stats`), `install.sh`, MIT license, and GitHub publication landed alongside Phase 1 via outside-GSD work and are reflected in the v0.1 traceability rows in REQUIREMENTS.md.

## Current Milestone: v0.2.0 Production-Ready

### Phases

- [ ] **Phase 2: Cleanup + State Schema** - Remove caveman framing, dead files, duplicate skill; rename state.count → state.injections; resolve SKIL-03
- [ ] **Phase 3: Diagram Linter** - ASCII parser + 8 lint rules (L01-L08) + bin/feynman-lint CLI + Stop-hook variant + 20+ golden test cases
- [ ] **Phase 4: Quality (Tests + CI)** - node:test suites for hook, lint, install; GitHub Actions matrix Linux+macOS; coverage badge ≥95%
- [ ] **Phase 5: Distribution (NPX + bash)** - package.json + bin/feynman.js unified CLI; npm publish; install.sh refactored to call Node logic
- [x] **Phase 6: Documentation** - examples/ per domain + docs/visual-patterns + docs/lint-rules + docs/architecture + CONTRIBUTING + .github templates + README rewrite
- [ ] **Phase 6.5: Self-Improvement Research** - design spec for self-improvement loop (lint failure → rule update); research-only, no implementation
- [ ] **Phase 7: Release v0.2.0** - git tag, GitHub release notes, npm publish, uninstall.sh, badges green

## Phase Details

### Phase 1: Core (v0.1 — completed)
**Goal**: The hook injects ASCII diagram rules on every prompt; the plugin is installable and produces value with no further configuration
**Depends on**: Nothing (first phase)
**Requirements**: RULE-01, RULE-02, RULE-03, RULE-04, HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, DIST-04, DOCS-01, DOCS-02
**Success Criteria** (what must be TRUE):
  1. Every time the user sends a prompt, Claude receives the diagram rules injected via additionalContext — no manual copy-paste required
  2. Responses that have flow/hierarchy/comparison/status-over-5-lines content include an appropriate ASCII diagram
  3. Responses that are single facts, short answers, or pure code blocks do NOT include an unsolicited diagram
  4. User can set intensity to lite, full, or ultra and the hook injects the matching rule variant
  5. README.md skeleton exists with before/after example and install one-liner placeholder
**Plans**: 3 plans completed

Plans:
- [x] 01-01-PLAN.md — Author rules/feynman-activate.md with three intensity variants (lite/full/ultra)
- [x] 01-02-PLAN.md — Implement hooks/feynman-activate.js (UserPromptSubmit hook)
- [x] 01-03-PLAN.md — Create .claude-plugin/plugin.json manifest and README.md skeleton

**UI hint**: no

### Phase 2: Cleanup + State Schema
**Goal**: v0.1 codebase is purged of caveman framing, dead files, duplicate skill, and lying field names; project surfaces describe feynman as a standalone tool; SKIL-03 (disable-model-invocation) is resolved
**Depends on**: Phase 1
**Requirements**: SKIL-03, CLN-01, CLN-02, CLN-03, CLN-04, CLN-05, CLN-06, CLN-07, CLN-08
**Success Criteria** (what must be TRUE):
  1. `grep -ri 'caveman' README.md hooks/ rules/ .planning/PROJECT.md` returns 0 matches in any public surface
  2. `commands/feynman.toml` and `skills/feynman-stats/` no longer exist on disk
  3. `node hooks/feynman-activate.js < test-input.json` outputs JSON with field `injections` (not `count`); SKILL.md scripts read the same field
  4. `skills/feynman/SKILL.md` frontmatter contains `disable-model-invocation: true`; running "draw a diagram" in a non-command context does NOT auto-invoke the skill
  5. `install.sh` no longer references `/feynman-stats`; running it on a clean machine produces a working install with the new structure
  6. `CLAUDE.md` and `.planning/PROJECT.md` contain no empty auto-generated stub sections; "Out of Scope" reflects v0.1-vs-v0.2.0 reality
**Plans**: 1 summary completed

**UI hint**: no

### Phase 3: Diagram Linter
**Goal**: feynman can validate any ASCII diagram against 8 structural rules — both as a standalone CLI (`feynman-lint <file>`) and as a Stop-hook that feeds corrections back to Claude on the next turn; this is the main new feature of v0.2.0 and closes the quality loop
**Depends on**: Phase 2 (clean state schema, no dead files to confuse the parser)
**Requirements**: LINT-01, LINT-02, LINT-03, LINT-04, LINT-05, LINT-06, LINT-07, LINT-08, LINT-09, LINT-10, LINT-11, LINT-12
**Success Criteria** (what must be TRUE):
  1. `lib/lint/parser.js` extracts ASCII diagram blocks from arbitrary markdown and returns a structured AST with line numbers
  2. `echo '┌─ broken' | node bin/feynman-lint.js /dev/stdin` exits with non-zero code and prints the failing rule ID (L01) with line number
  3. A valid diagram fixture (e.g. `tests/fixtures/valid-tree.md`) passes `feynman-lint` with exit code 0 and no output
  4. Each of the 8 rules (L01 box closure, L02 tree chars, L03 arrow style, L04 column widths, L05 flow integrity, L06 priority scale, L07 mermaid+ASCII mix, L08 frame width) has at least one positive and one negative golden test case in `tests/lint-cases.json` (≥20 cases total)
  5. The Stop-hook variant (`hooks/feynman-lint.js`) runs against Claude's last response; on lint failure it emits `additionalContext` with the rule failures so Claude self-corrects on the next turn
**Plans**: TBD

**UI hint**: no

### Phase 4: Quality (Tests + CI)
**Goal**: Every line of `hooks/`, `lib/lint/`, and `bin/` is covered by automated tests; GitHub Actions runs the full suite on Linux+macOS for every PR and push to main; the production-ready quality bar is mechanically verified
**Depends on**: Phase 3 (linter must exist before it can be tested to coverage)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. `node --test tests/` runs locally and exits 0 with all hook + lint + install suites green
  2. `tests/hook.test.js` covers the 5 paths: first-run bootstrap, normal flow, disabled state, intensity switch, corrupt-state recovery
  3. GitHub Actions CI workflow is green on `main` for both `ubuntu-latest` and `macos-latest`; the same workflow fails CI on lint or test failure
  4. `c8` (or equivalent) reports ≥95% line coverage on `hooks/`, `lib/lint/`, `bin/`; coverage badge in README.md reflects the live number
  5. The test report explicitly names all 8 lint rules and shows positive+negative coverage for each
**Plans**: TBD

**UI hint**: no

### Phase 5: Distribution (NPX + bash)
**Goal**: A user on a clean machine can install feynman with `npx feynman install`, uninstall it with `npx feynman uninstall`, diagnose issues with `npx feynman doctor`, and run the linter with `npx feynman lint <file>`; the bash one-liner remains as a fallback and shares the same install logic (DRY)
**Depends on**: Phase 4 (don't ship untested distribution artefacts)
**Requirements**: NPX-01, NPX-02, NPX-03, NPX-04, NPX-05, NPX-06
**Success Criteria** (what must be TRUE):
  1. `npx feynman@0.2.0 install` in a clean docker container (node:18-alpine) registers the hook in `~/.claude/settings.json` with an absolute path; running it twice is idempotent
  2. `npx feynman doctor` prints a status frame showing hook registered, state.json valid, rules file readable, lint hook registered (or clear failure for each)
  3. `bash install.sh` (the legacy path) internally invokes `node bin/feynman.js install` — `grep -c 'feynman.js install' install.sh ≥ 1`; install logic exists in exactly one place
  4. `feynman` package is publicly resolvable on the npm registry at version 0.2.0 with the correct `bin`, `files`, and `engines.node >= 18` fields
  5. README install section leads with `npx feynman install`; the bash one-liner is documented as a fallback; manual settings.json instructions are still present for power users
**Plans**: TBD

**UI hint**: no

### Phase 6: Documentation
**Goal**: A first-time visitor to the feynman repo can read the README in 90 seconds and understand the value, see real before/after sessions across 6 domains (architecture, API flow, DB schema, algorithm, deploy, code review), find authoritative docs for the 8 lint rules, understand the internal architecture, and know how to contribute via templated issues and PRs
**Depends on**: Phase 3 (docs reference linter rules and parser)
**Requirements**: DOCS2-01, DOCS2-02, DOCS2-03, DOCS2-04, DOCS2-05, DOCS2-06, DOCS2-07, DOCS2-08, DOCS2-09, DOCS2-10, DOCS2-11, DOCS2-12, DOCS2-13
**Success Criteria** (what must be TRUE):
  1. `examples/` contains 6 markdown files, one per domain (architecture-review, api-flow, db-schema, algorithm-explain, deploy-pipeline, code-review), each showing a real session with diagrams
  2. `docs/lint-rules.md` documents L01-L08 with at least one valid + one invalid example per rule, line numbers cross-referenced to `lib/lint/rules.js`
  3. `docs/visual-patterns.md` distils Tufte/Few/Bertin principles into ≤2000 words mapped to ASCII; cited sources listed
  4. `docs/architecture.md` shows hook lifecycle, lint pipeline, and state schema as ASCII diagrams (drawn by feynman itself)
  5. `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, and `.github/PULL_REQUEST_TEMPLATE.md` exist; opening a new issue on GitHub presents the templates
  6. README rewrite shows badges (CI, coverage, npm, license) all green; "Why feynman" section explains standalone value with no caveman framing
**Plans**: TBD

**UI hint**: no

### Phase 6.5: Self-Improvement Research
**Goal**: Design a closed-loop self-improvement mechanism on paper: how `feynman-lint` failure logs would feed back into rule updates with a human-in-the-loop review gate, what data schema is needed, what's deferred to v0.3.0; produce one design spec document. No implementation in this milestone
**Depends on**: Phase 3 (need linter to know what failure data looks like) — runs in parallel with Phase 6
**Requirements**: RES-01, RES-02
**Success Criteria** (what must be TRUE):
  1. `docs/self-improvement.md` exists and describes: failure log schema, aggregation step, rule-update proposal format, human-review gate, rollout cadence, kill-switch — without committing to an implementation
  2. The spec explicitly marks the implementation as deferred to v0.3.0 (BENCH-V3-02) and lists open questions
  3. `docs/visual-patterns.md` (shared with DOCS2-07) cites the research foundation behind L01-L08 with at least one source per rule family
**Plans**: TBD

**UI hint**: no

### Phase 7: Release v0.2.0
**Goal**: Cut v0.2.0 — git tag, GitHub release with notes, npm package live, uninstall.sh shipped, all README badges green; downstream users can install and uninstall feynman cleanly and read what changed since v0.1
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 6.5
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria** (what must be TRUE):
  1. `git tag --list` contains `v0.2.0` with an annotated message; `git show v0.2.0` shows the release notes
  2. The GitHub release page for `v0.2.0` lists what's new, what's fixed, breaking changes, and migration notes from v0.1
  3. `npm view feynman version` returns `0.2.0`; `npx feynman@0.2.0 install` works in a fresh container
  4. `bash uninstall.sh` removes the hook entry from `~/.claude/settings.json` and deletes `~/.claude/.feynman-active`; prompts the user before deleting `state.json`
  5. README badges (CI passing, coverage ≥95%, npm version 0.2.0, MIT license) all render green on the public repo page
**Plans**: TBD

**UI hint**: no

## Progress

**Execution Order:**

Phases execute in numeric order with one parallel branch:

```
Phase 1 (v0.1, done)
   │
   ▼
Phase 2 (Cleanup)
   │
   ▼
Phase 3 (Linter)  ──────────────┐
   │                            │
   ▼                            ▼
Phase 4 (Tests+CI)         Phase 6 (Docs)
   │                            │
   ▼                            │
Phase 5 (NPX+bash)              │
   │                            │
   │                       Phase 6.5 (Research)
   │                            │
   └──────────┬─────────────────┘
              ▼
         Phase 7 (Release v0.2.0)
```

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core (v0.1) | 3/3 | Completed | 2026-05-06 |
| 2. Cleanup + State Schema | 0/TBD | Not started | - |
| 3. Diagram Linter | 0/TBD | Not started | - |
| 4. Quality (Tests + CI) | 0/TBD | Not started | - |
| 5. Distribution (NPX + bash) | 0/TBD | Not started | - |
| 6. Documentation | 1/1 | Completed | 2026-05-06 |
| 6.5. Self-Improvement Research | 0/TBD | Not started | - |
| 7. Release v0.2.0 | 0/TBD | Not started | - |
