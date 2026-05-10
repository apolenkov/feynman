# Phase 9: Smallest-visual-first lint rules (L11/L12/L13/L14) — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Source:** Synthesized from `.planning/notes/token-economical-ascii-research-2026-05-10.md` + retro decisions

<domain>
## Phase Boundary

Phase 9 adds three new lint rules (L11/L12/L13) that detect token-wasteful visual choices, plus an autofix extension (LINT-14) that converts frame-for-≤5 to dot-leader. Rules are detection-time WARNs, autofix is opt-in via existing `--fix` flag (extended). Docs section in `docs/lint-rules.md` updated to L01-L13.

**Why now:** Phase 8.5 closed the *misalignment* problem (autofix engine). This phase closes the *wrong-visual-from-the-start* problem — frame-for-5-items wastes ~50% tokens vs. dot-leader for the same data. The trigger-table already prescribes dot-leader for ≤5, so we're enforcing an existing rule, not inventing one.

**Single source of truth:** `lib/lint/rules.js` exports L11/L12/L13; `lib/lint/width.js` (Phase 8.5) stays the only width arithmetic helper.

</domain>

<decisions>
## Implementation Decisions

### LINT-11: L11_overdecoration

**Detect:** frame block (`^\s*┌─+┐` opening … `^\s*└─+┘` closing) with ≤5 inner content lines (`│ … │`).
**Severity:** `warn`.
**Message:** `"frame used for ≤5 items; consider dot-leader list (saves ~N tokens)"`.
**Token-savings annotation:** approximate — `(framing_chars − dotleader_chars)`. Use visualWidth() (Phase 8.5) for char counts.
**Whitelist:** frame containing nested mixed content (e.g. tree + table inside same block) — detection skips when inner lines include `├──`, `└──`, or `│ … │ …` (two pipes = embedded table column).

### LINT-12: L12_token_budget

**Detect:** for each frame block, table, or padded block — count visual chars devoted to padding/border vs. content. Warn when `padding_chars > content_chars`.
**Severity:** `warn`.
**`--explain` flag:** when passed to `bin/feynman-lint.js`, emits per-visual cost annotation (`framing: ~280 chars; equivalent dot-leader: ~120 chars; saving: -160`).
**Scope:** annotation is best-effort estimate, not exact tokenizer output — keeps zero-dep constraint.

### LINT-13: L13_double_wrap

**Detect:** tree (`├──` or `└──`) appearing inside a frame block (between `┌─+┐` and `└─+┘`).
**Severity:** `warn`.
**Message:** `"tree inside frame block — the tree already conveys hierarchy; drop the frame"`.
**Rationale:** trees are self-evident from indentation; wrapping adds zero information at full border cost.

### LINT-14: `--fix` extension for L11 (autofix to dot-leader)

**Behavior:** when `--fix` runs, frames qualifying for L11 (≤5 inner lines, no nested visuals) convert to dot-leader list.

**Conversion contract:**
- Each inner line `│ <content> │` becomes one dot-leader row.
- If the content matches `<label> <whitespace>... <state>` where state is one of `← готов`, `← решение`, `← заморожено`, `← блок: X`, `← в работе`, `✓ …`, `✗ …`, `→ …`, `done`, `pending`, `wip` (case-insensitive) — preserve as `<label> ............ <state>`.
- Otherwise — emit as plain bullet `- <content>` (no dot-leader filler, content too varied to align).
- Strip top/bottom border lines.
- Preserve indentation level of the original frame.

**Column-width policy (HUMAN-gate decision — flagged in plan):**
- Default: auto-detect from `max(visual_width(label))` + 4 dots + `max(visual_width(state))`, capped at terminal-typical width 80.
- This is the planner's reasonable default; user has explicit veto right at plan-review gate. Alternative considered: fixed W=50 (rejected — too narrow for long status strings).

**Idempotency:** running `--fix` on already-converted output is a no-op (no frame to detect = no change).

### DOCS-L11: docs/lint-rules.md L11/L12/L13 section

- Add three entries with valid/invalid examples + token-cost rows.
- Cross-reference rule source line numbers in `lib/lint/rules.js`.
- Update intro count from "10 rules" to "13 rules".
- Add `--explain` flag to README.md `--fix` mention.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing source (Phase 8.5)
- `lib/lint/rules.js` — current L01-L10 rule registry; new L11/L12/L13 follow the same export shape
- `lib/lint/autofix.js` — current autofix engine (frame width alignment); L11 fix extends this
- `lib/lint/width.js` — single source of visual-width truth (ANSI strip + combining/ZWJ + CJK)
- `bin/feynman-lint.js` — CLI entry; --fix flag wired in Phase 8.5; --explain flag to be added
- `tests/lint-cases.json` — fixture format; add ≥3 positive + ≥3 negative per new rule
- `tests/lint-hook.test.js` — Stop-hook integration tests; covers autofix path 5+6

### Existing docs
- `docs/lint-rules.md` — current L01-L10 reference; extend with L11/L12/L13
- `README.md` — `--fix` mention; add `--explain` flag

### Research
- `.planning/notes/token-economical-ascii-research-2026-05-10.md` — token-cost shootout, 6 patterns, 3 rule proposals with detection regex + severity + autofix sketch (this is the binding research artifact for Phase 9)

### Trigger-table (consumer of these rules — runtime behaviour)
- `rules/feynman-activate.md` — `<triggers>` table maps structure → visual; the new rules enforce this table

</canonical_refs>

<specifics>
## Specific Ideas

### Test fixtures shape

```json
{
  "rule": "L11",
  "label": "frame for 5 items — should be dot-leader",
  "input": "...\n┌─────────────────┐\n│ a ........ ok   │\n│ b ........ wait │\n│ c ........ wip  │\n│ d ........ done │\n│ e ........ done │\n└─────────────────┘",
  "expect": "warn"
}
```

### Autofix-expected fixture extension

Add `expected_after_autofix` field to fixtures where autofix should produce specific output:

```json
{
  "rule": "L11",
  "input": "┌─────────────────┐\n│ a ........ ok   │\n│ b ........ wait │\n└─────────────────┘",
  "expect": "warn",
  "expected_after_autofix": "a ........ ok\nb ........ wait\n"
}
```

This was deferred in Phase 8.5 — closing it now closes the test gap.

### Detection regex anchors

- L11 opening: `/^(\s*)┌─+┐\s*$/m`
- L11 closing: `/^(\s*)└─+┘\s*$/m` (same leading whitespace as opening)
- L11 inner: `/^\s*│.*│\s*$/`
- L13 tree inside frame: scan inner lines for `/(├──|└──)/`

### Token-cost annotation format

```
framing block: ~280 chars (border: 12, padding: 168, content: 100)
equivalent dot-leader: ~120 chars
saving: -160 chars (~40 tokens)
```

</specifics>

<deferred>
## Deferred Ideas

- **Rules-file expansion** — adding `Smallest visual that fits` line to `<contract>` of each intensity costs ~45 bytes × 3 intensities = 135 bytes, budget = 0; deferred to a separate v0.4.x ruleset compaction pass (Phase 9 stays code-only).
- **Output-style presets** — `short / middle / full` runtime suffix is its own phase (Phase 10), not bundled here.
- **Compliance A/B harness** — quantifying actual token savings on real responses is Phase 11.
- **Auto-conversion of single-pipe ASCII tables to markdown** — out of scope; markdown-table preference belongs in rules-file expansion (deferred).

</deferred>

---

*Phase: 09-smallest-visual-first-lint-rules-l11-l12-l13-l14*
*Context gathered: 2026-05-10 via plan-phase auto mode from research notes + retro decisions*
