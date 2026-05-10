---
phase: 08-prompt-architecture-rewrite-xml-contract-token-economy-suppr
reviewed: 2026-05-10T00:00:00Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - hooks/feynman-activate.js
  - hooks/feynman-session-start.js
  - rules/feynman-activate.md
  - README.md
  - CLAUDE.md
  - tests/hook.test.js
  - tests/codex-app-server.test.js
  - tests/runtime-integration.test.js
  - package.json
  - .claude-plugin/plugin.json
  - .codex-plugin/plugin.json
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 8: Code Review Report — Advisory Catch-Up

**Reviewed:** 2026-05-10
**Depth:** deep (cross-file: hook ↔ rules ↔ tests ↔ docs)
**Files Reviewed:** 9 source + 3 manifest version bumps
**Status:** issues_found (advisory — no blockers)

## Summary

Phase 8 lands a working dual-format (XML canonical + HTML-comment fallback) intensity
extractor in both hook scripts plus a 58 % shrink of the rules file (10 450 → 4 410 B).
The core regex logic is sound and the dual-format fallback is safe in the contexts
it actually runs in. No `BLOCKER`-class defects: nothing crashes, nothing leaks
secrets, nothing mis-routes content between intensities.

What surfaces below is a set of `WARNING`-class robustness gaps and `INFO`-class
quality items: regex brittleness against future rule-file edits, a downgraded
test assertion that no longer asserts the contract its name implies, dead code
in a test predicate, and a few rule-file ambiguities where the model could
misclassify edge cases. Several findings are paired (same fragility shows up in
both `feynman-activate.js` and `feynman-session-start.js` — the hooks were
intentionally kept in lockstep).

```
phase 8 review map
├── hook regex   (WR-01..03 fragility, IN-01..02 hygiene)
├── rules file   (WR-04..05 ambiguity, IN-03..04 polish)
├── tests        (WR-06 downgrade gap, IN-05..06 dead code)
└── docs/CLAUDE  (IN-07 minor wording)
```

## Critical Issues

(None.)

## Warnings

### WR-01: XML extractor rejects `<intensity name="lite" foo="bar">` — extra attributes break match

**File:** `hooks/feynman-activate.js:79-82`, `hooks/feynman-session-start.js:31-34`
**Issue:** The matcher pattern `<intensity\s+name\s*=\s*["']lite["']\s*>` requires
the closing `>` to follow immediately after optional whitespace — any second
attribute (e.g. `<intensity name="lite" version="2">…`) is silently rejected and
the hook falls through to the legacy HTML-comment branch, which then also
misses (rules file no longer has those markers), and the hook exits 0 with no
injection. Verified via Node REPL:

```
sample3 = '<intensity name="lite" extra="x">…</intensity>'
re.exec(sample3) → null
```

So a future rule-file edit that adds *any* second attribute to the canonical
`<intensity>` tag will silently disable rule injection for that intensity — no
test would catch it because the rule-file integrity tests only assert the
*current* canonical form.

**Fix:** Allow trailing attributes:
```js
lite:  /<intensity\s+name\s*=\s*["']lite["'][^>]*>([\s\S]*?)<\/intensity>/,
full:  /<intensity\s+name\s*=\s*["']full["'][^>]*>([\s\S]*?)<\/intensity>/,
ultra: /<intensity\s+name\s*=\s*["']ultra["'][^>]*>([\s\S]*?)<\/intensity>/,
```
Or, if forward-compat for extra attrs is not desired, add a rules-file integrity
test that asserts no `<intensity name="X" …>` ever has a second attribute, so
breakage is caught at test time, not at runtime in user installs.

---

### WR-02: Unclosed `<intensity>` tag silently swallows the next block

**File:** `hooks/feynman-activate.js:79-83`, `hooks/feynman-session-start.js:31-35`
**Issue:** Lazy quantifier `[\s\S]*?` plus shared `</intensity>` closer means
that if the rules file ever ships with one block missing its closing tag, the
matcher for the *preceding* intensity will absorb the next intensity's body up
to the first `</intensity>` it finds. Verified:

```
sample5 = '<intensity name="lite">A\n<intensity name="full">B</intensity>'
re_lite.exec(sample5)[1] === 'A\n<intensity name="full">B'
```

