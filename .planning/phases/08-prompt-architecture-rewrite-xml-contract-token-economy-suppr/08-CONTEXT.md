# Phase 8: Prompt Architecture Rewrite — Implementation Context

**Created:** 2026-05-09
**SPEC:** `08-SPEC.md` (11 requirements locked — read first)
**Mode:** auto-derived implementation decisions; user delegated final calls («реши сам»).

<domain>
## Phase Boundary

Rewrite `rules/feynman-activate.md` from markdown-tagged single-purpose rule file (push diagrams) into XML-structured three-faced contract that **amplifies** visual where baseline is empty (sequence/branching), **channels** to cheap formats where baseline already visualizes (comparison → MD table, status → dot-leader, hierarchy → indent), and **suppresses** over-instrumentation for simple Q&A (definition/recommendation/greeting). Migrate hook parser from HTML-comment markers to XML intensity tags. Run iteration-2 A/B on existing 20-eval set to validate WIN-class preservation, HURT-class improvement, negative-class non-regression. Cut payload ≥20% (5.6KB → ≤4.5KB).

This phase delivers the rewritten rule file + parser migration + README compaction-survivor section + iteration-2 measurements. It does NOT deliver autofix engine (Phase 8.5), L10 mixed-script lint rule (Phase 8.5), or per-host rule split (deferred unless Q-2026-05-09-01 changes verdict).
</domain>

<spec_lock>
## Locked Requirements (from 08-SPEC.md)

11 falsifiable requirements with current/target/acceptance triples. Read `08-SPEC.md` directly — agents MUST NOT duplicate or paraphrase requirements. The decisions below cover only HOW to satisfy them.

Acceptance criteria (14 pass/fail checkboxes) are the single source of truth for "done".
</spec_lock>

<decisions>
## Implementation Decisions

### XML tag naming convention (Area A)

**Choice:** compact tag names — `<triggers>`, `<syntax>`, `<examples>`, `<contract>` for the four primary structural sections; `<intensity name="lite|full|ultra">…</intensity>` for variant blocks.

**Reason:** Each XML tag occurs ~3–4 times in the file; compact names save ~30–40 tokens vs verbose alternatives (`<structure_triggers>`, `<diagram_syntax>`, etc.) without semantic loss. Names are unambiguous in context. Anthropic cookbook 2025 prompt examples use the same compact convention (`<example>`, `<context>`, `<task>`).

**Trade-off rejected:** verbose semantic names (`<structure_triggers>`) would be marginally clearer at first read but cost ~3× more tokens per tag occurrence. With the ≤4480-byte target this matters.

### CoT classify-first phrasing (Area C)

