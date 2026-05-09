---
phase: quick-260509-hvy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/lint/rules.js
  - lib/lint/index.js
  - tests/lint-cases.json
  - tests/lint.test.js
  - docs/lint-rules.md
  - package.json
autonomous: true
requirements:
  - QUICK-L09-RIGHT-EDGE
must_haves:
  truths:
    - "Linter detects when an inner frame line's closing │ extends past the top ┐ column"
    - "Linter detects when an inner frame line's closing │ falls short of the top ┐ column"
    - "Linter detects when the bottom ┘ does not align with the top ┐ column"
    - "L09 reports rule='L09', severity='error', and the exact line + column where the divergent right edge was found"
    - "Frames whose right edges all align produce zero L09 issues"
    - "`npm test` passes after L09 lands and after package version bumps to 0.2.7"
  artifacts:
    - path: "lib/lint/rules.js"
      provides: "L09_right_edge_alignment function exported from rules module"
      contains: "L09_right_edge_alignment"
    - path: "lib/lint/index.js"
      provides: "L09 wired into perNodeRules registry after L08"
      contains: "L09"
    - path: "tests/lint-cases.json"
      provides: "≥3 positive (pass) and ≥3 negative (fail) golden fixtures for L09"
      contains: "L09"
    - path: "docs/lint-rules.md"
      provides: "L09 reference section with What/Why/Source/Valid/Invalid"
      contains: "## L09"
    - path: "package.json"
      provides: "Version bumped to 0.2.7"
      contains: "\"version\": \"0.2.7\""
  key_links:
    - from: "lib/lint/index.js"
      to: "lib/lint/rules.js::L09_right_edge_alignment"
      via: "perNodeRules registry entry { id: 'L09', fn: rules.L09_right_edge_alignment }"
      pattern: "L09_right_edge_alignment"
    - from: "tests/lint.test.js"
      to: "Rule coverage check"
      via: "ruleIds array includes 'L09'"
      pattern: "ruleIds.*L09|'L09'"
---

<objective>
Add L09 right-edge alignment lint rule to feynman's diagram linter. Detection-only (no autofix).

Purpose: Catches the real-world defect where a frame's inner `│` lands at a different column than the top `┐` border (and where the bottom `┘` drifts from the top `┐`). L08 already verifies overall row width but uses `trimEnd()` and a single width metric — it does NOT catch a row whose right `│` is at column W+1 when the top `┐` is at column W (or vice versa) when trailing spaces or content shift the closing bar.

Output:
- New rule function `L09_right_edge_alignment` in lib/lint/rules.js
- Registered in lib/lint/index.js perNodeRules after L08
- ≥3 pass + ≥3 fail golden fixtures in tests/lint-cases.json
- Documented in docs/lint-rules.md
- package.json version → 0.2.7
- `npm test` green
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@lib/lint/rules.js
@lib/lint/index.js
@lib/lint/parser.js
@tests/lint-cases.json
@tests/lint.test.js
@docs/lint-rules.md
@package.json

<interfaces>
<!-- Key contracts the executor needs. Extracted from codebase. No exploration required. -->

From lib/lint/rules.js:
```javascript
// Rule signature pattern (all L01–L08 follow this):
function L0X_name(ast, fullText) {
  if (!ast || !ast.content) return [];
  const content = ast.content;
  // early-exit if no relevant chars
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;  // 1-based start line of the diagram in the source
  const issues = [];
  // ... walk lines, push issue() calls ...
  return issues;
}

// Issue helper (already defined at top of rules.js):
function issue(rule, severity, line, column, message, suggestion) {
  const obj = { rule, severity, line, column, message };
  if (suggestion) obj.suggestion = suggestion;
  return obj;
}

// displayWidth(str) is defined and exported within the file — it counts CJK as width 2.
// L09 uses CHARACTER index for column position (not display width) when locating ┐ / │ / ┘
// because the parser emits 1-based COLUMN indices via (charIdx + 1) — see L01 lines 92–95.
```

