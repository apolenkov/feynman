---
plan_id: 08-5-04
status: partial (CLI half shipped; Stop-hook integration + docs deferred)
landed_in: 46e425a (feat(08-5): CLI --fix flag — repair frames in place using autofix engine)
shipped_version: 0.3.2
date: 2026-05-10
---

# Plan 08-5-04 — SUMMARY (PARTIAL)

## What landed

`bin/feynman-lint.js` gained `--fix` flag:
- Reads file path (stdin not supported — would surprise downstream pipes)
- Calls `autofix(before)` from `lib/lint/autofix.js`
- Writes back only if content changed
- Exit 0 on success; idempotent on already-clean files

USAGE help-text updated to advertise `--fix` next to `--strict`.

End-to-end smoke verified: `┌──┐` + 28-char content → autofix expands borders to
correct width, inner lines aligned, idempotent on second run.

## What did NOT land (deferred to fresh session)

- **Plan 04 part 2 — Stop-hook autofix integration.** `hooks/feynman-lint.js`
  should call `autofix()` on the model's response before showing to user, with
  fallback to current rule-feedback path if no frame nodes detected. NOT
  implemented — requires careful integration with the existing Stop-hook flow
  and live testing against real model responses.
- **Plan 04 part 3 — docs.** `docs/lint-rules.md` should add L09 + L10 entries
  with valid/invalid examples; `README.md` should mention `--fix` in the linter
  section. NOT updated.

## Deviations from plan

- Plan was originally Wave 3 (depending on Wave 2 = Plan 03 hardening). Wave 2
  was skipped — L08/L09 already detection-capable from prior phase work, full
  hardening (combining marks / ZWJ / CJK width) deferred. CLI `--fix` works on
  top of existing rules without the hardening; it just won't perfectly handle
  edge-case Unicode-width content until Plan 03 lands.
- Originally planned as one big TDD plan (test-first); shipped as a minimal
  forward addition because subagent watchdog stalls had eaten time budget.
  CLI tests not written separately — smoke verified manually + the autofix
  unit tests (Plan 01) cover the engine.

## Verification

```bash
cat > /tmp/broken.md <<'EOF'
┌──┐
│ short text │
│ much longer line of content │
└──┘
EOF
node bin/feynman-lint.js --fix /tmp/broken.md && cat /tmp/broken.md
# expanded to width 28, inner lines aligned

node bin/feynman-lint.js --fix /tmp/broken.md && cat /tmp/broken.md
# idempotent, no diff

npm test                                    # 264/264 pass
```

## Files touched

- `bin/feynman-lint.js` — argv parsing, `--fix` branch, USAGE help-text. ~30 lines added.

## Follow-up

- Stop-hook integration: read `hooks/feynman-lint.js` existing structure, add
  `parse()` + `autofix()` calls before the rule-feedback path. Live-test by
  feeding it a synthetic broken-frame response and asserting `additionalContext`
  contains the fixed text.
- Docs: trivial — add L09/L10 to `docs/lint-rules.md` (template from L01-L08
  entries already present); add one-liner to `README.md` linter section.
- Both above + Plan 03 hardening → bump to v0.3.3, npm publish.
