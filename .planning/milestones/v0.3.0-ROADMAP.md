# Roadmap: feynman

## Overview

feynman ships across two milestones. **v0.1** delivered the core IP — rules + hook + plugin manifest + README skeleton — plus skills, install.sh, MIT license, and GitHub publication (some via outside-GSD work). **v0.2.0 "Production-Ready"** turns that into a polished, well-tested, well-documented open-source release for both Claude Code and Codex: cleanup, diagram linter (the main new feature), 95%+ test coverage, NPX install path, full domain-organized documentation, dual plugin metadata, and a tagged release. Each phase leaves the project in a fully testable, shippable state.

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

- [x] **Phase 2: Cleanup + State Schema** - Remove caveman framing, dead files, duplicate skill; rename state.count → state.injections; resolve SKIL-03
- [x] **Phase 3: Diagram Linter** - ASCII parser + 8 lint rules (L01-L08) + bin/feynman-lint CLI + Stop-hook variant + 20+ golden test cases
- [x] **Phase 4: Quality (Tests + CI)** - node:test suites for hook, lint, install; GitHub Actions matrix Linux+macOS; coverage badge ≥95%
- [x] **Phase 5: Distribution (NPX + bash)** - package.json + bin/feynman.js unified CLI; npm publish; install.sh refactored to call Node logic
- [x] **Phase 6: Documentation** - examples/ per domain + docs/visual-patterns + docs/lint-rules + docs/architecture + CONTRIBUTING + .github templates + README rewrite
- [x] **Phase 6.5: Self-Improvement Research** - design spec for self-improvement loop (lint failure → rule update); research-only, no implementation
- [x] **Phase 7: Release v0.2.0** - git tag, GitHub release notes, npm publish, uninstall.sh, badges green

## Current Milestone: v0.3.0 Prompt Architecture

### Phases

