# Plan 09-04 Summary: LINT-14 autofix to dot-leader

**Completed:** 2026-05-11
**Status:** ✓ Done
**Plan:** [09-04-PLAN.md](./09-04-PLAN.md)
**Requirements satisfied:** LINT-14
**Decision policy:** 4 design points pre-approved by user (D-09-04-01..04 + split)

## What shipped

`autofixFrameToDotLeader(node)` — new function in `lib/lint/autofix.js` that converts an L11-eligible frame (1-5 inner lines, no nested tree, no embedded table column) to a dot-leader list. `autofixFrame` (Phase 8.5 alignment) stays unchanged.

Dispatcher in `autofix(text, opts)` routes between the two based on two new orthogonal opts. Both default OFF → Phase 8.5 contract preserved verbatim for Stop-hook callers.

## Two orthogonal opts

| opt | default | Stop-hook | CLI `--fix` |
|---|---|---|---|
| `processFenced` | `false` | off (model samples untouched) | on (user docs converted) |
| `convertL11` | `false` | off (no silent style rewrite) | on (L11 frames → dot-leader) |

This was the design pivot advisor() resolved (see `.planning/notes/autonomous-log-2026-05-11.md` Pivot 1). The earlier single-flag design conflated "fence handling" with "style change" — splitting them lets Stop-hook keep its Phase 8.5 contract while CLI gets full LINT-14 behavior.

## Final decisions confirmed

| ID | decision | implementation |
|---|---|---|
| D-09-04-01 | column-width policy | label padded to labelMax, fixed dots count `max(3, maxRowW − labelMax − stateMax − 2)`, `maxRowW` capped at 80-indentW |
| D-09-04-02 | non-pattern fallback | mixed rows → all bullets (`- <content>`); pure-pattern rows → dot-leader |
| D-09-04-03 | state-marker allowlist | regex: `← готов/решение/заморожено/в работе/блок:X`, `✓✗◐⌛→ <word>`, `done/pending/wip/ok/fail/wait` (case-insensitive) |
| D-09-04-04 | whitelist composition | tree (├──/└──) or ≥3 │ chars → fall through to `autofixFrame` |
| Architecture | function split | `autofixFrameToDotLeader` new; `autofixFrame` untouched; dispatcher in `autofix()` |

## Dot-leader output convention

Label padded to `labelMax` → dots start at the same column on every row → fixed dot-count across rows → `aligned_dots: true` test holds. State width may differ, so row TOTAL length differs slightly — this is the conventional dot-leader look (state right-ragged):

```
phase 9      ........ done
phase 10     ........ pending
status check ........ ok
```

## Idempotency

Content-agnostic check: `autofix(autofix(x, opts), opts) === autofix(x, opts)`. No golden strings.

Pinned by 5 fixture-pair tests + 1 standalone unit test. Second pass finds no `┌` → identity transform.

## Test totals

- Baseline before Plan 09-04: 323 (Plan 09-05 closure)
- After 09-04: **349 / 349 pass**
- Delta: +26 tests (10 unit on autofixFrameToDotLeader + dispatcher + Phase-8.5-preservation; 5 fixtures × 2 shape+idempotency = 10; 1 CLI smoke; +5 misc)
- Zero regressions: Phase 8.5 alignment tests (autofix without opts) all pass

## Commits

```
ab5d81d feat(09-04): autofixFrameToDotLeader + dispatcher with two orthogonal opts
8efc082 test(09-04): add failing tests for autofixFrameToDotLeader (RED)
```

## Verification

```bash
$ npm test 2>&1 | grep -E "^ℹ"
ℹ tests 349
ℹ pass 349
ℹ fail 0

$ grep -c "function autofixFrameToDotLeader" lib/lint/autofix.js
1

$ grep -c "function autofixFrame" lib/lint/autofix.js
2   # autofixFrame (Phase 8.5) + autofixFrameToDotLeader (LINT-14)

$ grep -c "convertL11" lib/lint/autofix.js
2   # parameter destructure + dispatcher check

$ node -e "console.log(typeof require('./lib/lint/autofix').autofixFrameToDotLeader)"
function
```

## Smoke output

```
$ echo '┌────────┐
│ a ok   │
│ b wait │
└────────┘' > /tmp/test.md
$ node bin/feynman-lint.js --fix /tmp/test.md
$ cat /tmp/test.md
a ... ok
b ... wait
```

L11 autofix in CLI mode strips the frame and emits dot-leader. Phase 8.5 alignment (frames with ≥6 lines or tree/table) still runs as before.

## Phase 9 progress

```
Wave 1: 09-01 L11 detection     ✓ shipped
Wave 2: 09-02 L12 + estimateFrameCost ✓ shipped
Wave 3: 09-03 L13 + L11/L13 split ✓ shipped
Wave 4: 09-04 LINT-14 autofix   ✓ shipped (this plan)
        09-05 --explain CLI     ✓ shipped
Wave 5: 09-06 docs L01-L13      ← next
```

5 of 6 plans done. 22 of 22 v0.4.0 Phase 9 requirements covered. Next: 09-06 docs to close DOCS-L11.

## Next

→ Plan 09-06: docs/lint-rules.md adds L11/L12/L13 entries; intro count 10 → 13; README mentions `--explain`.
