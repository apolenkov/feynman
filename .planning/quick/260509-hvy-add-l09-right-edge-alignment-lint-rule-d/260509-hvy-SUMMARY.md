---
phase: quick-260509-hvy
plan: 01
subsystem: lib/lint
tags: [lint, rule, detection-only, frame, alignment]
requires:
  - lib/lint/parser.js (AST node shape)
  - lib/lint/rules.js issue() helper
provides:
  - L09_right_edge_alignment rule
  - 0.2.7 release version
affects:
  - lib/lint (per-node rule registry)
  - docs/lint-rules.md
  - package.json + plugin manifests (version drift parity)
tech-stack:
  added: []
  patterns:
    - codepoint-aware char indexing (matches L01 column convention)
    - early-exit on missing ┌ marker
    - linear single-pass frame scan (no nested unbounded loops)
key-files:
  created: []
  modified:
    - lib/lint/rules.js
    - lib/lint/index.js
    - tests/lint-cases.json
    - tests/lint.test.js
    - docs/lint-rules.md
    - package.json
    - package-lock.json
    - .claude-plugin/plugin.json
    - .codex-plugin/plugin.json
decisions:
  - Sync version bump to all three manifests + lockfile (drift-test demands parity)
  - Skip frames that never close (L01 owns that diagnostic)
  - Skip lines without │ inside a frame (decorative gap lines remain valid)
  - Codepoint indexing, not displayWidth — column anchoring matches L01 convention
metrics:
  duration: ~12 min
  tasks: 1
  completed: 2026-05-09
status: complete
---

# Quick 260509-hvy: Add L09 Right-Edge Alignment Lint Rule Summary

L09 detects column-precise drift of a frame's closing `│` and bottom `┘` against
the anchor `┐` column — catches the real-world `│ ... PASS │` overflow that L08
misses; detection-only, no autofix.

## What Shipped

```
top ┐ at col W  ←─ anchor
inner │ at col W   → OK
inner │ at col W+k → L09 error (col-precise)
bottom ┘ at col W+k → L09 error (col-precise)
```

| File | Change |
|------|--------|
| `lib/lint/rules.js` | + `L09_right_edge_alignment` (codepoint-aware), + `charIndexOf` / `lastCharIndexOf` helpers, exported in registry |
| `lib/lint/index.js` | + `{ id: 'L09', fn: rules.L09_right_edge_alignment }` after L08 |
| `tests/lint-cases.json` | + 3 pass + 3 fail L09 fixtures (15 L09 references total) |
| `tests/lint.test.js` | `ruleIds` array now includes `'L09'` |
| `docs/lint-rules.md` | Header bumped to "Nine rules (L01-L09)"; new L09 section between L08 and `language: text` Convention |
| `package.json` | `0.2.6` → `0.2.7` |
| `package-lock.json` | both `version` fields → `0.2.7` |
| `.claude-plugin/plugin.json` | `0.2.6` → `0.2.7` |
| `.codex-plugin/plugin.json` | `0.2.6` → `0.2.7` |

## Verification

```
┌─ done criteria ─────────────────────────────┐
│ npm test                       227/227 ✓    │
│ aligned-frame L09 count        0          ✓ │
│ PASS-overflow L09 count        3 (≥1)     ✓ │
│ grep -c L09 lint-cases.json    15 (≥6)    ✓ │
│ grep -c "0.2.7" package.json   1          ✓ │
│ rule-coverage L09 pass+fail    both pass  ✓ │
└─────────────────────────────────────────────┘
```

## Commits

| Hash | Type | Message |
|------|------|---------|
| `4de0d02` | test | failing fixtures for L09 (RED) |
| `1d4ae5f` | feat | L09 implementation + register + docs + v0.2.7 bump (GREEN) |

TDD gate sequence: RED (`test:` 4de0d02) → GREEN (`feat:` 1d4ae5f).

## Deviations from Plan

**1. [Rule 2 — Critical sync] Bumped version in plugin manifests + lockfile**
- **Found during:** Task 1 verify step (`npm test` failed in `tests/package.test.js`)
- **Issue:** Plan listed only `package.json` for version bump, but project drift-tests enforce parity across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `package-lock.json`.
- **Fix:** Synced all four files to `0.2.7`.
- **Commit:** `1d4ae5f`

No autofix logic added (Phase 8.5 scope preserved). No changes to L01–L08 logic or `lib/lint/parser.js`.

## Self-Check: PASSED

- L09 exported, registered, documented, tested.
- npm test: 227/227 passed, 0 failed.