From lib/lint/parser.js (AST node shape — `ast` arg in rule fn):
```javascript
// Each diagram node:
// {
//   type: 'diagram',
//   content: string,        // raw multiline diagram text
//   startLine: number,      // 1-based line in source markdown where diagram begins
//   endLine: number,        // 1-based line where diagram ends
//   indent: number          // leading spaces of opening line
// }
```

From lib/lint/index.js (registration pattern — add L09 after L08):
```javascript
const perNodeRules = [
  { id: 'L01', fn: rules.L01_box_closure },
  // ...
  { id: 'L08', fn: rules.L08_frame_width },
  { id: 'L09', fn: rules.L09_right_edge_alignment },   // ADD THIS
];
```

From tests/lint.test.js (rule coverage check on lines 64–84):
```javascript
const ruleIds = ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08'];
// MUST update to include 'L09' — coverage test enforces ≥1 pass + ≥1 fail per rule.
```

From tests/lint-cases.json (fixture shape):
```json
{
  "name": "L0X label — short summary",
  "rule": "L0X",
  "expected": "pass" | "fail",
  "input": "```\n<diagram lines>\n```",
  "expected_issues": [{"rule": "L0X", "line": <optional 1-based>}]   // only for fail
}
```
</interfaces>

<rule_specification>
**L09 — Right-edge alignment (severity: error)**

For every frame block in a diagram (delimited by a top line containing `┌` and `┐`, and a bottom line containing `└` and `┘` at matching `┌`/`└` columns), determine the **anchor column** = character-index of the top `┐` (1-based).

Then, for each line strictly between the top and matching bottom of the frame:
1. If the line contains `│`, find the **last** `│` on the line (this is the closing right edge of that row). Its character-index (1-based) MUST equal the anchor column. If not → emit one L09 issue at `(absLine, anchorCol)`.
2. The bottom-line `┘` character-index (1-based) MUST equal the anchor column. If not → emit one L09 issue at `(bottomAbsLine, anchorCol)` reporting the bottom-corner drift.

Notes:
- Use **character index** (codepoint position via `for...of` or `[...line]` to handle multibyte box chars correctly), NOT display width. Box-drawing chars are codepoint-counted as width 1 — that matches the existing parser/L01 column convention.
- Only run once per opening `┌`+`┐` line. Find the matching close: first subsequent line where `└` is at the column of the top `┌` AND `┘` is somewhere on the line.
- If the frame never closes within the diagram, skip silently (L01 already flags unclosed frames).
- Do NOT emit if the line has no `│` (e.g., decorative gap line) — only check lines that have at least one `│`.
- Anchor column is computed via `[...topLine].indexOf('┐') + 1` style (codepoint-aware). A simple loop works:
  ```javascript
  function charIndexOf(line, ch) {
    let i = 0;
    for (const c of line) {
      if (c === ch) return i;
      i++;
    }
    return -1;
  }
  function lastCharIndexOf(line, ch) {
    let i = 0, last = -1;
    for (const c of line) {
      if (c === ch) last = i;
      i++;
    }
    return last;
  }
  ```
- Issue message format (mirror L08 voice):
  - Inner row: `Frame inner row '│' at col {actualCol} does not align with top '┐' at col {anchorCol} (line {topAbsLine})`
  - Bottom corner: `Frame bottom '┘' at col {actualCol} does not align with top '┐' at col {anchorCol} (line {topAbsLine})`
