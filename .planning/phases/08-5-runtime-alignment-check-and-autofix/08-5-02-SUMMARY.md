---
plan_id: 08-5-02
status: completed
landed_in: 92fac21 (feat(08-5): Wave 1 — autofix engine + L10 mixed-script rule)
shipped_version: 0.3.2
date: 2026-05-10
---

# Plan 08-5-02 — SUMMARY

## What landed

`lib/lint/rules.js` — added `L10_mixed_script(textOrAst)` rule. Detects within-word
Cyrillic+Latin mixing as severity `warn` (not `error`). Whitelist:
- Tokens in `package.json` `name`, `keywords`, `bin` fields (built once at module
  load via IIFE returning a `Set`)
- Any token containing `-` (hyphenated kebab identifiers like `gsd-sdk`,
  `worktree-agent-abc123`, `feynman-lint`)
- Numeric-suffixed alpha tokens (`foo123`, `quick260509`)

Cyrillic detection via `[А-Яа-яЁё]`; Latin via `[A-Za-z]`. Both required within
the same token after whitelist filters. Iterates lines via `tokenRe = /[\p{L}\p{N}_-]+/gu`.

`lib/lint/index.js` — wired L10 into dispatch as full-text rule (like L07), runs
once on the full markdown, not per AST node. Exit code unaffected by warn-only
issues.

`tests/lint-cases.json` — 6 L10 fixtures (salvaged from second stalled subagent):
positive `zaфикшено`, positive `Cyrвнутри` mid-word, negatives for `gsd-sdk`,
`feynman-lint`, `quick-260509-hvy`, `worktree-agent-abc123`.

## Deviations from plan

- **Implemented inline.** Subagent for this plan stalled at 600s watchdog around
  RED gate ("Now I need to add L10 to the rule coverage list" was its last line).
  The lint-cases.json fixtures it had written before stalling were preserved on
  disk and built into the inline impl.
- **Severity 'warn' not yet differentiated in CLI exit codes.** Plan called for
  refactoring `bin/feynman-lint.js` to distinguish warn from error in exit
  determination. The current `lib/lint/index.js` already filters `severity ===
  'error'` for `passed` calculation, so warn-only output exits 0 by default —
  no change needed. `--strict` flag treats any issue as failure, unchanged.

## Verification

```bash
echo "повторить zaфикшено" | node bin/feynman-lint.js -
# emits L10 warn, exit 0 (warn-only)

echo "проверь gsd-sdk пакет" | node bin/feynman-lint.js -
# silent (whitelisted), exit 0

npm test                                    # 264/264 pass
```

## Files touched

- `lib/lint/rules.js` — `L10_mixed_script` function + registry export, ~65 lines added
- `lib/lint/index.js` — L10 dispatch block after L07, 8 lines added
- `tests/lint-cases.json` — 6 L10 cases appended (already on disk from stalled subagent)

## Follow-up

- L10 currently does NOT have an autofix path (warns only — autofix would need
  translation, out of scope for v1.x).
- The Cyrillic range `[А-Яа-яЁё]` covers basic Russian. Wider Cyrillic blocks
  (Bulgarian, Serbian, Macedonian, Old Church Slavonic) deferred to post-8.5.
