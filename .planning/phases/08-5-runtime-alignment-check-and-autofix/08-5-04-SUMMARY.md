---
plan_id: 08-5-04
status: completed
landed_in: 46e425a + bc9f013 + c53b15e (CLI --fix; Stop-hook autofix; docs)
shipped_version: 0.3.3
date: 2026-05-10
---

# Plan 08-5-04 — SUMMARY

Originally landed PARTIAL in v0.3.2 (CLI `--fix` only). Closed completely in
v0.3.3 with Stop-hook integration and docs.

## What landed (across three commits)

**Part 1 — CLI `--fix` flag** (`46e425a`, v0.3.2):
- `bin/feynman-lint.js` accepts `--fix <file>`: reads file, calls
  `autofix(before)`, writes back only if content changed.
- Exit 0 on success; idempotent on already-clean files; stdin not supported
  with `--fix` (would surprise downstream pipes).
- USAGE help-text advertises `--fix` next to `--strict`.

**Part 2 — Stop-hook autofix integration** (`bc9f013`, v0.3.3):
- `hooks/feynman-lint.js`: after stdin parse, attempts `autofix(response)`
  inside a try/catch (best-effort, never crashes the hook).
- If autofix changed the response → emit
  `additionalContext: '<feynman-autofix>\n' + fixed + '\n</feynman-autofix>'`
  and exit 0. Fenced frames are never touched (autofix skips ```...```).
- If autofix is a no-op → fall back to existing rule-feedback path (L01-L10
  detection messages).
- 5 new Stop-hook tests in `tests/lint-hook.test.js`:
  - Path 5: autofix engaged for misaligned bare frame → wrapper emitted,
    autofixed text passes L08/L09 cleanly.
  - Path 6: autofix no-op for fenced frame or clean response → no wrapper.

**Part 3 — Docs** (`c53b15e`, v0.3.3):
- `docs/lint-rules.md`: bumped to L01-L10 reference; L09 width note
  rewritten for visual-column semantics (was codepoint); new L10
  (mixed-script) section with whitelist rules, valid/invalid examples,
  severity rationale. Top of file mentions `--fix` and links to L08/L09
  anchors.
- `README.md`: lint section shows both `feynman lint <file>` (detect-only)
  and `feynman lint --fix <file>` (repair) invocations with a short
  alignment explainer.

## Deviations from plan

- **Plan called for `<feynman-autofix>` wrapper around the fixed text** —
  shipped exactly as spec'd. No downstream Claude Code parsing issues
  observed in local smoke; left in place.
- **Plan asked for `try/catch` around autofix in the hook** — implemented.
  On exception, falls through to rule-feedback path (preserves current
  behavior, never crashes).
- **Plan asked for `docs/architecture.md` update if exists** — file exists
  but doesn't carry a lint-pipeline diagram, so skipped per the "if not,
  skip" branch.

## Verification

```bash
# CLI --fix end-to-end
cat > /tmp/broken.md <<'X'
┌──┐
│ short │
│ much longer line │
└──┘
X
node bin/feynman-lint.js --fix /tmp/broken.md && cat /tmp/broken.md
# frame expanded to width 17, inner lines aligned, idempotent
node bin/feynman-lint.js --fix /tmp/broken.md && cat /tmp/broken.md
# no diff on second pass

# Stop-hook end-to-end
echo '{"response":"Status:\n\n┌──┐\n│ x │\n│ much longer │\n└──┘"}' \
  | node hooks/feynman-lint.js
# emits hookSpecificOutput.additionalContext wrapped in <feynman-autofix>

npm test                              # 279/279 pass
npm view @albinocrabs/feynman version # 0.3.3
```

## Files touched

- `bin/feynman-lint.js` — `--fix` flag handling, ~30 lines added (v0.3.2)
- `hooks/feynman-lint.js` — autofix-first pass with fallback, +24 lines
- `tests/lint-hook.test.js` — Path 5/6 test groups, +80 lines
- `docs/lint-rules.md` — L10 section + L09 visual-column note + `--fix`
  preview, +60 lines net
- `README.md` — lint section rewrite, +8 lines net

## Follow-up

- None for the autofix path itself — covers misaligned bare frames in
  prose, leaves fenced samples alone, idempotent. Edge case: a frame
  inside an `<feynman-autofix>` wrapper from a prior response — autofix
  doesn't recognise the wrapper and would re-fix the already-fixed content
  (no-op since it's already aligned). Acceptable behavior.
- Open follow-up tracked separately:
  - L11 (overdecoration) / L12 (token-budget) — see
    `.planning/notes/token-economical-ascii-research-2026-05-10.md`.
  - Output-style presets (`short` / `middle` / `full`) — same research
    file.
