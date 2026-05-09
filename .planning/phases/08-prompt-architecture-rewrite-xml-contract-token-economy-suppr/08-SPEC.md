# Phase 8: Prompt Architecture Rewrite (XML contract + token economy + suppression) — Specification

**Created:** 2026-05-09
**Ambiguity score:** 0.187 (gate: ≤ 0.20)
**Requirements:** 11 locked
**Mode:** auto-derived from evidence base (research + eval iteration-1) — interview skipped per low-ambiguity gate.

## Goal

Rewrite `rules/feynman-activate.md` from a markdown-tagged single-purpose rule file (push diagrams) into an XML-structured three-faced contract that (1) **amplifies** visual where baseline LLM produces none (sequence/branching), (2) **channels** to cheap formats where baseline already visualizes (comparison → MD table, status → dot-leader, hierarchy → indent), and (3) **suppresses** over-instrumentation for simple Q&A (definition/recommendation/greeting). Deliver a measurable reduction in `additionalContext` payload (≥20%, from ~5.6KB to ≤4.5KB) and an iteration-2 A/B that confirms WIN-class compliance is preserved, HURT-class output is cheaper, and negative cases do not regress.

## Background

`rules/feynman-activate.md` exists at 5.6KB / 238 lines per `wc -c` and `wc -l`. It uses `<!-- lite -->` / `<!-- /lite -->` HTML-comment markers around three intensity sections (`lite`, `full`, `ultra`). The hook (`hooks/feynman-activate.js`) extracts the active section via regex on these markers and emits the content via `additionalContext`.

The current ruleset uses declarative trigger sentences ("A response describing X includes Y") plus literal syntax samples plus a "When no diagram appears" negative section. It already addresses Claude Code bug #17804 (no imperative verbs).

Two evidence inputs reframe what this phase must change:

1. **Research note** (`.planning/notes/prompt-rewrite-research-2026-05-09.md`): box-drawing corner chars (`┌┐└┘├┤┬┴┼`) cost 2 tokens each in cl100k_base / o200k_base BPE vocabularies; XML-tagged sections measurably outperform markdown headers for Claude rule-section parsing; positive contracts beat negative-list "do not do X" framing for compliance — but eval evidence below qualifies F2.
2. **Eval iteration-1 note** (`.planning/notes/eval-iteration-1-findings-2026-05-09.md`, 28 subagent runs across 20 prompts): baseline Claude already over-visualizes half the structure classes (state-machine, mapping, definition: e.g. eval-20 baseline emitted 9 markdown tables for "what does idempotent mean"). Current rules push the model toward ASCII pipes when MD table is cheaper and more readable. SDLC patterns get stacked instead of treated as alternatives (eval-07 emitted 4 visual blocks for one status response).

The hook payload is constrained by Claude Code's documented `additionalContext` 10,000-character cap; the current 5.6KB consumes 56% of that budget for rules, leaving little room for richer trigger semantics.

## Requirements

1. **XML-tagged section structure**: rule file uses XML tags as primary structural markers, replacing markdown-only organization.
   - Current: rule sections delimited by markdown headers (`## Feynman Diagram Rules — Full`) and HTML comments (`<!-- lite -->`)
   - Target: rule file root contains `<structure_triggers>`, `<diagram_syntax>`, `<examples>`, `<output_contract>` and `<intensity name="lite|full|ultra">…</intensity>` blocks; markdown remains as the body content INSIDE the XML tags
   - Acceptance: `grep -c '<structure_triggers>' rules/feynman-activate.md` ≥ 1; `grep -c '<intensity name=' rules/feynman-activate.md` = 3; `grep -c '<!-- lite -->' rules/feynman-activate.md` = 0

2. **Negative-condition section preserved (F2 cancelled)**: the "When no diagram appears" guidance stays — eval-13 and eval-15 prove it protects single-fact and prose-opt-out cases.
   - Current: section exists in lite, full, ultra
   - Target: section exists with same semantic guarantees in all three intensity blocks; phrasing MAY be reworded toward positive contract form (e.g. "responses with no enumerable structure stay prose") but the conditions themselves remain
   - Acceptance: re-run eval-13 (`What's the default port for HTTPS?`) and eval-15 (prose-opt-out) with new rules; both produce zero ASCII frames AND zero markdown tables AND zero priority markers AND zero arrow flows

