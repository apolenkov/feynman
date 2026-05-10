---
phase: 08-5
phase_name: Runtime alignment check + autofix
captured: 2026-05-10
discuss_mode: skipped (gray-area minimal — ROADMAP entry already detailed; research confirmed scope)
---

# Phase 8.5 — CONTEXT

## Why this phase exists

Phase 8 shipped XML rule contract + token economy. Eval iteration-2 confirmed the model
follows triggers (WIN=17, NEUTRAL=3, HURT=0). What it does NOT solve: when the model
emits an ASCII frame block, the right-edge `│` characters often don't align — wrap in
the user's terminal, broken `┌─...─┐` borders, etc. Visuals are produced but visually
broken. Research note `feynman-improvement-research-2026-05-10.md` flags this as the
single biggest reader-perception regression remaining.

The fix has two halves:
1. **Detect** misalignment programmatically (not via fragile model self-check).
2. **Autofix** — repair `│` columns, top/bottom borders, padding before showing user.

Phase 8.5 lands both, plus a mixed-script warn (L10) and L08 hardening, all wired
into the existing linter pipeline (`bin/feynman-lint.js` standalone + `hooks/feynman-lint.js`
Stop-hook).

## Locked decisions

### Scope
Already locked in ROADMAP entry (lines 161-176 of `.planning/ROADMAP.md`):
- L09 right-edge alignment **detection** (already shipped as v0.2.7 quick-task) → graduate to **autofix**.
- L10 mixed-script Cyrillic+Latin warn (within-word only; whitelist for proper nouns like `gsd-sdk`).
- L08 hardening (existing frame-width rule — close known false-positives on lines with combining marks).
- Pure-function autofix engine `lib/lint/autofix.js` (input AST node → output fixed string).
- Stop-hook applies autofix **before** the model output reaches the user (silent normalization;
  fallback to current rule-feedback behavior if no valid frame structure).
- Golden fixtures: ≥20 cases in `tests/lint-cases.json` covering D1 (right-edge mis-align),
  D3 (line overflow), D4 (orphan tree branches), plus 5+ end-to-end real-world misalignment
  examples from prior issue reports / feynman-rules-workspace samples.

### Architecture
- `lib/lint/autofix.js` is a **pure function**: `autofixFrame(astNode) → string`. No I/O, no globals.
  This makes it testable without spinning up a hook process.
- Autofix algorithm: compute `W = max(stripAnsi(line).length for inner lines)`; re-render top
  `┌─...─┐` to `W+2`; bottom `└─...─┘` to `W+2`; pad each inner line with spaces to column `W+1`,
  append `│`.
- `bin/feynman-lint.js --fix` writes back to file in-place (idempotent on already-clean files).
- Without `--fix`, detection-only behavior from Phase 3 is preserved (no behavior change for
  existing CI usage).
- `hooks/feynman-lint.js` (Stop-hook) calls autofix and emits `additionalContext` patch when
  applicable. If autofix can't apply (no valid frame structure or ambiguous AST), falls back
  to the current rule-feedback path so the model self-corrects on the next turn.

### Out of scope (deferred)
- Color/ANSI rendering inside frames — design decision was made for v0.3.x: rules use
  markdown bold + Unicode markers (▲▼ ✓✗), no inline ANSI. Phase 8.5 does NOT add color
  to autofix output.
- L11+ (semantic content rules like "tree depth ≤ 5", "no nested frames"). Deferred to
  later phases; ROADMAP success criterion 6 says "≥20 golden fixtures for L09/L10/autofix",
  not 11+.
- Multi-language script detection beyond Cyr+Lat (Greek, CJK, etc.). v1.x problem.
- N2 from research (`<intensity inherits="full">` to free ~200 bytes of rules budget) —
  separate concern from alignment fix; can land in a later patch release if useful.

## Inputs the planner needs

- ROADMAP entry for Phase 8.5 (already structured: Goal + Depends on + Requirements + 7 Success Criteria + Plans: TBD).
- Existing Phase 3 linter assets: `lib/lint/rules.js` (already exports L01-L09 detection),
  `lib/lint/parser.js` (AST), `bin/feynman-lint.js` (CLI), `hooks/feynman-lint.js` (Stop-hook).
- L09 detection-only rule from quick-task `260509-hvy` (commit `1d4ae5f`) — graduating to autofix.
- Golden test fixture format: `tests/lint-cases.json` (positive + negative pairs).

## Risks the planner should anticipate

- **Autofix changing model intent** — if a frame's inner content has trailing spaces by design
  (rare, but possible in code-block fixtures inside Markdown), normalizing will alter bytes.
  Mitigation: autofix only operates on detected ASCII frame blocks (matched by parser AST kind),
  not arbitrary text. Conservative match.
- **Stop-hook latency** — autofix runs synchronously before the model response is shown.
  Pure-function autofix on a 100-line response is well under 50ms; fine. If parsing the response
  itself becomes slow, the parser already exists from Phase 3 and is tested. No new perf risk.
- **L10 false positives on legitimate hyphenated identifiers** — `gsd-sdk`, `feynman-lint`,
  `worktree-agent-XXX`. Whitelist must include any hyphenated kebab-case token AND tokens
  matching `[a-z]+-\d+` (numeric suffixes), AND any token that appears verbatim in `package.json`
  fields. If whitelist gets long, switch to regex blocklist of known mixed-script confusion
  patterns instead.
- **Test fixture explosion** — 20+ fixtures × 2 (positive + negative) × 3 (rule families:
  L09 alignment, L10 mixed-script, L08 frame-width) ≈ 120 cases. Plan for fixture file
  sharding if `tests/lint-cases.json` grows past a maintainable size (~500 lines).
