---
plan_id: 08-5-01
status: completed
landed_in: 92fac21 (feat(08-5): Wave 1 — autofix engine + L10 mixed-script rule)
shipped_version: 0.3.2
date: 2026-05-10
---

# Plan 08-5-01 — SUMMARY

## What landed

`lib/lint/autofix.js` (new) — pure-function autofix engine exporting `autofix(text)`,
`autofixFrame(node)`, and `visualWidth(line)`. Walks text top-to-bottom, finds frame
regions matching `^\s*┌─*┐\s*$ … ^\s*└─*┘\s*$` with same indent, builds node objects
with `{top, inner, bottom, indent}`, calls `autofixFrame` per node, splices result back.
Skips frames inside fenced code blocks (\`\`\`). Idempotent on already-clean frames.
Width floor = top border's dash count to preserve deliberately-wide clean frames.

`tests/autofix.test.js` (new) — 11 unit tests covering:
- visualWidth: ASCII baseline, ANSI strip, Unicode marker grapheme counting
- autofixFrame: pad short line, idempotent, Unicode content preserved, indent preserved
- autofix: walks text, leaves frame-less unchanged, idempotent on two passes, handles
  sibling frames, empty frames, fenced-code-block skip

## Deviations from plan

- **Parser AST not extended.** Plan Task 3 anticipated extending `lib/lint/parser.js`
  to emit `kind: 'frame'` AST nodes. Instead, autofix walks raw text with regex —
  simpler, no parser surface change, and the function-level contract is unchanged.
  The test helper `frameNode()` constructs the object shape locally to match what
  `autofixFrame` accepts.
- **Implemented inline, not via subagent.** Plan called for a `gsd-executor` subagent
  with worktree isolation. First subagent attempt stalled at 600s watchdog mid-RED;
  partial test file was salvaged from disk. Second attempt (after retry) also stalled.
  Switched to inline implementation. The salvaged test file (15 cases originally) was
  trimmed to 11 cases that match the final API shape.

## Verification

```bash
node --test tests/autofix.test.js           # 11/11 pass
npm test                                     # 264/264 pass (+19 from baseline 245)
node -e "console.log(require('./lib/lint/autofix').autofix('┌──┐\n│ short │\n│ longer line │\n└──┘'))"
                                            # frame expanded, inner lines aligned
```

## Files touched

- `lib/lint/autofix.js` — new, 130 lines
- `tests/autofix.test.js` — new, 207 lines (salvaged from stalled subagent + adapted)

## Follow-up

- Plan 08-5-03 will tie L09 detection to `autofixFrame()` so violations emit
  `expected_after_autofix` previews. Deferred to fresh session.
