# Requirements: feynman

**Defined:** 2026-05-06
**Last updated:** 2026-05-06 — milestone v0.2.0 started
**Core Value:** Every response with structure gets an ASCII diagram without the developer asking. v0.2.0 closes the loop with a Stop-hook linter that validates output.

## v0.1 Requirements (validated)

### Hook

- [x] **HOOK-01**: Hook outputs JSON `{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: "..."}}` — not plain stdout (confirmed bug #13912)
- [x] **HOOK-02**: Hook registered in `~/.claude/settings.json` with absolute expanded path — not via plugin.json (confirmed bug #10225, #8810)
- [x] **HOOK-03**: Hook reads `state.json`; exits silently (code 0) when disabled
- [x] **HOOK-04**: Hook selects rule variant based on intensity level (lite / full / ultra)
- [x] **HOOK-05**: Hook increments session diagram counter in state.json (NOTE: counts hook fires; renamed in CLN-04)

### Rules

- [x] **RULE-01**: `rules/feynman-activate.md` defines WHEN to draw — flow → ASCII boxes+arrows; hierarchy → tree; comparison → side-by-side columns; status >5 lines → ┌─frame─┐ blocks; priority chain → ▲▼ scales
- [x] **RULE-02**: Rules define explicit WHEN NOT to draw — single facts, code blocks, short answers (<5 lines without structure)
- [x] **RULE-03**: Three intensity variants: `lite` (flow+trees only), `full` (all types, default), `ultra` (force diagram even for short answers)
- [x] **RULE-04**: Rules phrased as declarative facts, not commands; each variant under 8,000 chars

### Skills

- [x] **SKIL-01**: `skills/feynman/SKILL.md` implements `/feynman` command (toggle on/off, switch intensity)
- [x] **SKIL-02**: `skills/feynman-stats/SKILL.md` implements `/feynman-stats` (NOTE: duplicates /feynman status; deleted in CLN-03)
- [ ] **SKIL-03**: `/feynman` skill has `disable-model-invocation: true` to prevent auto-invocation on "draw a diagram" queries (deferred to v0.2.0 quality pass)

### Distribution (v0.1 partial)

- [x] **DIST-01**: `install.sh` idempotently upserts hook entry into `~/.claude/settings.json` using `node -e` inline (no `jq`); expands tilde to absolute path at install time
- [x] **DIST-04**: `.claude-plugin/plugin.json` manifest with `name`, `version` (semver), `description`

### Documentation (v0.1 partial)

- [x] **DOCS-01**: `README.md` before/after table — same answer without feynman (prose) vs with feynman (ASCII diagram)
- [x] **DOCS-02**: `README.md` install section
- [x] **DOCS-03**: `README.md` intensity levels table (lite / full / ultra)

## v0.2.0 Requirements (Production-Ready)

### Cleanup

- [x] **CLN-01**: Remove all caveman mentions from public files (README.md, hooks/feynman-activate.js comments, .planning/PROJECT.md surfaces) — standalone positioning
- [x] **CLN-02**: Delete `commands/feynman.toml` — dead file, Claude Code uses `.md` not `.toml`
- [x] **CLN-03**: Delete `skills/feynman-stats/` — duplicates `/feynman status`; consolidate into single `/feynman` command
- [x] **CLN-04**: Rename `state.count` → `state.injections` everywhere (hook, SKILL.md scripts, docs) — current name lies, counts hook fires not diagrams drawn
- [x] **CLN-05**: Clean project CLAUDE.md from auto-generated empty stubs (`### Hook Runtime` etc with no content; `## Open Questions` empty section)
- [x] **CLN-06**: Update install.sh to reflect cleaned structure (drop /feynman-stats command install)
- [x] **CLN-07**: Resolve SKIL-03 — add `disable-model-invocation: true` to `/feynman` skill frontmatter
- [x] **CLN-08**: Update PROJECT.md and `Out of Scope` to reflect v0.1 actual scope vs v0.2.0 scope

### Diagram Linter (main new feature)

- [x] **LINT-01**: `lib/lint/parser.js` — ASCII diagram block parser; detects diagrams in markdown (between ``` or as freestanding ASCII art); returns structured AST
- [x] **LINT-02**: `lib/lint/rules.js` rule **L01 box closure** — every `┌─...─┐` opening pair has matching `└─...─┘` with vertical alignment; vertical bars `│` align
- [x] **LINT-03**: `lib/lint/rules.js` rule **L02 tree chars** — `├──` for non-last children, `└──` for last; flag inversions
- [x] **LINT-04**: `lib/lint/rules.js` rule **L03 arrow style** — single arrow style per diagram (`→` or `-->` or `─→`); flag mixing
- [x] **LINT-05**: `lib/lint/rules.js` rule **L04 column widths** — table column widths consistent across rows; `|---|---|` separator matches column count
- [x] **LINT-06**: `lib/lint/rules.js` rule **L05 flow integrity** — between any two `[Box]` tokens an arrow must exist; orphan boxes flagged
- [x] **LINT-07**: `lib/lint/rules.js` rule **L06 priority scale** — when `▲` present, `▼` also present (and vice versa)
- [x] **LINT-08**: `lib/lint/rules.js` rule **L07 no mermaid+ASCII mix** — if ASCII present in response, no `\`\`\`mermaid` blocks (and vice versa)
- [x] **LINT-09**: `lib/lint/rules.js` rule **L08 frame width discipline** — all rows inside a frame block have consistent width
- [x] **LINT-10**: `bin/feynman-lint.js` — standalone CLI; `feynman-lint <file.md>` returns 0/non-zero, prints rule failures with line numbers
- [x] **LINT-11**: `hooks/feynman-lint.js` — Stop-hook variant; reads Claude's last response; if lint fails, outputs `additionalContext` with corrections for next turn
- [x] **LINT-12**: `tests/lint-cases.json` — 20+ golden test cases (10+ valid, 10+ invalid, one per rule)

### Quality (Tests + CI)

- [x] **TEST-01**: `tests/hook.test.js` — e2e via stdin: first-run bootstrap, normal flow, disabled, intensity switch, corrupt state recovery, all 5 paths covered
- [x] **TEST-02**: `tests/lint.test.js` — every rule L01-L08 has positive + negative case; golden cases from LINT-12 all pass
- [x] **TEST-03**: `tests/install.test.js` — install/uninstall idempotency; settings.json merge with existing hooks; missing-Node error path
- [x] **TEST-04**: GitHub Actions CI workflow — runs on PR + push to main; matrix Linux + macOS; node:test runner; fails CI on lint or test failure
- [x] **TEST-05**: Coverage badge in README.md (codecov or shield from c8 output); target ≥95% line coverage on `hooks/`, `lib/lint/`, `bin/`
- [x] **TEST-06**: 100% coverage of all 8 lint rules verified explicitly in test report

### Distribution (NPX + bash)

- [x] **NPX-01**: `package.json` with name "feynman", version "0.2.0", `bin` entries, `files` whitelist, `engines.node >= 18`
- [x] **NPX-02**: `bin/feynman.js` — unified CLI; subcommands: `install`, `uninstall`, `doctor`, `lint`, `version`; `--help` for each
- [ ] **NPX-03**: `npm publish` — @albinocrabs/feynman package live on npm registry; verified by running `npx @albinocrabs/feynman@0.2.0 install` in clean env
- [x] **NPX-04**: `bash install.sh` refactored to call `node bin/feynman.js install` internally — DRY single source of install logic
- [x] **NPX-05**: README install section updated: primary `npx @albinocrabs/feynman install`, fallback bash one-liner, manual settings.json instructions
- [x] **NPX-06**: `feynman doctor` — checks hook registered? state.json valid? rules file readable? lint hook registered? prints status frame
- [x] **NPX-07**: Codex target support — `npx @albinocrabs/feynman install --target codex` writes `~/.codex/hooks.json`, `~/.codex/.feynman/state.json`, and `~/.codex/.feynman-active`; install is idempotent
- [x] **NPX-08**: Plugin metadata for both clients — `.claude-plugin/plugin.json` + `hooks/hooks.json`, `.codex-plugin/plugin.json` + repo-root `hooks.json`, all included in npm package files

### Documentation (visitkarte)

- [x] **DOCS2-01**: `examples/architecture-review.md` — example session showing feynman drawing architecture diagrams from architecture questions
- [x] **DOCS2-02**: `examples/api-flow.md` — request/response flow examples
- [x] **DOCS2-03**: `examples/db-schema.md` — entity relationships, table structure examples
- [x] **DOCS2-04**: `examples/algorithm-explain.md` — algorithm walkthrough with state machine + flow diagrams
- [x] **DOCS2-05**: `examples/deploy-pipeline.md` — CI/CD pipeline visualization examples
- [x] **DOCS2-06**: `examples/code-review.md` — code review session with priority + comparison diagrams
- [x] **DOCS2-07**: `docs/visual-patterns.md` — visualization research (Tufte, Few, Bertin) adapted to ASCII; principles distilled into ≤2000 words
- [x] **DOCS2-08**: `docs/lint-rules.md` — full L01-L08 documentation with valid/invalid examples per rule
- [x] **DOCS2-09**: `docs/architecture.md` — internal architecture: hook lifecycle, lint pipeline, state schema, with ASCII diagrams
- [x] **DOCS2-10**: `CONTRIBUTING.md` improved — PR checklist, issue triage, governance, "what's a good first PR"
- [x] **DOCS2-11**: `.github/ISSUE_TEMPLATE/bug_report.md` + `.github/ISSUE_TEMPLATE/feature_request.md`
- [x] **DOCS2-12**: `.github/PULL_REQUEST_TEMPLATE.md`
- [x] **DOCS2-13**: README full rewrite — badges (CI, coverage, npm version, license), screenshots/GIF placeholders, NPX-first install, intensity examples with linter results, "Why feynman" section explaining standalone value

### Research

- [x] **RES-01**: `docs/self-improvement.md` — design spec for self-improvement loop: how feynman-lint failure logs feed back to rules updates; human-in-loop review gate; data collection schema; full implementation deferred to v0.3.0
- [x] **RES-02**: `docs/visual-patterns.md` (links to DOCS2-07) — research foundation for L01-L08 rules; cite sources

### Release

- [ ] **REL-01**: `git tag v0.2.0` with annotated tag message
- [ ] **REL-02**: GitHub release with notes — what's new, what's fixed, breaking changes, migration from v0.1
- [ ] **REL-03**: `npm publish` (depends on NPX-03) at version 0.2.0
- [ ] **REL-04**: `uninstall.sh` for clean removal — removes hook entry from settings.json + deletes ~/.claude/.feynman-active flag (preserves state.json with prompt)
- [ ] **REL-05**: README badges all green (CI passing, coverage ≥95%, npm version 0.2.0)

## Future (v0.3.0+)

### Benchmark

- **BENCH-V3-01**: Empirical benchmark "diagram coverage with vs without feynman" — 50 prompts, run with/without feynman, measure % of responses with valid diagram, LLM-judge for diagram quality
- **BENCH-V3-02**: Self-improvement loop full implementation — automated rule updates based on lint failure patterns

### Customization

- **CUST-V3-01**: `feynman.config.yaml` for team-specific diagram conventions
- **CUST-V3-02**: Domain packs — `feynman pack arch` / `feynman pack db` / `feynman pack devops` switches active rule set

### Distribution

- **DIST-V3-01**: `install.ps1` Windows PowerShell installer
- **DIST-V3-02**: Claude Code Marketplace submission once Anthropic opens registry
- **DIST-V3-03**: IDE compatibility (`.clinerules/feynman.md`, `.cursor/rules/feynman.mdc`, `.windsurf/rules/feynman.md`) — deferred from v0.1

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom diagram renderers (Mermaid, graphviz) | ASCII-only; zero deps is the design |
| Per-project diagram style config (v0.2.0) | Deferred to v0.3.0 as `feynman.config.yaml` if demand |
| Web UI / dashboard | CLI/hook plugin only |
| Real-time diagram preview | Not a hook capability; separate tool category |
| Diagram count analytics / telemetry | Privacy; user opt-in would be required; skip for open-source plugin |
| Caveman compatibility framing in public surface | User wants standalone positioning; both can coexist functionally without docs claim |
| Automatic ASCII rendering | Linter validates; doesn't render. Rendering = user/IDE responsibility |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOOK-01 | Phase 1 (v0.1) | Validated |
| HOOK-02 | Phase 1 (v0.1) | Validated |
| HOOK-03 | Phase 1 (v0.1) | Validated |
| HOOK-04 | Phase 1 (v0.1) | Validated |
| HOOK-05 | Phase 1 (v0.1) | Validated |
| RULE-01 | Phase 1 (v0.1) | Validated |
| RULE-02 | Phase 1 (v0.1) | Validated |
| RULE-03 | Phase 1 (v0.1) | Validated |
| RULE-04 | Phase 1 (v0.1) | Validated |
| SKIL-01 | (outside-GSD v0.1) | Validated |
| SKIL-02 | (outside-GSD v0.1) | Deleted in CLN-03 |
| SKIL-03 | Phase 2 | Validated |
| DIST-01 | Phase 1 + outside-GSD | Validated |
| DIST-04 | Phase 1 | Validated |
| DOCS-01 | Phase 1 | Validated |
| DOCS-02 | Phase 1 | Validated |
| DOCS-03 | Phase 1 + outside-GSD | Validated |
| CLN-01 | Phase 2 | Validated |
| CLN-02 | Phase 2 | Validated |
| CLN-03 | Phase 2 | Validated |
| CLN-04 | Phase 2 | Validated |
| CLN-05 | Phase 2 | Validated |
| CLN-06 | Phase 2 | Validated |
| CLN-07 | Phase 2 | Validated |
| CLN-08 | Phase 2 | Validated |
| LINT-01 | Phase 3 | Validated |
| LINT-02 | Phase 3 | Validated |
| LINT-03 | Phase 3 | Validated |
| LINT-04 | Phase 3 | Validated |
| LINT-05 | Phase 3 | Validated |
| LINT-06 | Phase 3 | Validated |
| LINT-07 | Phase 3 | Validated |
| LINT-08 | Phase 3 | Validated |
| LINT-09 | Phase 3 | Validated |
| LINT-10 | Phase 3 | Validated |
| LINT-11 | Phase 3 | Validated |
| LINT-12 | Phase 3 | Validated |
| TEST-01 | Phase 4 | Validated |
| TEST-02 | Phase 4 | Validated |
| TEST-03 | Phase 4 | Validated |
| TEST-04 | Phase 4 | Validated |
| TEST-05 | Phase 4 | Validated |
| TEST-06 | Phase 4 | Validated |
| NPX-01 | Phase 5 | Validated |
| NPX-02 | Phase 5 | Validated |
| NPX-03 | Phase 5 | Pending |
| NPX-04 | Phase 5 | Validated |
| NPX-05 | Phase 5 | Validated |
| NPX-06 | Phase 5 | Validated |
| NPX-07 | Phase 5 | Validated |
| NPX-08 | Phase 5 | Validated |
| DOCS2-01 | Phase 6 | Validated |
| DOCS2-02 | Phase 6 | Validated |
| DOCS2-03 | Phase 6 | Validated |
| DOCS2-04 | Phase 6 | Validated |
| DOCS2-05 | Phase 6 | Validated |
| DOCS2-06 | Phase 6 | Validated |
| DOCS2-07 | Phase 6 | Validated |
| DOCS2-08 | Phase 6 | Validated |
| DOCS2-09 | Phase 6 | Validated |
| DOCS2-10 | Phase 6 | Validated |
| DOCS2-11 | Phase 6 | Validated |
| DOCS2-12 | Phase 6 | Validated |
| DOCS2-13 | Phase 6 | Validated |
| RES-01 | Phase 6.5 | Validated |
| RES-02 | Phase 6.5 | Validated |
| REL-01 | Phase 7 | Pending |
| REL-02 | Phase 7 | Pending |
| REL-03 | Phase 7 | Pending |
| REL-04 | Phase 7 | Pending |
| REL-05 | Phase 7 | Pending |

**Coverage:**
- v0.1 requirements: 17 (HOOK-01..05, RULE-01..04, SKIL-01..03, DIST-01, DIST-04, DOCS-01..03) — all validated; SKIL-03 was carried into Phase 2 and closed there
- v0.2.0 requirements: 54 total (8 CLN + 12 LINT + 6 TEST + 8 NPX + 13 DOCS2 + 2 RES + 5 REL)
- Plus 1 carried-over v0.1 requirement: SKIL-03 (mapped to Phase 2)
- Total milestone-tracked requirements: 55
- Mapped to phases: 55 ✓
- Unmapped: 0

---
*Requirements defined: 2026-05-06*
*Last updated: 2026-05-06 — milestone v0.2.0 phase mappings finalized*