**Choice:** declarative four-step procedure inside `<contract>`. Phrasing avoids imperative verbs (bug #17804 prompt-injection mitigation) — uses "the model identifies", "the rule applies" rather than "first do X, then do Y".

**Procedure shape:**
```
<contract>
1. Before composing an answer, the model identifies which structure shape the
   content has — one of: sequence, hierarchy, comparison, status, priority,
   branching, state-machine, mapping, or none.

2. When the shape is one the model would already render with prose alone, the
   channeling rule applies — the visual form from the triggers table replaces
   the inline form, never adds a second one.

3. When the shape is one the model would NOT naturally visualize, the
   amplification rule applies — the visual form from the triggers table is
   added next to the prose explanation.

4. When the shape is "simple Q&A" (definition, recommendation, greeting,
   conversational question-back), the suppression rule applies — the answer
   stays in prose, no visual form is added even if structure technically
   exists.
</contract>
```

**Reason:** Declarative form sidesteps the documented prompt-injection lever (#17804) while still delivering the classification step. Numbered observations make the order explicit without "first/then/next" imperatives. "The model identifies" is a description of intended behavior, not a command — current rules use the same form throughout.

**Trade-off rejected:** raw imperative procedure ("(1) classify the shape; (2) check baseline; (3) channel/amplify/suppress") reads more crisply but trips bug #17804 protection — the model is more likely to follow it but also more likely to be hijacked by a malicious user prompt that mirrors imperative form.

### SDLC mutex enforcement (Area D)

**Choice:** XML attribute on the SDLC patterns wrapper plus an explicit declarative sentence at section top.

**Shape:**
```
<patterns selection="one-of">
These patterns are alternatives — a response uses at most one of them. Choosing
multiple stacks visuals without adding information.

(... pattern list: status, retro, handoff, review, incident, release,
decision, verification, roadmap, phase, UAT, risk-register ...)
</patterns>
```

**Reason:** Eval-07 and eval-08 evidence: model emitted 3-4 SDLC patterns stacked because current rules list them as parallel "use these shapes" entries with no mutex marker. The XML attribute (`selection="one-of"`) gives the model a structural hint, the sentence makes it explicit. Belt-and-suspenders against the most measurable failure mode.

**Trade-off rejected:** sentence-only enforcement (no XML attribute) would be cheaper but loses the structural hint — Anthropic-trained models attend to attributes the same way they attend to tag names per cookbook examples.

### Test fixture format (Area F)

**Choice:** extend existing `tests/hook.test.js` with new test cases under a new `describe("XML intensity extraction")` block. No new test file. No separate fixture file — use inline rule strings in the test (current file is small and self-contained).

**Test cases to add (minimum):**
- extracts `lite` content from `<intensity name="lite">…</intensity>` block
- extracts `full` content from `<intensity name="full">…</intensity>` block
- extracts `ultra` content from `<intensity name="ultra">…</intensity>` block
- handles whitespace variations around tag (`<intensity name = "lite">` etc.)
- ignores content outside any `<intensity>` block
- legacy assertion: file contains zero `<!-- lite -->` HTML-comment markers (regression catch)

**Reason:** Existing `tests/hook.test.js` already groups related extraction tests; adding a sibling describe block keeps related logic together (one file to grep). New file would create discovery overhead without test-isolation benefit. Inline strings beat fixture files for ~10-line test snippets.

**Trade-off rejected:** new `tests/hook-xml-intensity.test.js` file would surface "this is a new capability" but fragments the test hierarchy and complicates coverage tracking. Fixture file would help if the test rule content were large, but minimal extraction tests need only ~3-line snippets.

### Few-shot sourcing (Area B — Claude's discretion)

Use real outputs from `feynman-rules-workspace/iteration-1/` as canonical few-shot examples:
- sequence: `[commit] --> [build] --> [test] --> [deploy staging] --> [production rollout]` (eval-01 with_rules)
- hierarchy: tree from eval-03 with_rules (compact 2-space indent or `├── └──`)
- comparison: MD table from eval-05 baseline (3-col DBs example)
- status (dot-leader): synthesized from eval-07 baseline content reformatted

Real outputs proven to produce desired result. No new examples invented — eliminates "designed to look good in rule file but not realistic" risk.

### Suppression list scope (Area E — Claude's discretion)

Exact list per F10 in SPEC: definition / recommendation / question-back / greeting. No expansion (e.g., "explanation requests" — too vague, would over-suppress).

Trigger phrases for each:
- definition: "what does X mean", "define X", "what is X"
- recommendation: "should I X", "X or Y, recommend", "best X for Y"
- question-back: model asks a clarifying question rather than providing a list of options
- greeting: "hi", "hello", "how's it going"

### Migration commit strategy (Area G — Claude's discretion)

Three isolated commits in this order:
1. `feat(hook): support XML intensity tags alongside HTML comments` — parser regex update; both formats accepted; existing 227 tests stay green
2. `feat(rules): rewrite feynman-activate.md as XML contract` — new rule content; old HTML-comment markers removed; new tests added; 227+1 tests green
3. `docs(readme): explain compaction-survivor value-prop` — README addition

**Reason:** isolated commits enable surgical rollback (parser revert is independent of rule rewrite). Parser-first ordering means the rule file can be deployed against either old or new parser during transition (forward-compatible). README is doc-only, separate concern.

**Reject:** single-commit migration — atomic but loses rollback granularity; if rule rewrite has a bug, parser change has to be reverted too.

### Iteration-2 harness (Area H — Claude's discretion)

Reuse the iteration-1 subagent harness verbatim:
- same `evals/evals.json` (20 prompts, no edits)
- same `general-purpose` subagent dispatcher
- same prompt template (baseline = "no rules"; with_rules = "read /tmp/feynman-rules-full.md, apply full intensity")
- new workspace dir: `feynman-rules-workspace/iteration-2/eval-NN/{baseline,with_rules,with_old_rules}/outputs/answer.md`

Add a third variant: `with_old_rules` (current rules file) — gives a true 3-way A/B (baseline vs old rules vs new rules) so we can measure both absolute and relative change.

**Reason:** comparing to a different harness invalidates the comparison; reusing exactly the same dispatcher controls for runner variance. Adding `with_old_rules` is cheap (same eval set, ~12 more runs) and answers "did we actually improve over the existing rules" as well as "did we change behavior at all".

### Folded Todos

None — no pending todos matched Phase 8 scope at gather time.

</decisions>

<code_context>
## Existing Code Insights

- **Hook entry point:** `hooks/feynman-activate.js` — CommonJS, zero deps, ~150 LOC. Reads `rules/feynman-activate.md`, extracts intensity section, emits via `additionalContext`.
- **Current parser regex:** matches `<!--\s*lite\s*-->[\s\S]*?<!--\s*\/lite\s*-->` (or equivalent for full/ultra). Replace with `<intensity\s+name=["']lite["']>[\s\S]*?<\/intensity>` (and full/ultra).
- **Test runner:** node:test (`node --test tests/`). Current count: 227 passing per v0.2.7 baseline.
- **Existing intensity sections:** lite ≈ 47 lines, full ≈ 238 lines, ultra ≈ 75 lines. Total file ≈ 5.6KB.
- **State schema (frozen):** `{enabled: boolean, intensity: string, injections: number}`. Hook output format MUST stay identical: `process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:text}}))`.
- **Reusable assets for iteration-2:** `evals/evals.json` (20 prompts), `feynman-rules-workspace/iteration-1/` (28 baseline+with_rules outputs ready for diff comparison).
- **`tests/package.test.js`:** enforces version parity across `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `package-lock.json`. Any version bump for v0.3.0 release MUST sync all four (per L09 hotfix lesson, v0.2.7 commit `1d4ae5f`).

</code_context>

<specifics>
## Specific Ideas

- File structure target:
  ```
  rules/feynman-activate.md (rewritten)
  ├── (top-level shared content if any)
  └── <intensity name="lite|full|ultra">
      ├── <triggers>      (decision table: structure → visual)
      ├── <syntax>        (literal char examples)
      ├── <examples>      (3 few-shot per class)
      ├── <patterns selection="one-of">  (SDLC patterns, mutex)
      └── <contract>      (CoT classify-first + amplify/channel/suppress logic + suppression list)
  ```
- Lite section should be the most aggressive about suppression and channeling; full is balanced; ultra still permits ASCII frames (existing semantic preserved).
- README addition should be a 3-4 sentence section titled "Why feynman uses UserPromptSubmit (not SessionStart)" — explains compaction survival.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/08-prompt-architecture-rewrite-xml-contract-token-economy-suppr/08-SPEC.md` — Locked requirements — MUST read before planning
- `.planning/notes/prompt-rewrite-research-2026-05-09.md` — 7 token-economy + XML-tagging factors with research citations
- `.planning/notes/eval-iteration-1-findings-2026-05-09.md` — 28 subagent runs across 20 prompts; quantitative basis for amplify/channel/suppress framing
- `.planning/research/Q-2026-05-09-01-findings.md` — XML compatibility verdict: safe across Claude Code, Codex CLI, Cursor, Cline, Windsurf — no per-host fork needed
- `evals/evals.json` — 20-prompt eval set; iteration-2 will reuse it verbatim
- `feynman-rules-workspace/iteration-1/` — baseline + with_rules outputs from iteration-1 (28 files)
- `rules/feynman-activate.md` — current rule file (to be rewritten)
- `hooks/feynman-activate.js` — hook entry; parser regex location
- `tests/hook.test.js` — existing test file; new XML-extraction tests go here
- `CLAUDE.md` (project root) — frozen state schema, CommonJS constraint, hook output format

</canonical_refs>

<deferred>
## Deferred Ideas

- **L10 mixed-script lint rule** — flagged earlier (Cyr+Lat tokens like "zachischены") — belongs to Phase 8.5 alongside autofix engine, not Phase 8 scope.
- **Stop-hook autofix** — Phase 8.5 (separate scope, separate test surface).
- **Per-host rule file split** — Q-2026-05-09-01 returned XML-safe across all hosts, so no fork needed in Phase 8. Re-evaluate if user reports host-specific compliance regressions in iteration-2.
- **`additionalContext` payload analytics** — adding telemetry for actual token cost per injection across hosts would help Phase 9+ optimization, but is out of Phase 8 scope.
- **Alternative intensity levels (e.g., "minimal", "verbose")** — schema is frozen per CLAUDE.md ("Допустимые значения: lite | full | ultra"). Future expansion would be its own phase with migration plan.

</deferred>

---

*Phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr*
*Context created: 2026-05-09*
*Next step: `/gsd-plan-phase 8` — researcher reads CONTEXT.md + SPEC.md, planner produces task breakdown.*