3. **Decision-table primary trigger**: each intensity section presents `structure → visual` as a table, declarative sentences become fallback prose only.
   - Current: declarative sentences ("A response describing a sequence of steps … includes an ASCII flow diagram") are the primary trigger
   - Target: each intensity section opens with a `structure → visual` decision table; declarative sentences remain only for nuance not capturable in the table
   - Acceptance: each `<intensity>` block contains a markdown table with header row containing the words `structure` and `visual` (or equivalents); table has at least 7 rows covering sequence, hierarchy, comparison, status, priority, branching-flow, state-machine

4. **One-primary-visual budget**: rules explicitly state "one primary visual per response" to prevent stacking.
   - Current: no budget rule; eval-07 produced frame + priority + 2 SDLC patterns for one status prompt; eval-08 produced 4 visuals for one priority prompt
   - Target: `<output_contract>` includes a budget statement: "one primary visual per response; secondary visuals only when they convey orthogonal information"; SDLC patterns are explicitly marked mutex (pick one)
   - Acceptance: re-run eval-07 (status snapshot) and eval-08 (bug ranking) with new rules; each output contains ≤ 1 of {frame block, dot-leader status block, priority scale, MD table} as primary visual; secondary visuals only if they add a different dimension

5. **Few-shot literals (3 per class)**: each main structure class gets three canonical examples with the literal box/tree characters shown.
   - Current: each class has at most one syntax sample
   - Target: sequence, hierarchy, comparison, status, branching-flow each have 3 canonical few-shot examples with literal `→ ├── └── ┌─┐ │` characters
   - Acceptance: `grep -c '├──' rules/feynman-activate.md` ≥ 6 (2 trees × 3 examples for hierarchy); `grep -c '→' rules/feynman-activate.md` ≥ 6 (sequence+state-machine 3 each)

6. **CoT classify-first step**: `<output_contract>` instructs the model to classify content shape before answering.
   - Current: no classification step in rules
   - Target: `<output_contract>` contains a 3-step procedure: "(1) classify content shape; (2) check whether baseline visualizes this naturally; (3) channel to cheap form OR amplify with new visual OR suppress to prose"
   - Acceptance: `<output_contract>` block contains the words `classify`, `channel`, `amplify`, `suppress`

7. **Token-economy matrix in structure→visual table**: cheap formats are the default; frame is last resort.
   - Current: rules describe ASCII frames as a primary tool; comparison defaults to "side-by-side ASCII columns"
   - Target: comparison row points to MD table (not ASCII pipes); status row points to dot-leader; hierarchy row points to 2-space indent at lite, indent OR ASCII tree at full; frames listed only as ultra-mode option or status-with-≤4-rows escape hatch
   - Acceptance: in the structure→visual table for `lite` intensity, the comparison row recommends "markdown table" and the status row recommends "dot-leader"; the hierarchy row recommends "2-space indent"; ASCII frames appear in the `lite` table only inside an explicit "frame budget" caveat

8. **Mutex SDLC patterns (F9)**: SDLC patterns are presented as alternatives, not additive.
   - Current: SDLC patterns section in `full` lists status / retro / handoff / review / incident / release / decision / verification / roadmap / phase / UAT / risk-register as separate "use these shapes" entries — model interprets as additive (eval-07 stacked 3)
   - Target: SDLC patterns section opens with "select ONE pattern per response" + brief rule for which pattern fits which intent
   - Acceptance: SDLC section contains the literal word `mutex` or `select ONE`; eval-07 re-run produces exactly one SDLC pattern (status), not stacked

9. **Suppression rule for simple Q&A (F10)**: rules explicitly cover definition / recommendation / question-back / greeting classes by directing model to prose.
   - Current: no explicit guidance for these classes; eval-20 baseline produced 9 MD tables for "what does idempotent mean"
   - Target: `<structure_triggers>` table or "When no diagram appears" section explicitly names: definition queries, recommendation queries, conversational question-back, greeting/social → prose, even if structure technically exists
   - Acceptance: re-run eval-20 (definition: "what does idempotent mean") and eval-17 (recommendation: tabs vs spaces) with new rules; both produce ≤ 1 MD table AND zero frames AND total bytes ≤ 60% of baseline