The user would silently see lite getting full's content prepended to it. The
rules-file integrity test at `tests/hook.test.js:555-563` asserts exactly 3
opening and exactly 3 closing tags — that catches the cross-block contamination
case in CI, but **only when the production rules file is malformed**. It does
not catch the case where a third party fork or a manual edit leaves the file
unbalanced and the hook still runs.

**Fix:** Add a sanity assertion in the hook before extraction — count opening
and closing `<intensity>` tags and exit 0 if they don't balance:
```js
const opens  = (rulesContent.match(/<intensity\b/g) || []).length;
const closes = (rulesContent.match(/<\/intensity>/g) || []).length;
if (opens !== closes || opens === 0) process.exit(0);
```
This is cheap, defensive, and matches the existing "fail safe, exit 0" pattern.

---

### WR-03: Regex matchers are case-sensitive — silent breakage on `<INTENSITY NAME="lite">`

**File:** `hooks/feynman-activate.js:79-82`, `hooks/feynman-session-start.js:31-34`
**Issue:** Patterns lack `/i` flag. A future markdown linter, prettier-like
auto-formatter, or third-party fork that uppercases tag names would silently
disable injection. Verified `<INTENSITY NAME="lite">x</INTENSITY>` returns
`undefined`. This is low likelihood (the tests pin the canonical form) but the
failure mode is invisible — no error, no injection, just silently degraded
behavior.

**Fix:** Either add `/i` flag for tolerance, or document explicitly in
`CLAUDE.md` that tag names are case-sensitive and lock that as a convention.
Recommend `/i` on the matcher since XML names are conventionally
case-insensitive in human-edited files:
```js
lite:  /<intensity\s+name\s*=\s*["']lite["']\s*>([\s\S]*?)<\/intensity>/i,
```

---

### WR-04: `lite` intensity contract is incomplete — `status ≥6` mentioned in prose but absent from trigger table

**File:** `rules/feynman-activate.md:2-38` (lite block)
**Issue:** The `<triggers>` table for `lite` lists only `status ≤5 → dot-leader
list` (line 10). The prose immediately after says "Frames only for status ≥6
short-value rows" (line 13) — but the table itself never tells the model what
to do for `status ≥6`. The model has to infer from "Frames only" that frames
are *allowed* for ≥6, but the row is missing. In `full` (line 49) and `ultra`
(line 101) the row exists. Result: lite users get inconsistent behavior on
6-plus-item status lists — sometimes frame, sometimes nothing.

This drives every prompt of every lite user, so a small ambiguity compounds.

**Fix:** Add the row:
```markdown
| status ≥6     | frame block     |
```
Or remove the prose sentence "Frames only for status ≥6…" so lite is honestly
restricted to ≤5 status items via dot-leader.

---

### WR-05: `ultra` contract — "any list ≥2 items" trigger is over-aggressive and conflicts with suppression rule

**File:** `rules/feynman-activate.md:105` (ultra triggers)
**Issue:** The trigger row `| any list ≥2 items | tree or flow |` instructs the
model to render an ASCII tree/flow for *any* two-item list. But the
`<contract>` rule below (lines 112-114) says "Suppress: definition queries,
recommendation queries, greeting, conversational question-back — answer stays
in prose, no visual added." A simple recommendation like "Use option A or
option B because …" is exactly two items but is also a recommendation —
which trigger wins? The contract says suppress, the trigger table says
amplify.

For `ultra` mode (the maximum-aggression intensity), this ambiguity will
produce inconsistent model output — the eval harness probably averaged it
out at 17 WIN / 3 NEUTRAL / 0 HURT, but a single lossy edge case (like a 2-item
recommendation getting forced into a tree) is a real user-visible regression.

**Fix:** Either:
1. Tighten the trigger to `any list ≥3 items` (matches lite/full hierarchy
   trigger and avoids the 2-item recommendation conflict), or
2. Add explicit precedence to the contract: "Suppression rules outrank trigger
   rows. Apply triggers only after suppression check passes."

I recommend option 2 — it's a one-line edit and resolves the entire class of
trigger-vs-suppress conflicts going forward.

---

### WR-06: Test assertion downgrade `text.length > 50` does not assert the contract its name implies

