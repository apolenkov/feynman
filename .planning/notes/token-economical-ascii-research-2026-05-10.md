---
title: Token-economical ASCII visuals — best practices and proposed rules
date: 2026-05-10
status: research (deferred to v0.4.x phase)
trigger: user observation that frame-block for ≤5 status items wastes ~50% tokens on padding/borders vs. equivalent dot-leader list
related:
  - rules/feynman-activate.md (trigger-table source of truth)
  - .planning/notes/feynman-improvement-research-2026-05-10.md (prior research)
---

# Token-economical ASCII — research note

## Problem statement

feynman injects a trigger-table that maps structures to visuals. The agent
(me / Claude / Codex) often picks a heavier visual than the structure needs —
the most common defect being **frame-block for ≤5 status items**, which the
trigger-table explicitly says should be dot-leader.

Cost of the wrong choice is non-trivial: a 5-row frame at width 50 burns
~280 chars on padding + two horizontal borders, while the same data as a
dot-leader list costs ~150. On long sessions with many status replies the
overhead compounds.

The feynman thesis is "structure → visual" — but the missing half is
"**smallest** visual that still conveys the structure". This note captures
patterns + proposes two new lint rules for a future phase.

## Core principle

**Smallest-visual-first.** Before picking a visual, walk the ladder from
lightest to heaviest and stop at the first rung that fits:

```
prose → inline-glyph → dot-leader → tree → markdown-table → frame-block
```

Climb only if the lighter rung genuinely loses information.

## Token-cost shootout (5-item status)

| form                  | ~chars | when uses              |
|-----------------------|--------|------------------------|
| inline pipe-separated | ~50    | context already set    |
| dot-leader list       | ~120   | default for ≤5 items   |
| frame block           | ~280   | ≥6 items, group needed |

Same information density, **2-5× cost spread**. Multiplied by status-replies
per session, this is the largest single token-economy lever feynman has
left untapped.

## Patterns worth canonicalizing

### 1. Smallest-visual-first ladder

Add one line to `<contract>` of each `<intensity>` block in
`rules/feynman-activate.md`:

> `Smallest visual that fits — never frame for ≤5 items.`

Bytes: ~45 per intensity × 3 intensities = 135 bytes. Current slack = 0;
requires compaction elsewhere (e.g. drop `✗` from highlight marker, keeping
`**bold** keys; ▲▼ priority; ✓ status.` = -3 bytes per intensity → 9 bytes
freed total, not enough). Need different compaction — maybe drop one
example from `<examples>` block, or move ladder to standalone `<ladder>`
element shared across intensities (one source, three references).

### 2. Unicode glyphs as semantic compression

One glyph carries a whole word's meaning:

```
✓ ✗ ◐ ⌛   status
▲ ▼       priority
→ ⇒ ↔     relationship
├── └──   hierarchy
```

Already present in trigger-table; could be highlighted as
"prefer glyph over word" pattern.

### 3. Horizontal arrow flow > vertical pipeline

Vertical:
```
   [A]
    │
    ▼
   [B]
    │
    ▼
   [C]
```
≈ 8 lines, ~50 chars.

Horizontal: `[A] → [B] → [C]` — one line, ~20 chars.

Vertical justified only when:
- Arrows carry labels (`approve` / `reject` / `timeout`)
- Branching (state machine with multiple outgoing edges)
- More than 5 nodes (horizontal wraps awkwardly)

### 4. Markdown table > ASCII grid

```
ASCII grid              markdown table
┌───┬───┐               | col | col |
│ a │ b │               |-----|-----|
├───┼───┤    →          | a   | b   |
│ c │ d │               | c   | d   |
└───┴───┘
```

Same render in Claude Code (markdown table renders as bordered table in
modern terminals). ~30% fewer tokens — no corner glyphs, no manual
padding, separator row is shorter than `├─┼─┤`.

### 5. Tree without bounding frame

Hierarchy is self-evident from `├── └──` indentation. Wrapping a tree in
`┌─...─┐` adds zero information, adds full border cost. Trigger-table
already says "hierarchy → tree" (no mention of frame around tree); this
needs to become a hard "no double-wrap" rule.

### 6. Side-by-side for binary comparison

Two columns separated by a single `│` beats both:
- Two stacked lists (loses parallel-position alignment)
- Markdown table (overhead for 2 columns)

```
before                 │ after
─────────────────────── │ ───────────────────────
frame-everything       │ smallest-visual-first
~280 char status       │ ~120 char status
```