10. **Hook parser migration**: `hooks/feynman-activate.js` reads `<intensity name="...">` instead of `<!-- lite -->` markers; behavior preserved.
    - Current: hook uses regex `<!--\s*lite\s*-->[\s\S]*?<!--\s*/lite\s*-->` (or equivalent) to extract section
    - Target: hook regex updated to match `<intensity name="lite">[\s\S]*?</intensity>`; all five existing test paths in `tests/hook.test.js` (first-run bootstrap, normal flow, disabled state, intensity switch, corrupt-state recovery) stay green; CLI tools (`bin/feynman.js doctor`, etc.) continue to read state correctly
    - Acceptance: `npm test` exits 0 with at least the same 227 passing tests as the v0.2.7 baseline; one new test asserts XML-tag extraction matches the legacy fixture content semantically

11. **Token cost reduction**: `additionalContext` payload shrinks ≥ 20% across all three intensities.
    - Current: `wc -c rules/feynman-activate.md` ≈ 5,600 bytes; `awk '/<!-- full -->/,/<!-- \/full -->/' rules/feynman-activate.md | wc -c` = 5,583 bytes
    - Target: rewritten file ≤ 4,480 bytes total (≥ 20% reduction); per-intensity extracted content ≤ proportional reduction
    - Acceptance: `wc -c rules/feynman-activate.md` ≤ 4,480; iteration-2 hook output (test fixture asserting `additionalContext` length) ≤ proportional value

## Boundaries

**In scope:**
- XML-tag rewrite of `rules/feynman-activate.md` (all three intensity sections)
- Hook parser migration (`hooks/feynman-activate.js`)
- Test updates so the existing 227-test suite stays green
- One iteration-2 A/B run on the existing 20-prompt eval set (`evals/evals.json`) to validate WIN-class preservation, HURT-class improvement, and negative-class non-regression
- README addition explaining compaction-survivor value-prop (UserPromptSubmit re-injects on every turn vs SessionStart firing once)
- Migration commit isolated from rule-content changes (so rollback is trivial)

**Out of scope:**
- Stop-hook autofix engine — that is Phase 8.5 (separate scope, separate commit chain)
- New L09 / L10 lint rules in `lib/lint/rules.js` — L09 already shipped in v0.2.7; L10 (mixed-script) belongs to Phase 8.5
- New intensity levels beyond lite/full/ultra — schema is frozen per CLAUDE.md
- Multi-host rule-file split (separate XML for Claude, markdown for Codex/Cursor) — defer until Q-2026-05-09-01 returns; if findings show host-degraded behavior, that becomes a follow-on phase
- npm publish / release tagging for the rewrite — that is a release-phase concern, not Phase 8 scope
- Updating Cursor `.cursor/rules/*.mdc` or Cline `.clinerules/` IDE-compat files — those are derivative; revisit after main rule file stabilizes

**Out-of-scope reasoning:** Phase 8.5 split exists because autofix is a code change with its own test surface; merging it here would inflate verification scope and delay the prompt-side win. Q-2026-05-09-01 is a precondition for the multi-host split decision — running the split blind would create maintenance burden that may not be needed.

## Constraints

- The rewritten rule file MUST stay under 10,000 characters per Claude Code `additionalContext` documented cap. Current 5.6KB is well under; target ≤4.5KB leaves headroom.
- Hook stays CommonJS, zero npm deps, Node ≥ 18 — per project CLAUDE.md technology constraints.
- All previously-frozen state schema fields (`enabled`, `intensity`, `injections`) MUST remain unchanged — used by `/feynman` skill and CLI.
- Hook output format (`process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:text}}))`) MUST remain exactly the same — no trailing newline, no `console.log`.
- Migration commit must be isolated: one commit for parser regex change, one commit for rule content rewrite. This allows independent rollback if either side breaks.
- Q-2026-05-09-01 (XML compatibility across Codex/Cursor) MUST be answered before this phase enters execute-phase. If findings indicate Codex strips XML tags or Cursor `.mdc` parser mishandles them, the rule file structure MUST add a fallback path or split per host.
- iteration-2 A/B run must reuse the same 20-eval set verbatim and the same subagent invocation pattern as iteration-1 — comparing different harnesses is invalid.

