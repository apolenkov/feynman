---
phase: 08-5
phase_name: Runtime alignment check + autofix
spec_version: 1.0
captured: 2026-05-10
inputs:
  roadmap_lines: ".planning/ROADMAP.md:161-176"
  context_file: "08-5-CONTEXT.md"
  research: ".planning/notes/feynman-improvement-research-2026-05-10.md"
  prior_quick_task: "1d4ae5f (L09 detection-only, v0.2.7)"
---

# Phase 8.5 — SPEC

## Goal

ASCII-frame blocks emitted by the model are geometrically correct at render time.
The linter detects misalignment (L09), mixed-script (L10), frame-width edge cases (L08),
and a pure-function autofix engine repairs all of these deterministically. Stop-hook
applies the fix to the model's response before the user sees it. Detection-only behavior
remains for `feynman-lint` invoked without `--fix`.

## Requirements (numbered)

### R-01 — L09 alignment detection (graduates to autofix-aware)
- `lib/lint/rules.js` exports `L09_right_edge_alignment` (already exists, detection-only).
- Rule signature unchanged; emits violations with line numbers + expected column `W+1`.
- Positive + negative golden fixture per rule branch (right-edge, top-border, bottom-border).

### R-02 — L10 mixed-script warn
- `lib/lint/rules.js` exports `L10_mixed_script`.
- Detects within-word Cyrillic+Latin mixing via regex `[А-я][A-Za-z]|[A-Za-z][А-я]` excluding whitelist.
- Whitelist: `gsd-sdk`, `feynman-lint`, hyphenated kebab-case tokens, tokens with numeric
  suffix `[a-z]+-?\d+`, tokens appearing verbatim in `package.json` `name`, `keywords`,
  `bin` fields.
- Severity: `warn` (not `error`); does NOT block lint exit.
- No autofix (warning only — autofix would need translation).

### R-03 — L08 hardening
- `lib/lint/rules.js` `L08_frame_width` no longer false-positives on lines containing
  combining marks (`̀`-`ͯ`), zero-width joiners (`‍`), or wide CJK chars.
- Width calculation uses `Buffer.byteLength` after `stripAnsi` AND skips combining marks.
- Existing positive fixtures continue to pass; new negative fixtures cover combining marks.

### R-04 — Autofix engine (pure function)
- `lib/lint/autofix.js` exports `autofixFrame(astNode) → string` and `autofix(text, options)`.
- `autofixFrame` is pure: same input → same output, no I/O, no globals.
- Algorithm:
  1. Find all inner lines (between `┌─...─┐` and `└─...─┘`).
  2. Compute `W = max(charCount(line.replace(stripAnsi)))` (skip combining marks).
  3. Re-render top: `┌` + `─`×W + `┐` (total width `W+2`).
  4. Re-render bottom: `└` + `─`×W + `┘`.
  5. Each inner line: `│` + content padded to `W` spaces + `│`.
- `autofix(text)` walks AST from `lib/lint/parser.js`, applies `autofixFrame` to every
  frame node, returns updated text. Non-frame content untouched.
- Idempotent: applying autofix to an already-clean frame is a no-op.

### R-05 — CLI `--fix` flag
- `bin/feynman-lint.js --fix <file>` writes corrected text back to file in-place.
- Without `--fix`: detection-only (existing Phase 3 behavior, unchanged).
- Exit codes preserved: 0 = clean (or fixed), 1 = violations found (no fix), 2 = usage error.
- Idempotent: running twice on the same clean file = no diff.

### R-06 — Stop-hook autofix integration
- `hooks/feynman-lint.js` (Stop-hook variant from Phase 3) gains autofix path.
- On model response: parse AST → if any frame nodes detected → apply `autofix()` → emit
  `additionalContext` with the corrected frames so the user sees the fixed version.
- If parser returns no frame nodes (or AST malformed): fall back to current rule-feedback
  path (so model self-corrects on next turn).
- No silent failures: any autofix exception logs to stderr without breaking the hook
  (exit 0 with empty `additionalContext` is the safe fallback).

### R-07 — Golden fixtures (≥20 cases)
- `tests/lint-cases.json` adds:
  - 8 cases for L09 (right-edge mis-align positive/negative, top-border, bottom-border).
  - 6 cases for L10 (within-word mix positive, hyphenated negative, package-name negative,
    numeric-suffix negative, kebab-case negative, mixed-script proper noun negative).
  - 4 cases for L08 hardening (combining mark, ZWJ, CJK, plain).
  - 2 end-to-end cases combining all three.
- Each fixture has `name`, `input`, `rule`, `expected_violations` (list of `{line, column}`),
  `expected_after_autofix` (string for L09 cases, omitted for L10/L08 detection-only).

### R-08 — Tests stay green
- `npm test` passes 245 + new (estimated +25 cases from new fixtures + autofix unit tests).
- Coverage stays ≥95% on `lib/lint/`.
- `npm run ci` green end-to-end on Node 20+ (per Phase 8.5 CI config from `0d33b43`).

### R-09 — Documentation updated
- `docs/lint-rules.md` adds entries for L09, L10 with valid + invalid examples.
- `README.md` mentions `--fix` flag in linter section.
- `docs/architecture.md` (if exists) updates the lint pipeline diagram to show autofix step.

## Success Criteria (verbatim from ROADMAP, with check-method)

| # | Criterion | Verify by |
|---|-----------|-----------|
| 1 | L09 export with positive/negative fixtures | `grep -n "L09_right_edge" lib/lint/rules.js` + `node --test tests/lint.test.js` |
| 2 | L10 export with whitelist | `grep -n "L10_mixed_script" lib/lint/rules.js` + fixture pass |
| 3 | `lib/lint/autofix.js` pure-function exports | unit tests in `tests/autofix.test.js` |
| 4 | `--fix` flag in CLI, detection-only without it | `feynman-lint --fix sample.md && diff sample.md expected.md` |
| 5 | Stop-hook applies autofix with fallback | `tests/hook.test.js` integration case |
| 6 | ≥20 golden fixtures in `tests/lint-cases.json` | `node -e "console.log(require('./tests/lint-cases.json').length)"` ≥ 20 new |
| 7 | `npm test` + `npm run lint:md` green; coverage ≥95% | CI pipeline pass |

## Architecture diagram

```
[model response]
       │
       ▼
[Stop-hook: hooks/feynman-lint.js]
       │
       ▼
[parser.js] ─── AST ───→ [autofix.js: pure function]
       │                          │
       │ (no frame nodes)         │ (frames found)
       ▼                          ▼
[rule-feedback fallback]    [emit additionalContext with fixed text]
       │                          │
       ▼                          ▼
[user sees rule list,       [user sees clean output;
 model self-corrects         model never knows the
 on next turn]               misalignment happened]
```

## Out of scope (do not expand)

- Color/ANSI inside frames (decision: markdown bold + Unicode markers, no ANSI).
- L11+ semantic rules (tree depth, nested frames).
- N2 (`<intensity inherits="full">`) from research — separate concern.
- Multi-language script detection beyond Cyr+Lat.