## Proposed lint rules (new phase, NOT 8.5)

### L11_overdecoration

Detect: frame block (`^\s*┌─+┐` … `^\s*└─+┘`) with ≤5 inner content lines.
Severity: `warn` (not error — sometimes 5 is genuinely the boundary).
Message: "frame used for ≤5 items; consider dot-leader list (saves ~N
tokens)".
Autofix: convert frame → dot-leader list. Trivial — strip borders, replace
`│ <content> │` with `<content> ... <state>` if pattern matches.

### L12_token_budget

Detect: estimate token cost of every visual in the response. Warn if a
visual is dominated by padding (padding-chars > content-chars). Warn if
total ASCII overhead exceeds N% of response.
Severity: `warn`.
Use case: post-response audit in Stop-hook — surfaces wasteful patterns
without blocking.

### L13_double_wrap (lower priority)

Detect: tree (`├──`, `└──`) inside frame. Warn — tree doesn't need frame.

## Out of scope for Phase 8.5

Phase 8.5 fixes **misaligned** frames (autofix engine). This research is
about **avoiding the frame in the first place** when a lighter visual
fits. Different problem, different rules, different phase.

## Output-style presets (`short` / `middle` / `full`) — new axis

Proposed by user 2026-05-10. Orthogonal to current `lite | full | ultra`
intensities (which control **rules-file size**, i.e. how much instruction
the agent ingests). This new axis controls **output style** — how much
visual decoration the agent produces.

```
axis                  what it controls           current state
──────────────────── ─────────────────────────  ──────────────
intensity (lite/full/  size of injected ruleset   shipped (Phase 8)
ultra)                 the agent sees
output-style (short/   how heavy the agent's      NEW — proposed
middle/full)           visuals can be
```

Three presets:

| preset  | visual ceiling                              | use case                  |
|---------|---------------------------------------------|---------------------------|
| short   | inline glyphs + dot-leader; no frames/trees | mobile/voice, dense chat  |
| middle  | + trees, markdown tables; frame only ≥6    | balanced default          |
| full    | + frame blocks, side-by-side, ASCII art    | spec docs, retros, design |

Mapping to the smallest-visual-first ladder:

```
prose → inline-glyph → dot-leader → tree → md-table → frame-block
  └──── short ────┘
  └────────── middle ──────────┘
  └──────────────────── full ────────────────────┘
```

How it ships (sketch):

- Store `output_style` in `~/.claude/.feynman/state.json` alongside
  existing `intensity` field. Schema change, but additive — back-compat
  preserved via default = `full`.
- `/feynman style short|middle|full` skill subcommand to switch.
- Rules-file adds a `<style>` element per intensity (one line each)
  read by hook before injection — but the simpler path is **runtime
  filtering**: the hook reads `output_style`, and if `short`, appends
  a single suppression line to additionalContext:
  `Output style: short — no frame-blocks, no ASCII art, dot-leader only.`
  No bytes added to rules-file unless user opted in.

Why this is cheap to implement:
- No new lint rules needed (orthogonal to L11/L12/L13).
- No rules-file budget impact if implemented as runtime suffix.
- Reversible per session — user toggles when context calls for it.

Risk:
- Three intensities × three output-styles = 9 combinations. Need a
  preset matrix in docs to avoid combinatorial confusion. Most users
  will likely stay on `full + middle` (the proposed sane default for
  v0.4.x).

## Implementation note for v0.4.x

Two phases worth:

```
Phase A — rule additions
  L11 + L12 + L13 wired into lib/lint/rules.js
  fixtures in tests/lint-cases.json
  --fix support for L11 (autofix to dot-leader)

Phase B — rules-file expansion
  Add smallest-visual-first ladder to <contract>
  Requires byte budget — needs prior compaction round
  (drop redundant examples, share <ladder> across intensities)
```

Recommend: do Phase A first (no budget impact), measure how often L11
fires in real session logs, then decide if Phase B (rules-file expansion)
is worth the byte cost.

## Anchor for self-discipline (immediate, no code)

Until L11 lands, follow this manually in chat replies:

```
status ≤5 items  → dot-leader   (item ............ state)
status ≥6 items  → frame block  (justified group)
single fact      → prose        (no visual)
linear sequence  → arrow flow   (one line)
2-col compare    → side-by-side (single │ separator)
3+ col compare   → markdown table
```

Re-read this before drafting any status reply. The cheapest token-economy
improvement is dropping a frame that didn't need to exist.