**File:** `tests/codex-app-server.test.js:265-269`, `tests/runtime-integration.test.js:126-128`, `:140-142`
**Issue:** The assertion changed from a literal-string check (`includes('Feynman
Diagram Rules')`) to `text.length > 50`. The literal-string check broke because
the new XML rules file has no such header — fair. But the replacement `length >
50` only asserts "something with more than 50 characters got injected." It does
not assert:

- the content is *the rules file*, not a stack trace, error message, or stale
  output;
- the content matches the *requested intensity* — a lite/full/ultra mismatch
  would still pass `length > 50`;
- the content contains any of the load-bearing tokens (`triggers`, `contract`,
  `→`, `├──`) that the rules-file integrity tests assert at the file level.

The test now rubber-stamps any non-empty injection. The rules-file integrity
suite in `hook.test.js:541-629` does cover the file-level invariants, so the
gap is "does the *runtime path* still deliver the right content end-to-end" —
which was the whole point of these integration tests.

**Fix:** Replace `length > 50` with a content fingerprint that survives lite ↔
full ↔ ultra without being too specific:
```js
assert.match(context, /<triggers>|trigger table|→|├──/,
  'additionalContext should contain rule-file diagram tokens');
```
Or assert at least two of the four tokens (`triggers`, `contract`, `→`, `├──`)
are present — those exist in every intensity block in the canonical rules file.

## Info

### IN-01: Magic intensity list duplicated three places

**File:** `hooks/feynman-activate.js:74`, `hooks/feynman-session-start.js:18`, `tests/hook.test.js:611-616`
**Issue:** The list `['lite', 'full', 'ultra']` is hard-coded in three places.
A fourth intensity (e.g. `nano`, `paranoid`) would need synchronized edits in
all three plus the rules file plus the regex map. Not a bug today; a refactor
hazard.
**Fix:** Optional. If a fourth intensity is on the roadmap, extract a tiny
`hooks/intensity-matchers.js` module that exports the matcher map and the valid
list, and require it from both hooks and the test. Zero new deps, CommonJS.

---

### IN-02: Pre-compiled regex map declared inside the request handler — re-instantiated on every prompt

**File:** `hooks/feynman-activate.js:78-82`
**Issue:** `xmlMatchers` literal is constructed inside the `process.stdin.on('end',
…)` callback, so the regex objects are re-created every invocation. Each hook
call is a fresh `node` process, so this costs essentially nothing in practice
(the literal allocates once per process lifetime), but the inline comment on
line 77 says "pre-compiled regexes" which is misleading — they are
re-allocated each invocation, which is fine, just don't claim "pre-compiled."
**Fix:** Either move the const outside the callback (top of file, once per
process), or reword the comment to drop the "pre-compiled" claim. Strictly a
hygiene item.

---

### IN-03: Rules file legacy HTML preamble comment kept on line 1

**File:** `rules/feynman-activate.md:1`
**Issue:** Line 1 still reads `<!-- feynman diagram rules — hook reads block
matching active intensity -->`. The rules-file integrity test at
`tests/hook.test.js:565-568` asserts zero legacy `<!--\s*\/?(lite|full|ultra)\s*-->`
markers — the line-1 comment dodges that pattern (no intensity name) so it
passes, but the file is now nominally pure-XML and a stray HTML comment is
inconsistent.
**Fix:** Either drop the line, or convert to an XML comment for consistency:
```xml
<!-- still a comment, fine — but consider an XML processing instruction or
     just delete since the file is unambiguously named feynman-activate.md -->
```
Cosmetic.

---

### IN-04: `<patterns selection="one-of">` element is non-standard and only meaningful as model-readable text

**File:** `rules/feynman-activate.md:74-82`
**Issue:** The `selection="one-of"` attribute is invented for this contract —
it's not a standard XML schema, no parser enforces it, the hook does nothing
with it. It works as a *prose-readable hint to the model* and the test at
`tests/hook.test.js:586-591` asserts at least one of three equivalent markers
is present (`<patterns selection="one-of">` OR `select ONE` OR `mutex`). Fine
as-is, but the wrapper looks like enforced structure when it's just narrative.
**Fix:** Optional. Add a one-line comment in the rule file noting that
`selection="one-of"` is a model-readable hint, not a schema constraint, so
future contributors don't try to "validate" it.