- Suggestion: `Pad or trim the row so the closing │/┘ lands at column {anchorCol}`
</rule_specification>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement L09 + register + test fixtures</name>
  <files>lib/lint/rules.js, lib/lint/index.js, tests/lint-cases.json, tests/lint.test.js, package.json</files>
  <behavior>
    Pass cases (must produce zero L09 issues):
    - P1: Single perfectly aligned frame
      ```
      ┌─ Status ─┐
      │  done    │
      │  wait    │
      └──────────┘
      ```
    - P2: Two stacked aligned frames in one diagram block
    - P3: Frame with decorative gap line (no `│` on that line) between aligned rows — must not flag the gap line
    - (Existing L08 pass cases must also remain L09-clean)

    Fail cases (must produce ≥1 L09 issue at the divergent line):
    - F1: Inner `│` extends past anchor (real-world defect — `│ ... PASS|` where right `│` is at column W+1, top `┐` at column W)
      ```
      ┌─ Status ─┐
      │  done    │
      │  long row PASS │
      └──────────┘
      ```
      → L09 at the long row line.
    - F2: Inner `│` falls short of anchor (row too narrow but L08 may also flag width — L09 still emits)
      ```
      ┌─ Status ─┐
      │  ok│
      └──────────┘
      ```
    - F3: Bottom `┘` shifted past anchor
      ```
      ┌─ Status ─┐
      │  done    │
      └────────────┘
      ```
      → L09 at bottom line referencing `┘` drift. (Note: L08 will also flag width — that's fine, L09 adds the column-precise diagnostic.)

    Coverage update: tests/lint.test.js `ruleIds` array MUST include 'L09'.
  </behavior>
  <action>
    1. **lib/lint/rules.js** — Add `L09_right_edge_alignment(ast)` per the `<rule_specification>` block above. Use codepoint-aware indexing helpers (inline `charIndexOf` / `lastCharIndexOf` or `[...line]` iteration). Early-exit if `!ast.content.includes('┌')`. Walk lines: when a line has both `┌` and `┐`, record `anchorCol = lastCharIndexOf(line, '┐') + 1` and `anchorTopCol = charIndexOf(line, '┌') + 1` and `topAbsLine = baseLineNum + li`. Then scan forward for the matching close line: first line where `charIndexOf(closeLine, '└') + 1 === anchorTopCol` AND closeLine contains '┘'. For every line strictly between, if the line contains `│`, compute `actualCol = lastCharIndexOf(line, '│') + 1`; if `actualCol !== anchorCol`, push the inner-row issue. After the loop, on the close line, compute `actualBotCol = lastCharIndexOf(closeLine, '┘') + 1`; if `actualBotCol !== anchorCol`, push the bottom-corner issue. Skip frames that never close. Add `L09_right_edge_alignment` to the `module.exports` block at the bottom of the file.

    2. **lib/lint/index.js** — Append `{ id: 'L09', fn: rules.L09_right_edge_alignment }` to the `perNodeRules` array, immediately after the L08 entry.

    3. **tests/lint-cases.json** — Append the 3 pass + 3 fail fixtures from `<behavior>` above. Use `"rule": "L09"` and `"expected": "pass"` / `"expected": "fail"`. For fail cases, include `"expected_issues": [{"rule": "L09"}]` (line numbers optional but include where unambiguous). Wrap inputs in fenced ``` blocks following the existing pattern. NOTE: F2 and F3 will also produce L08 errors — that's expected; the test runner only requires ≥1 matching-rule issue for fail cases (see lint.test.js lines 32–41).

    4. **tests/lint.test.js** — Update the `ruleIds` array on line 65 to include `'L09'`. No other changes required (the golden-case loop and coverage check pick up new fixtures automatically).

    5. **package.json** — Bump `"version": "0.2.6"` → `"version": "0.2.7"`.

    Do NOT add autofix — that's Phase 8.5 scope. Do NOT modify lib/lint/parser.js. Do NOT touch L01–L08 logic. Do NOT use `displayWidth` for L09 — column anchoring uses codepoint position.
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>
    - `npm test` exits 0
    - `node -e "console.log(require('./lib/lint').lint('\`\`\`\n┌─ X ─┐\n│ ok  │\n└─────┘\n\`\`\`').issues.filter(i=>i.rule==='L09').length)"` prints `0`
    - `node -e "console.log(require('./lib/lint').lint('\`\`\`\n┌─ X ─┐\n│  done    │\n│  long PASS │\n└──────────┘\n\`\`\`').issues.filter(i=>i.rule==='L09').length)"` prints `>=1`
    - `grep -c "L09" tests/lint-cases.json` returns `>=6` (3 pass + 3 fail, each named with L09)
    - `grep -c "\"version\": \"0.2.7\"" package.json` returns `1`
    - Rule coverage subtests `L09 has at least one pass case` and `L09 has at least one fail case` both pass
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| markdown source → linter | Untrusted developer-supplied markdown enters `parse()` then per-node rule fns |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-hvy-01 | D (DoS) | L09_right_edge_alignment | mitigate | Bounded by ast.content size (already parsed/length-limited by parser); single linear scan of lines, no nested unbounded loops, no regex backtracking risk (uses indexOf-style codepoint scans) |
| T-quick-hvy-02 | T (Tampering) | rule registration in index.js | accept | Local source file; modification requires repo write access already gated by GSD workflow |
| T-quick-hvy-03 | I (Info disclosure) | issue messages | accept | Messages echo column numbers and box-drawing characters from user input — no PII, no secrets crossing trust boundary |
</threat_model>

<verification>
- `npm test` green (golden cases + rule coverage + unit tests)
- New L09 fixtures present in tests/lint-cases.json (≥3 pass, ≥3 fail)
- L09 registered in perNodeRules after L08
- docs/lint-rules.md L09 section deferred? NO — included in this single-task plan via Action step (see below); the rule file scope is small enough to keep all five files in one task.

Wait — re-reading: docs update is required per task description. Add to Task 1 action.
</verification>

<docs_addendum>
**Also in Task 1 (sixth action step — append to docs):**

6. **docs/lint-rules.md** — Insert a new `## L09: Right-Edge Alignment (severity: error)` section between the existing L08 section and the `## \`language: text\` Convention` section. Follow the L08 section format exactly:
   - **What:** prose description of the anchor-column rule
   - **Why:** explain that L08 catches overall width drift but L09 catches the specific defect of a closing `│` or `┘` landing at a different column than the top `┐` (real-world report: `│ ... PASS|` with the right `│` extending past the top `┐` border)
   - **Source:** link `[\`lib/lint/rules.js#L<approx-line>\`](../lib/lint/rules.js)` (use the actual starting line of the new function)
   - **Valid:** a small aligned frame (use ``` fence — actual diagram, lints clean)
   - **Invalid:** the `PASS` overflow defect (use ```text fence so it does not trigger lint on the docs)
   - **Output:** sample gcc-format error line `file:N:M: L09 Frame inner row '│' at col X does not align with top '┐' at col Y (line Z)`

**Update the `<files>` field reading order:** Task 1 modifies six files: lib/lint/rules.js, lib/lint/index.js, tests/lint-cases.json, tests/lint.test.js, package.json, docs/lint-rules.md.
</docs_addendum>

<success_criteria>
- L09 rule function exists, exported, registered after L08
- ≥3 pass + ≥3 fail golden fixtures, each named with `L09` and `rule: "L09"`
- tests/lint.test.js `ruleIds` array includes `'L09'` (rule-coverage subtests pass)
- docs/lint-rules.md has a complete L09 section in the same format as L01–L08
- package.json version is `0.2.7`
- `npm test` exits 0
- No changes to lib/lint/parser.js
- No autofix logic added (detection-only — Phase 8.5 scope preserved)
- No changes to L01–L08 behavior (existing pass/fail cases still pass)
</success_criteria>

<output>
After completion, no SUMMARY.md required (quick task). Commit message suggestion:
`feat(lint): add L09 right-edge alignment rule (detection-only); bump v0.2.7`
</output>