- [x] **Phase 8: Prompt Architecture Rewrite (XML contract)** - Переписать `rules/feynman-activate.md` под XML-контракт (F1+F2+F4+F7); миграция парсера хука с HTML-комментов на XML intensity-теги; secondary: F3 (расширенные few-shot) + F5 (CoT classify-first) — released as v0.3.0 on 2026-05-10
- [ ] **Phase 8.5: Runtime alignment check + autofix** - Доработать линтер: L09 (right-edge alignment detection), L10 (mixed-script Cyr+Lat warn), L08 hardening; deterministic autofix engine `lib/lint/autofix.js` (pad inner lines + перерендер top/bottom border); Stop-hook применяет autofix BEFORE показа модели; 20+ golden фикстур (D1, D3, D4)
- [x] **v0.2.7 hotfix (вне фазы)** - L09 detection-only в текущий линтер; быстрый patch-релиз перед Phase 8/8.5; autofix откладывается до Phase 8.5 — landed 1d4ae5f

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
**Plans**: TBD

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
**Goal**: A user on a clean machine can install feynman for Claude Code, Codex, or both with `npx @albinocrabs/feynman install --target claude|codex|both`, uninstall it with `npx @albinocrabs/feynman uninstall`, diagnose issues with `npx @albinocrabs/feynman doctor`, and run the linter with `npx @albinocrabs/feynman lint <file>`; the bash one-liner remains as a Claude Code fallback and shares the same install logic (DRY)
**Depends on**: Phase 4 (don't ship untested distribution artefacts)
**Requirements**: NPX-01, NPX-02, NPX-03, NPX-04, NPX-05, NPX-06, NPX-07, NPX-08
**Success Criteria** (what must be TRUE):
  1. `npx @albinocrabs/feynman@0.2.0 install` in a clean docker container (node:18-alpine) registers the hook in `~/.claude/settings.json` with an absolute path; running it twice is idempotent
  2. `npx @albinocrabs/feynman@0.2.0 install --target codex` registers the hook in `~/.codex/hooks.json` with `FEYNMAN_HOME=~/.codex`; running it twice is idempotent
  3. `npx @albinocrabs/feynman doctor --target claude|codex` prints a status frame showing hook registered, state.json valid, rules file readable, lint hook registered (or clear failure for each)
  4. `bash install.sh` (the legacy path) internally invokes `node bin/feynman.js install` — `grep -c 'feynman.js install' install.sh ≥ 1`; install logic exists in exactly one place
  5. `@albinocrabs/feynman` package is publicly resolvable on the npm registry at version 0.2.0 with the correct `bin`, `files`, plugin manifests, and `engines.node >= 18` fields
  6. README install section leads with `npx @albinocrabs/feynman install --target claude|codex|both`; the bash one-liner is documented as a fallback; manual settings.json/hooks.json instructions are still present for power users
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
**Plans**: 1 summary completed

**UI hint**: no

### Phase 6.5: Self-Improvement Research
**Goal**: Design a closed-loop self-improvement mechanism on paper: how `feynman-lint` failure logs would feed back into rule updates with a human-in-the-loop review gate, what data schema is needed, what's deferred to v0.3.0; produce one design spec document. No implementation in this milestone
**Depends on**: Phase 3 (need linter to know what failure data looks like) — runs in parallel with Phase 6
**Requirements**: RES-01, RES-02
**Success Criteria** (what must be TRUE):
  1. `docs/self-improvement.md` exists and describes: failure log schema, aggregation step, rule-update proposal format, human-review gate, rollout cadence, kill-switch — without committing to an implementation
  2. The spec explicitly marks the implementation as deferred to v0.3.0 (BENCH-V3-02) and lists open questions
  3. `docs/visual-patterns.md` (shared with DOCS2-07) cites the research foundation behind L01-L08 with at least one source per rule family
**Plans**: 1 summary completed

**UI hint**: no

### Phase 7: Release v0.2.0
**Goal**: Cut v0.2.0 — git tag, GitHub release with notes, npm package live, uninstall.sh shipped, all README badges green; downstream users can install and uninstall feynman cleanly for Claude Code and Codex and read what changed since v0.1
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 6.5
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria** (what must be TRUE):
  1. `git tag --list` contains `v0.2.0` with an annotated message; `git show v0.2.0` shows the release notes
  2. The GitHub release page for `v0.2.0` lists what's new, what's fixed, breaking changes, and migration notes from v0.1
  3. `npm view @albinocrabs/feynman version` returns `0.2.0`; `npx @albinocrabs/feynman@0.2.0 install` works in a fresh container
  4. `bash uninstall.sh` removes the hook entry from `~/.claude/settings.json` and deletes `~/.claude/.feynman-active`; prompts the user before deleting `state.json`
  5. README badges (CI passing, coverage ≥95%, npm version 0.2.0, MIT license) all render green on the public repo page
**Plans**: TBD

**UI hint**: no

### Phase 8.5: Runtime alignment check + autofix
**Goal**: ASCII-фрейм блоки геометрически корректны на момент рендера; линтер автопочинит mis-aligned `│` колонны и broken top/bottom-border lengths; Stop-hook применяет autofix к ответу модели до показа пользователю; D1 (right-edge mis-align), D3 (line overflow), D4 (orphan tree branches) исчезают на любых rule-вариантах
**Depends on**: Phase 7 (v0.2.0 release shipped) — independent of Phase 8 (работает на любых правилах; ship порядок 8.5 → 8)
**Requirements**: TBD (соберутся в spec-phase)
**Success Criteria** (what must be TRUE):
  1. `lib/lint/rules.js` экспортирует `L09_right_edge_alignment` — для каждого frame блока проверяет, что все `│` стоят на колонне `W+1`, top `┐` и bottom `┘` на той же колонне; positive + negative golden фикстуры
  2. `lib/lint/rules.js` экспортирует `L10_mixed_script` — regex `[А-я][A-Za-z]|[A-Za-z][А-я]` внутри одного слова → warn (не error, без autofix); `zachischены` ловится, `gsd-sdk` (legitimate proper noun) — нет (whitelist)
  3. `lib/lint/autofix.js` экспортирует `autofixFrame(astNode) → string` — pure function: вычисляет `W = max(stripAnsi(line).length для inner lines)`, перерендерит top `┌─...─┐` (W+2), bottom `└─...─┘`, padит каждую inner-line spaces до column `W+1`, добавляет `│`
  4. `bin/feynman-lint.js --fix` применяет autofix к файлу in-place; без флага — detection-only поведение Phase 3 сохраняется
  5. `hooks/feynman-lint.js` (Stop-hook) применяет autofix к ответу модели через `additionalContext` patch; если patch невозможен (нет valid frame structure) → fallback на текущий behavior (фидбэк правил модели)
  6. ≥20 golden фикстур в `tests/lint-cases.json` для L09/L10/autofix; 5+ end-to-end случаев с реальными мисалаймент-блоками из issue-репортов
  7. `npm test` и `npm run lint:md` зелёные; coverage ≥95% сохраняется

**Plans**: TBD

**UI hint**: no

### Phase 8: Prompt Architecture Rewrite (XML contract + token economy + suppression)
**Goal**: `rules/feynman-activate.md` инжектит XML-структурированный rule-контракт с three-faced поведением: (1) **amplify** визуал где baseline пусто (sequence/branching), (2) **channel** в дешёвый формат где baseline уже визуализирует (comparison → MD table, status → dot-leader, hierarchy → indent), (3) **suppress** over-instrumentation для simple Q&A (definition/recommendation/greeting). Парсер хука читает `<intensity name="...">` вместо HTML-комментов. Compliance gain измерим через iteration-2 на eval-set из 20 промтов.
**Depends on**: Phase 7 (v0.2.0 release shipped) + Q-2026-05-09-01 resolved (XML compatibility across Codex/Cursor)
**Evidence base**: `.planning/notes/prompt-rewrite-research-2026-05-09.md` (research) + `.planning/notes/eval-iteration-1-findings-2026-05-09.md` (28 subagent runs)
**Requirements**: PROMPT-01..11 (defined in 08-SPEC.md; map 1:1 to SPEC requirements §1-§11)
**Factor scope** (research + eval evidence):
  - F1 XML-tagged sections (`<structure_triggers>`, `<diagram_syntax>`, `<examples>`, `<output_contract>`) — research
  - F2 ~~drop negative conditions~~ **CANCELLED** — eval-13/15 prove negatives protect single-fact/prose-opt-out
  - F3 expanded few-shot literals (3 per class) — research
  - F4 decision-table `structure → visual` + **«ONE primary visual per response»** budget rule
  - F5 CoT classify-first — research
  - F7 XML intensity wrapper — parser migration
  - F8 token-economy matrix (research-confirmed): dot-leader > frame; MD table > ASCII pipes; indent > box-tree
  - F9 mutex visuals: SDLC patterns are alternatives — pick ONE, never stack (eval-07/08 evidence)
  - F10 **NEW** suppress over-instrumentation: simple Q&A → prose, even when structure exists (eval-20 evidence)
  - F11 **NEW** channel format: when baseline visualizes well, point to cheaper variant (eval-05/07/08)
**Success Criteria** (what must be TRUE):
  1. `rules/feynman-activate.md` использует XML-обёртку (F1); intensity-варианты — `<intensity name="...">`
  2. Negative-condition section сохранена (F2 cancelled); опционально переформулирована позитивно — условия остаются
  3. Decision-table `structure → visual` как primary trigger; включает «ONE primary visual» (F4 + F8 + F11)
  4. Few-shot — 3 канонических на класс с литералами `├── └── ┌─┐` (F3)
  5. CoT classify-first в `<output_contract>`: «(1) тип структуры? (2) baseline визуализирует это сам? (3) channel/amplify/suppress?»
  6. SDLC patterns помечены mutex (F9): «выбери ОДИН, не стакай»
  7. Suppress-rule (F10) явно покрывает definition/recommendation/question/greeting
  8. `hooks/feynman-activate.js` парсит `<intensity name="...">`; миграционный коммит; `tests/hook.test.js` зелёные
  9. README — compaction-survivor value-prop
  10. iteration-2 A/B на 20-eval set: WIN-классы (sequence/branching) ≥ baseline compliance; HURT-классы (comparison/status/priority) → cheaper format AND ≤1 visual; negatives → NO regression
  11. Token cost: `additionalContext` payload ≥20% меньше (~5.6KB → ≤4.5KB)
**Plans:** 4 plans
- [x] 08-01-PLAN.md — Hook parser dual-format support (XML + legacy HTML comments) + XML extraction tests (TDD)
- [x] 08-02-PLAN.md — Rewrite rules/feynman-activate.md as XML contract (≤4480 bytes; closes SPEC §1-§9, §11)
- [x] 08-03-PLAN.md — README compaction-survivor section (Why UserPromptSubmit, not SessionStart)
- [x] 08-04-PLAN.md — Iteration-2 3-way A/B harness + 08-VERIFICATION.md with all 14 SPEC criteria

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
| 2. Cleanup + State Schema | verification | Completed | 2026-05-06 |
| 3. Diagram Linter | verification | Completed | 2026-05-06 |
| 4. Quality (Tests + CI) | verification | Completed | 2026-05-06 |
| 5. Distribution (NPX + bash) | 1/1 + Codex addendum | Completed | 2026-05-06 |
| 6. Documentation | 1/1 | Completed | 2026-05-06 |
| 6.5. Self-Improvement Research | 1/1 | Completed | 2026-05-06 |
| 7. Release v0.2.0 | complete | Published to npm, tagged, GitHub release created; follow-up v0.2.4 release automation and version-alignment pending | 2026-05-07 |