## Acceptance Criteria

- [ ] `rules/feynman-activate.md` contains `<structure_triggers>`, `<diagram_syntax>`, `<examples>`, `<output_contract>` tags at least once each
- [ ] `rules/feynman-activate.md` contains exactly three `<intensity name="lite">`, `<intensity name="full">`, `<intensity name="ultra">` blocks
- [ ] `rules/feynman-activate.md` contains zero `<!-- lite -->` / `<!-- full -->` / `<!-- ultra -->` HTML-comment markers
- [ ] `wc -c rules/feynman-activate.md` returns a value ≤ 4,480
- [ ] Each intensity block contains a structure→visual decision table with ≥ 7 rows
- [ ] `<output_contract>` contains the words `classify`, `channel`, `amplify`, `suppress`
- [ ] SDLC pattern section contains the words `mutex` OR `select ONE`
- [ ] Suppression guidance explicitly names definition / recommendation / question-back / greeting classes
- [ ] `npm test` exits 0 and reports ≥ 227 passing tests after parser migration
- [ ] At least one new test in `tests/hook.test.js` asserts XML-tag extraction
- [ ] iteration-2 A/B re-run of the 20-eval set produces:
  - eval-13, eval-15: zero frames AND zero MD tables AND zero priority markers (negative-case preservation)
  - eval-20, eval-17: ≤ 1 MD table AND zero frames AND ≤ 60% of baseline bytes (suppression effective)
  - eval-07, eval-08: ≤ 1 primary visual per response (mutex effective)
  - eval-05: output uses MD table (not ASCII pipes inside code block)
  - eval-01, eval-10: at least one ASCII flow diagram (WIN-class preservation)
- [ ] README contains a section or paragraph explaining the compaction-survivor value-prop
- [ ] Migration commits are isolated: one for parser regex, one for rule content
- [ ] Q-2026-05-09-01 has a `**Status:** answered` line in `.planning/research/Q-2026-05-09-01-findings.md` before execute-phase begins

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                            |
|--------------------|-------|------|--------|------------------------------------------------------------------|
| Goal Clarity       | 0.85  | 0.75 | ✓      | Three-faced amplify/channel/suppress goal grounded in 28 runs    |
| Boundary Clarity   | 0.82  | 0.70 | ✓      | 11 factors enumerated; F2 cancelled; Phase 8.5 split explicit    |
| Constraint Clarity | 0.75  | 0.65 | ✓      | 10k cap, CommonJS, schema freeze, isolated commits all named     |
| Acceptance Criteria| 0.80  | 0.70 | ✓      | 14 pass/fail checkboxes, eval re-run criteria measurable         |
| **Ambiguity**      | 0.187 | ≤0.20| ✓      | Gate met without interview — evidence base already rich          |

## Interview Log

| Round | Perspective | Question summary                              | Decision locked                                                                                  |
|-------|-------------|-----------------------------------------------|--------------------------------------------------------------------------------------------------|
| 0     | auto-derived| Initial assessment from ROADMAP + 2 notes     | Ambiguity 0.187 ≤ 0.20; gate passed without interview; SPEC.md written from evidence base       |

**Auto-derivation reasoning:** Phase 8 ROADMAP entry (lines 178-204 in pre-rewrite ROADMAP.md) listed 11 success criteria and 11 factors with cancellation/addition rationale. Two `.planning/notes/` documents totaling ~10KB provide research and 28-run eval evidence. With this density of pre-existing decisions, a Socratic interview would re-discover what the notes already lock. Evidence-derived requirements 1-11 above mirror the factor list (F1, F2-cancelled, F3, F4, F5, F7, F8, F9, F10, F11 + token-cost target) translated into the SPEC requirement format.

---

*Phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr*
*Spec created: 2026-05-09*
*Next step: /gsd-discuss-phase 8 — implementation decisions (XML tag exact names, fallback if Q-2026-05-09-01 returns "host-degraded", which test fixture format to use, etc.)*