---

### IN-05: Dead/non-load-bearing test predicate "lite section contains Lite in header"

**File:** `tests/hook.test.js:361-366`
**Issue:** The assertion is `ctx.includes('Lite') || ctx.length < ctxUltraLen()`.
Verified at runtime: the new XML rules file's lite block does NOT contain the
literal token `Lite` anywhere. So the test passes only via the right-hand
fallback — `ctx.length < ctxUltraLen()`. The `includes('Lite')` clause is dead
code post-rewrite, and the inner-function-after-use pattern (`ctxUltraLen` is
declared after it's called, relying on hoisting) makes the test hard to read.

The test name promises "section contains Lite in header" but the actual
assertion is "lite is shorter than ultra" — name and behavior diverge.
**Fix:** Either rename to `it('lite section is smaller than ultra', …)` and
drop the dead `includes` check, or assert on a token actually present in the
new rules file (e.g. `ctx.includes('dot-leader')` or `ctx.includes('amplify')`).

---

### IN-06: Test helper does naive single-quote string interpolation into JS source — fragile if `tmpHome` ever contains a single quote

**File:** `tests/hook.test.js:670-675` (`runHookWithRules` helper, also in Path 6 setup at lines 421-427)
**Issue:** The helper rewrites `RULES_PATH = '${escapedPath}'` by string
substitution. `escapedPath` only escapes backslashes (`replace(/\\/g, '\\\\')`)
— not single quotes. On macOS `mkdtemp` cannot produce a path containing a
single quote, so this is fine today, but a CI runner using a custom `TMPDIR`
or a Windows path edge case (the project doesn't claim Windows support but)
could break it. Defense-in-depth.
**Fix:** Use `JSON.stringify(rulesFilePath)` instead of manually quoting:
```js
const patchedSrc = hookSrc.replace(
  /const RULES_PATH\s*=.*$/m,
  `const RULES_PATH = ${JSON.stringify(rulesFilePath)};`
);
```
`JSON.stringify` produces a safe JS string literal in one call.

---

### IN-07: `CLAUDE.md` "Формат файла правил" section is accurate but understates the dual-format

**File:** `CLAUDE.md:74-78`
**Issue:** The section correctly says XML is canonical and HTML-comments are
backward-compat. Code matches. Minor: line 78 says "Хук поддерживает оба
формата" (hook supports both formats) — which is correct for *this version*,
but the project SPEC (`08-SPEC.md`) presumably has a deprecation timeline.
Without a timeline note here, future contributors may not know whether the
fallback is permanent or scheduled to be removed.
**Fix:** Add a one-line follow-up: "HTML-comment fallback подлежит удалению
в Phase X — см. `.planning/phases/08-…/08-CONTEXT.md` Area G". Or drop the
line if the intent is permanent dual-format support.

---

## Cross-File Notes

- **Hook parity:** `feynman-activate.js` and `feynman-session-start.js` share
  the same `xmlMatchers` map and the same fallback. Findings WR-01..03 apply
  to both equally — fix in one, copy to the other. The DRY violation noted in
  IN-01 is relevant here.
- **Rules-file integrity tests** (`tests/hook.test.js:541-629`) are the load-
  bearing safety net. They pin: file size ≤4480 B, exactly 3 opening + 3
  closing intensity tags, zero legacy HTML markers, presence of
  `<triggers>`/`<syntax>`/`<examples>`/`<contract>`, the four contract verbs
  (classify/channel/amplify/suppress), the four suppression classes, and rune
  density (≥6 `├──`, ≥6 `→`). Solid coverage. The two gaps in that net are
  WR-01 (extra attribute on intensity tag) and WR-04 (missing trigger row in
  lite) — both invisible to current assertions.
- **Release commit** (`611d879`): three identical version bumps 0.2.7 → 0.3.0
  in `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`.
  All three match. No findings.
- **README compaction-survivor section** (`9d14d33`): added 8 lines explaining
  why `UserPromptSubmit` over `SessionStart`. Accurate, well-placed, no
  issues.

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep (cross-file: hook regex ↔ rules content ↔ test assertions)_
