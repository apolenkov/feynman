# Requirements: feynman v0.4.0 — Visual Economy

**Defined:** 2026-05-10
**Last updated:** 2026-05-10 — milestone v0.4.0 started
**Core value:** Every response with structure gets an ASCII diagram without the developer asking — and prefers the cheapest visual that still conveys the structure.
**Research base:** `.planning/notes/token-economical-ascii-research-2026-05-10.md` + seed `measure-compliance-gain.md`.

## v0.4.0 Requirements

### Lint Rules (Smallest-Visual-First)

- [ ] **LINT-11**: `lib/lint/rules.js` exports `L11_overdecoration` — detects frame block (`┌─*┐ … └─*┘`) with ≤5 inner content lines; severity `warn`; suggests dot-leader list with estimated token savings; whitelist for frames that need explicit grouping (e.g. nested mixed content).
- [ ] **LINT-12**: `lib/lint/rules.js` exports `L12_token_budget` — estimates visual overhead vs content; warns when padding-chars exceed content-chars in any frame, table, or padded block; emits per-visual cost annotation when run with `--explain` flag.
- [ ] **LINT-13**: `lib/lint/rules.js` exports `L13_double_wrap` — detects tree (`├──`/`└──`) inside frame block; severity `warn`; suggests removing the frame because tree carries hierarchy on its own.
- [ ] **LINT-14**: `bin/feynman-lint.js --fix` extends to L11 — autofix converts qualifying frame block to dot-leader list (`item ............ state` format); L12/L13 remain warn-only.
- [ ] **DOCS-L11**: `docs/lint-rules.md` adds L11/L12/L13 entries with valid/invalid examples + token-cost comparison rows; cross-reference rule source line numbers.

### Output-Style Presets

- [ ] **STYLE-01**: `~/.claude/.feynman/state.json` and `~/.codex/.feynman/state.json` schemas extend with `output_style: "short" | "middle" | "full"` field; default `full`; backwards-compatible (missing field reads as `full`).
- [ ] **STYLE-02**: `/feynman style short|middle|full` skill subcommand reads/writes `output_style`; `/feynman status` displays current style.
- [ ] **STYLE-03**: `hooks/feynman-activate.js` reads `output_style` and appends a one-line suppression suffix to `additionalContext` when style ≠ `full` (no rules-file modification): `short` → "Output style: short — no frame-blocks, no ASCII art, dot-leader only."; `middle` → "Output style: middle — frame only ≥6 items, prefer trees and markdown tables."; `full` → no suffix.
- [ ] **STYLE-04**: README.md documents the three presets with token-cost comparison table; `docs/architecture.md` updated with the orthogonal axes (intensity × output-style).

### Compliance Measurement

- [ ] **EVAL-01**: A/B harness on 50-prompt corpus comparing v0.2.x rules baseline vs v0.3.x rules current; corpus stored under `eval/v0.4.0-compliance/prompts.json` with structure-class tag (sequence, hierarchy, comparison, status, priority, none) per prompt.
- [ ] **EVAL-02**: Harness drives both rule-sets through the same model (Claude Opus 4.7), runs `feynman-lint` on every response, computes pass/fail per rule and aggregate compliance %; output to `eval/v0.4.0-compliance/REPORT.md`.
- [ ] **EVAL-03**: REPORT.md includes WIN/HURT/NEUTRAL classification per structure class with statistical context (sample size, confidence interval); identifies any HURT-class regressions for follow-up.

### IDE Compat Polish

- [ ] **IDE-01**: `npx @albinocrabs/feynman install --target cline` writes `.clinerules/feynman-rules.md` derived from current intensity; idempotent.
- [ ] **IDE-02**: `npx @albinocrabs/feynman install --target cursor` writes `.cursor/rules/feynman.mdc` with proper YAML frontmatter (alwaysApply: true, globs: "**"); idempotent.
- [ ] **IDE-03**: `npx @albinocrabs/feynman install --target windsurf` writes `.windsurf/rules/feynman.md`; idempotent.
- [ ] **IDE-04**: `npx @albinocrabs/feynman doctor --target cline|cursor|windsurf` reports installation health for each target.
- [ ] **IDE-05**: README.md adds "IDE Support" section listing all 5 targets (claude, codex, cline, cursor, windsurf) with one-liner per target.

### Release

- [ ] **REL-01**: `node scripts/feynman-bump.js minor` bumps to v0.4.0 across `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`.
- [ ] **REL-02**: `npm run ci` green; tests ≥ baseline 279 + new test count for L11/L12/L13/STYLE/EVAL/IDE.
- [ ] **REL-03**: `npm publish --access public` publishes `@albinocrabs/feynman@0.4.0` with all new bin/lib/docs files in package.
- [ ] **REL-04**: `git tag v0.4.0` annotated; GitHub Release created with summary of L11-L13 + output styles + compliance findings.
- [ ] **REL-05**: CHANGELOG.md regenerated with v0.4.0 entry.

## Future Requirements (v0.5.0+)

- [ ] Domain packs (arch / db / devops as separate rule sets)
- [ ] feynman.config.yaml for team customization
- [ ] Claude Code Marketplace + Codex Marketplace submission
- [ ] Self-improvement loop full implementation (was design-only in v0.2.0)
- [ ] Windows install.ps1
- [ ] Per-project intensity / style override (alternative to global state.json)

## Out of Scope (v0.4.0)

- Custom diagram renderers / Mermaid / graphviz — ASCII only, dependency-free principle holds
- Web UI / dashboard — CLI/hook plugin only
- Server-side compliance dashboards — local-first, off by default
- Cross-session aggregation of compliance metrics — single-session reports only for v0.4.0

## Traceability

(filled by roadmapper / phase plans)

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| LINT-11 | TBD | TBD | Active |
| LINT-12 | TBD | TBD | Active |
| LINT-13 | TBD | TBD | Active |
| LINT-14 | TBD | TBD | Active |
| DOCS-L11 | TBD | TBD | Active |
| STYLE-01 | TBD | TBD | Active |
| STYLE-02 | TBD | TBD | Active |
| STYLE-03 | TBD | TBD | Active |
| STYLE-04 | TBD | TBD | Active |
| EVAL-01 | TBD | TBD | Active |
| EVAL-02 | TBD | TBD | Active |
| EVAL-03 | TBD | TBD | Active |
| IDE-01 | TBD | TBD | Active |
| IDE-02 | TBD | TBD | Active |
| IDE-03 | TBD | TBD | Active |
| IDE-04 | TBD | TBD | Active |
| IDE-05 | TBD | TBD | Active |
| REL-01 | TBD | TBD | Active |
| REL-02 | TBD | TBD | Active |
| REL-03 | TBD | TBD | Active |
| REL-04 | TBD | TBD | Active |
| REL-05 | TBD | TBD | Active |
