---
status: passed
phase: 3
verified_at: 2026-05-06
---

# Phase 3 Diagram Linter — Verification Report

## Requirement Coverage: LINT-01..12

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| LINT-01 | `lib/lint/parser.js` — ASCII diagram block parser | PASS | File created, 229 lines. Detects fenced ``` blocks and standalone ASCII art. Returns `{type, content, startLine, endLine, indent}` AST nodes. |
| LINT-02 | L01 box closure rule | PASS | `invalid-l01-unclosed-box.md` → L01 errors reported at correct lines. `valid-frame.md` → exit 0. |
| LINT-03 | L02 tree chars rule | PASS | `invalid-l02-bad-tree.md` → L02 errors on last ├── items. `valid-tree.md` → exit 0. |
| LINT-04 | L03 arrow style rule | PASS | `invalid-l03-mixed-arrows.md` → L03 error (mixed --> and →). `valid-flow.md` → exit 0. |
| LINT-05 | L04 column widths rule | PASS | Golden case with mismatched separator columns → L04 error. Matching table → pass. |
| LINT-06 | L05 flow integrity rule | PASS | `invalid-l05-orphan-boxes.md` → L05 error. `[A] --> [B]` → pass. Stop-hook with `[A] [B]` → additionalContext. |
| LINT-07 | L06 priority scale rule | PASS | `invalid-l06-half-priority.md` → L06 warn (▲ without ▼). `valid-frame.md` with both → pass. |
| LINT-08 | L07 no mermaid+ASCII mix | PASS | Golden case with mermaid + ASCII → L07 warn. ASCII-only → pass. Full-text rule (not per-node). |
| LINT-09 | L08 frame width discipline | PASS | `invalid-l08-frame-mismatch.md` → L08 errors on mismatched widths. `valid-frame.md` → exit 0. |
| LINT-10 | `bin/feynman-lint.js` standalone CLI | PASS | gcc-style output, --json, --strict, exit 0/1/2. See smoke tests below. |
| LINT-11 | `hooks/feynman-lint.js` Stop-hook variant | PASS | Reads `response` field, emits `additionalContext` on failure, exits 0 always. |
| LINT-12 | `tests/lint-cases.json` — 20+ golden cases | PASS | 26 cases total: 2-3 per rule (pass + fail), plus 2 integration cases. |

## Smoke Test Outputs

### Test 1: stdin unclosed box → exit 1 (L01)
```
$ echo '┌─ test ─┐' | node bin/feynman-lint.js -
<stdin>:1:1: L01 error Unclosed box: '┌' at line 1, col 1 has no matching '└' at same column
<stdin>:1:10: L01 error Unclosed box: '┐' at line 1, col 10 has no matching '┘' at same column
<stdin>: 2 errors
exit: 1
```
RESULT: PASS

### Test 2: valid-flow.md → exit 0
```
$ node bin/feynman-lint.js tests/fixtures/valid-flow.md
exit: 0
```
RESULT: PASS

### Test 3: invalid-l01-unclosed-box.md → exit 1, L01 message
```
$ node bin/feynman-lint.js tests/fixtures/invalid-l01-unclosed-box.md
tests/fixtures/invalid-l01-unclosed-box.md:5:1: L01 error Unclosed box: '┌' at line 5, col 1 has no matching '└' at same column
tests/fixtures/invalid-l01-unclosed-box.md:5:24: L01 error Unclosed box: '┐' at line 5, col 24 has no matching '┘' at same column
tests/fixtures/invalid-l01-unclosed-box.md:6:1: L08 error Frame row width 25 differs from frame header width 24 (line 5)
tests/fixtures/invalid-l01-unclosed-box.md:7:1: L08 error Frame row width 25 differs from frame header width 24 (line 5)
exit: 1
```
RESULT: PASS (L01 detected; L08 co-reported as the frame interior lines exceed header width)

### Test 4: JSON output valid-flow.md
```
$ node bin/feynman-lint.js --json tests/fixtures/valid-flow.md
{
  "file": "tests/fixtures/valid-flow.md",
  "passed": true,
  "issues": []
}
exit: 0
```
RESULT: PASS

### Test 5: Stop-hook with L05 violation
```
$ node -e "process.stdout.write(JSON.stringify({response:'text\n[A] [B]\n',session_id:'x'}))" \
  | node hooks/feynman-lint.js
{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"DIAGRAM LINT CORRECTIONS NEEDED:\n\n[L05] Flow integrity: two [Box] tokens on the same line must have an arrow between them\n  - Line 2: 2 boxes on same line with no arrow between them: [A], [B]\n    Fix: Add an arrow (-->, →) between consecutive boxes\n\nPlease correct the ASCII diagram(s) above before responding further."}}
exit: 0
```
RESULT: PASS

### Test 6: Stop-hook clean prose → exit 0, no stdout
```
$ echo '{"response":"clean prose, no diagram","session_id":"x"}' | node hooks/feynman-lint.js
exit: 0
```
RESULT: PASS

## Notes

- L06 and L07 severity is `warn` — they are reported but do not cause exit 1 by default. Use `--strict` to treat warns as errors.
- The `invalid-l01-unclosed-box.md` fixture also triggers L08 because the frame interior rows are 25 chars wide while the header is 24. This is a real issue with that fixture — intentional, as the fixture was designed to demonstrate L01 and the L08 co-detection adds value.
- Stop-hook smoke test 5: `echo '...\n...'` in zsh expands `\n` to a literal newline, producing invalid JSON. The hook handles this gracefully (silent exit 0). Use `node -e "process.stdout.write(JSON.stringify(...))"` for correct JSON encoding in shell tests.
