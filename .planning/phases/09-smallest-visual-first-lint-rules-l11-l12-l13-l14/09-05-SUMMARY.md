# Plan 09-05 Summary: --explain CLI flag

**Completed:** 2026-05-10
**Status:** ✓ Done
**Plan:** [09-05-PLAN.md](./09-05-PLAN.md)
**Requirements satisfied:** LINT-12 (CLI surface for cost data)

## What shipped

`bin/feynman-lint.js --explain <file>` emits a per-frame token-cost breakdown showing what each frame costs vs. its dot-leader equivalent. Read-only — does not call autofix, does not write to disk. Composes with `--json` (cost data goes into the JSON object as `explain: [{line, cost}]`).

## Implementation

| Artifact | Location | Notes |
|---|---|---|
| `--explain` flag parsing | `bin/feynman-lint.js:38, 47` | sibling of `useFix`/`useJson`/`useStrict` |
| `explainFrames(text)` helper | `bin/feynman-lint.js:96-126` (approx) | canonical `/^\s*│.*│\s*$/` walker, NOT startsWith+break |
| Output rendering | `bin/feynman-lint.js#run()` | renders explain lines BEFORE gcc issue list |
| USAGE constant | `bin/feynman-lint.js:16-33` | `--explain` line + Options block |
| Integration tests | `tests/cli.test.js` | 6 tests in `feynman-lint --explain flag` describe |

## Output format

### gcc mode (default)

```
file.md:2: explain: framing block: ~280 chars (border: 12, padding: 168, content: 100)
file.md:2: explain: equivalent dot-leader: ~120 chars
file.md:2: explain: saving: -160 chars
```

Line-number prefixed gcc-style, matching the existing issue format so editor parsers handle it uniformly.

### JSON mode (--explain --json)

```json
{
  "file": "input.md",
  "passed": false,
  "issues": [...],
  "explain": [
    {
      "line": 2,
      "cost": {
        "framing_chars": 280,
        "content_chars": 100,
        "border_chars": 12,
        "padding_chars": 168,
        "dotleader_equivalent": 120,
        "saving": 160
      }
    }
  ]
}
```

## Key design decisions

1. **Cost data comes from `rules.estimateFrameCost`.** Plan 09-02 exported it specifically as the single-source cost primitive. Plan 09-05 imports it via `require('../lib/lint/rules').estimateFrameCost` — no parallel math.

2. **Frame walker uses canonical regex pattern.** `/^\s*│.*│\s*$/ + continue` matches `lib/lint/rules.js` (L11/L12/L13) and `lib/lint/autofix.js`. Plan-checker's "walker drift" warning addressed.

3. **`--explain` is read-only.** Pinned by integration test `--explain does NOT modify the file`. No risk of accidental disk write even if user combines flags incorrectly.

4. **`--explain` does NOT consume `--fix` path.** `--fix` short-circuits via `process.exit(0)` before `run()`. If both flags are present, `--fix` wins (existing behavior); test order verified.

5. **No `inFence` tracking.** The plan-checker's earlier comment about an unused `inFence` variable was addressed at planning time. The current walker does NOT track fenced-code boundaries — feynman's other walkers don't either, so consistency wins over surgical fence-awareness.

## Test totals

- Baseline before Plan 09-05: 317 / 317 (from Plan 09-03)
- After 09-05: **323 / 323 pass**
- Delta: +6 tests (6 integration tests in cli.test.js)

## Commits

```
983d63d feat(09-05): add --explain CLI flag with per-frame cost annotation
48e7f34 test(09-05): add failing CLI tests for --explain flag (RED)
```

## Smoke output

```
$ node bin/feynman-lint.js --explain /dev/stdin <<EOF
\`\`\`
┌────────────────────────────────┐
│ a                              │
│ b                              │
│ c                              │
└────────────────────────────────┘
\`\`\`
EOF
/dev/stdin:2: explain: framing block: ~170 chars (border: 68, padding: 99, content: 3)
/dev/stdin:2: explain: equivalent dot-leader: ~6 chars
/dev/stdin:2: explain: saving: -164 chars
/dev/stdin:2:1: L11 warn frame used for 3 items; consider dot-leader list (saves ~164 chars)
/dev/stdin:2:1: L12 warn frame is padding-dominated (padding=99 > content=3); consider lighter visual
```

L11 and L12 fire together with --explain — the cost breakdown explains *why*.

## Next

Plans 09-04 (LINT-14 autofix) and 09-06 (docs) remain. 09-04 requires HUMAN gate before execution.
