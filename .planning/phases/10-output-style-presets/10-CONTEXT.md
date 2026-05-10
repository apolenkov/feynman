# Phase 10: Output-style presets — Context

**Gathered:** 2026-05-11 (autonomous, derived from research notes + STATE.md)
**Status:** Ready for inline execution
**Source:** `.planning/notes/token-economical-ascii-research-2026-05-10.md` (output-style presets section)

## Goal

User picks output verbosity preset orthogonal to existing `intensity`:
- `short` — inline glyphs + dot-leader only; no frames/trees/ASCII art
- `middle` — trees + markdown tables OK; frame ONLY when ≥6 items, balanced default
- `full` — current default; all visuals allowed including frame blocks + side-by-side

Implementation = runtime suffix in `additionalContext` (no rules-file growth).

## Decisions (autonomous, no user pivots needed)

### STYLE-01 schema extension

state.json schema now:
```json
{
  "enabled": true,
  "intensity": "full",       // existing: lite | full | ultra (controls rules-file SIZE)
  "output_style": "full",    // NEW: short | middle | full (controls output STYLE)
  "injections": 0
}
```

Back-compat: missing `output_style` defaults to `"full"`. Hook reads `state.output_style || 'full'`. No migration needed.

### STYLE-02 /feynman style subcommand

Add `style` argument to feynman skill SKILL.md. `/feynman style short` writes `state.output_style = "short"`. `/feynman status` displays current output_style alongside intensity.

### STYLE-03 hook suffix injection

`hooks/feynman-activate.js` reads `state.output_style`. If not `"full"`, append one-line suffix to `additionalContext`:

- `short` → `"\n\nOutput style: short — dot-leader and inline glyphs only; no frames, no ASCII art, no trees."`
- `middle` → `"\n\nOutput style: middle — frame blocks only for ≥6 items; prefer trees and markdown tables."`
- `full` → no suffix (default behaviour)

Rules-file (`rules/feynman-activate.md`) NOT modified — the 4480-byte budget stays intact.

### STYLE-04 docs

- README.md: short paragraph in /feynman section explaining the three presets with token-cost example
- docs/architecture.md (if exists, else create new doc): "intensity × output_style" orthogonal axes diagram

## Constraints

- Zero new deps
- Hook must stay JSON-output only (bug #13912)
- Bash subprocess in skill must stay portable
- Total Phase 10 commit count target: 4-6 (one per requirement)
- Test-after-each via inline-TDD

## Out of scope

- Per-project output_style override (deferred to v0.5.0 per ROADMAP.md backlog)
- A/B harness to measure style impact (Phase 11)
