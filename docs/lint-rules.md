# Lint Rules Reference

feynman includes a linter for ASCII diagrams in markdown files.
Fifteen rules (L01-L15) enforce structural correctness and token economy.

Rules L01-L09 enforce structural correctness (boxes close, trees end with `└──`,
arrows are consistent, etc.). Rule L10 catches Cyrillic/Latin script mixing.
Rules L11-L15 enforce token economy: don't use a frame for what a dot-leader
can express; don't pad more than you fill; don't wrap a tree that already
groups itself; don't wrap homogeneous plain content in a frame.

Run: `npx @albinocrabs/feynman lint <file.md>` or `feynman lint <file.md>`

Add `--fix` to repair misaligned frame borders, convert L11-overdecorated
frames to dot-leader, or convert L15 homogeneous frames to plain text:
`feynman lint --fix <file.md>` — see [L08](#l08-frame-width-discipline-severity-error),
[L09](#l09-right-edge-alignment-severity-error),
[L11](#l11-overdecoration-severity-warn),
and [L15](#l15-homogeneous-frame-severity-warn).

Add `--explain` to annotate each frame with a token-cost breakdown:
`feynman lint --explain <file.md>` — emits per-frame
`framing: ~N chars; dot-leader: ~M chars; saving: -K`.

---

## L01: Box Closure (severity: error)

**What:** Every `┌` corner must have a matching `└` at the same column position;
every `┐` must have a matching `┘` at the same column.

**Why:** An unclosed frame box is visually deceptive — it implies containment
it doesn't deliver, and the unclosed edge is often invisible at a glance.

**Source:** [`lib/lint/rules.js#L66`](../lib/lint/rules.js)

### Valid

```
┌─ Status ──────┐
│  item-a  done │
│  item-b  wait │
└───────────────┘
```

### Invalid

```text
┌─ Status ─────────────┐
│  item-a    done       │
│  item-b    in progress│
```

Output:
```text
file:2:1: L01 Unclosed box: '┌' at line 2, col 1 has no matching '└' at same column
```

---

## L02: Tree Chars (severity: error)

**What:** The last child in each group of siblings must use `└──`, not `├──`.

**Why:** `├──` means "more siblings follow"; `└──` means "last child." Using
`├──` for the last item misleads the reader about the list's structure.

**Source:** [`lib/lint/rules.js#L156`](../lib/lint/rules.js)

### Valid

```
project
├── src
│   ├── components
│   └── utils
└── package.json
```

### Invalid

```text
project
├── src
│   ├── components
│   ├── utils
├── tests
├── package.json
```

Output:
```text
file:6:1: L02 Last tree child uses '├──' but should use '└──'
```

---

## L03: Arrow Style (severity: error)

**What:** Only one arrow style is allowed per diagram.

Recognized styles:

```text
→
-->
─→
──>
```

**Why:** Mixed arrow styles force the reader to verify that the styles are
equivalent rather than distinct, adding cognitive overhead without information.

**Source:** [`lib/lint/rules.js#L227`](../lib/lint/rules.js)

### Valid

```
[Step A] --> [Step B] --> [Step C]
```

### Invalid

```text
[Step A] --> [Step B] → [Step C] --> [Step D]
```

Output:
```text
file:1:1: L03 Mixed arrow styles: diagram uses '-->' and '→' — pick one style
```

---

## L04: Column Widths (severity: error)

**What:** All rows in a markdown table must have the same column count.
The separator row (`|---|---|`) must match the header column count.

**Why:** Mismatched column counts break the visual grid — the reader must
count pipes instead of reading structure.

**Source:** [`lib/lint/rules.js#L272`](../lib/lint/rules.js)

### Valid

```
Option A    | Option B    | Option C
------------|-------------|----------
fast        | slow        | medium
stateless   | persistent  | persistent
```

### Invalid

```text
Option A    | Option B
------------|-------------|----------
fast        | slow        | medium
```

Output:
```text
file:2:1: L04 Table separator has 3 columns but header has 2 columns
```

---

## L05: Flow Integrity (severity: error)

**What:** When two or more `[Box]` tokens appear on the same line, an arrow
must exist between each consecutive pair.

**Why:** Adjacent boxes without arrows are ambiguous — are they sequential
steps, parallel options, or unrelated elements? An arrow makes the
relationship explicit.

**Source:** [`lib/lint/rules.js#L349`](../lib/lint/rules.js)

Note: boxes separated by three or more spaces are treated as parallel layout
(e.g. side-by-side comparison columns) and do not require an arrow.

### Valid

```
[Auth] --> [Handler] --> [Response]
```

### Invalid

```text
[Auth] [Handler] [Response]
```

Output:
```text
file:1:1: L05 3 boxes on same line with no arrow between them: [Auth], [Handler], [Response]
```

---

## L06: Priority Scale (severity: warn)

**What:** When `▲` appears in a diagram, `▼` must also appear, and vice versa.

**Why:** A priority scale with only one end is not a scale — the reader
cannot determine whether the listed items are near the top or bottom of
the full range.

**Source:** [`lib/lint/rules.js#L399`](../lib/lint/rules.js)

### Valid

```
▲ high
  critical-bug
  security-patch
▼ low
  cosmetic-fix
```

### Invalid

```text
▲ high
  critical-bug
  security-patch
  performance-fix
```

Output:
```text
file:1:1: L06 Priority scale has '▲' but missing '▼' — scales require both ends
```

---

## L07: No Mermaid + ASCII Mix (severity: warn)

**What:** A document must not contain both a Mermaid fenced block and ASCII
diagram characters such as box corners, arrows, or tree branches.

**Why:** Mixing two diagram encoding systems forces the reader to context-switch
between visual vocabularies. It also signals that the response lacks a coherent
visual strategy.

**Source:** [`lib/lint/rules.js#L441`](../lib/lint/rules.js)

### Valid

A file with only ASCII diagrams:

```
[A] --> [B] --> [C]
```

### Invalid

A file with both a Mermaid block and ASCII art (shown as `text` fences to
avoid triggering the rule):

```text
[A] --> [B]

` ``mermaid
graph TD
  A --> B
` ``
```

Output:
```text
file:4:1: L07 Response mixes Mermaid (line 4) and ASCII diagrams — use one format only
```

---

## L08: Frame Width Discipline (severity: error)

**What:** All rows inside a `┌─ … ─┐` frame block must have the same
display width (measured in terminal columns).

**Why:** Ragged right edges in a frame add visual noise without information.
Consistent width makes the frame a clean visual container.

**Source:** [`lib/lint/rules.js#L476`](../lib/lint/rules.js)

Display width counts each Unicode character as 1 column (box-drawing
characters, Latin, and Cyrillic are single-width; CJK characters are
double-width).

### Valid

```
┌─ Status ──────┐
│  item-a  done │
│  item-b  wait │
│  item-c  ok   │
└───────────────┘
```

### Invalid

```text
┌─ Status ─────┐
│  item-a done │
│  item-b in progress - this line is much wider than the frame header
└─────────────────────────────┘
```

Output:
```text
file:3:1: L08 Frame row width 68 differs from frame header width 16 (line 1)
```

---

## L09: Right-Edge Alignment (severity: error)

**What:** For every frame block, the closing `│` on each inner row and the
bottom-right `┘` corner must land at the exact same character-column as the
top-right `┐` corner (the **anchor column**).

**Why:** L08 catches overall row-width drift but uses `trimEnd()` and a single
display-width metric — it does not catch the specific defect where a row's
closing `│` lands at column W+1 (or W−1) while the top `┐` sits at column W.
A common real-world example is `│  long row PASS │` whose right `│` extends
past the top `┐`: L08 may flag the width difference, but L09 reports the
column-precise drift on every offending row, including the bottom `┘`.

**Source:** [`lib/lint/rules.js#L563`](../lib/lint/rules.js)

L09 uses visual-column indexing via the shared `lib/lint/width.js` helper:
ANSI escapes (`\x1b[...m`), combining marks (U+0300..U+036F), zero-width
joiners (U+200B..U+200F), and BOM strip to width 0; CJK wide chars
(U+4E00..U+9FFF and related ranges) count as 2 cols. Lines with no `│`
(decorative gap lines) are skipped. Frames that never close are not
flagged here — L01 reports unclosed frames separately.

Frames in bare prose (outside fenced code blocks) can be **autofixed**
in-place via `feynman lint --fix <file>`. The autofix engine rebuilds the
top/bottom borders and pads inner rows so every `│`/`┘` lands at the same
visual column. Fenced frames (` ```...``` `) are skipped — those are
user-authored samples that should not be silently rewritten.

### Valid

```
┌─ Status ─┐
│  done    │
│  wait    │
└──────────┘
```

### Invalid

```text
┌─ Status ─┐
│  done    │
│  long row PASS │
└──────────┘
```

Output:
```text
file:3:11: L09 Frame inner row '│' at col 17 does not align with top '┐' at col 11 (line 1)
```

---

## L10: Mixed-Script Words (severity: warn)

**What:** A single word must not mix Cyrillic and Latin letters (e.g.
`zaфикшено` or `Cyrвнутри`). Project identifiers — anything in
`package.json`'s `name`, `keywords`, or `bin` fields, hyphenated kebab
tokens (`gsd-sdk`, `feynman-lint`, `worktree-agent-abc123`), and
numeric-suffixed alphas (`foo123`) — are whitelisted.

**Why:** Mixed Cyrillic+Latin tokens are a classic Runglish defect under
fast typing or autocorrect ("Anti-Runglish" rule from
`~/.claude/rules/language.md`). The token usually renders identically to
its Latin counterpart but breaks search, grep, and IDE rename. Severity
is `warn` not `error` — single-language teams may legitimately use
Russian-spelled English-like terms, so the linter surfaces these without
failing CI exit codes.

**Source:** [`lib/lint/rules.js#L10_mixed_script`](../lib/lint/rules.js)

L10 operates on full text (not per-diagram AST), so it catches mixed
tokens in prose, list items, and headings — anywhere words appear. Words
inside fenced code blocks are still checked (the linter treats them as
documentation content, not user-authored samples).

### Valid

```text
повторить зафикшено
проверь gsd-sdk пакет
worktree-agent-abc123
```

### Invalid

```text
повторить zaфикшено
тест Cyrвнутри слова
```

Output:
```text
file:1:11: L10 warn mixed-script token: zaфикшено
```

`--strict` flag promotes L10 warnings to failures; the default exit code
is unaffected by L10 hits.

---

## `language: text` Convention

To include intentionally-invalid diagram examples in documentation (as this
file does), wrap them in fences with the `text` language tag:

````markdown
```text
[A] [B]    ← no arrow — intentionally invalid for L05
```
````

The parser recognizes fenced code blocks but only lints blocks with no
language tag or with diagram-relevant languages. Blocks tagged `text` are
skipped.

This is the recommended way to document "bad" examples without causing
lint failures in your documentation files.

---

## L11: Overdecoration (severity: warn)

**What:** A frame block (`┌─...─┐ ... └─...─┘`) used to wrap ≤5 inner content
lines. The frame's borders and padding waste tokens that a dot-leader list
would not need.

**Why:** The trigger-table prescribes dot-leader for ≤5 status items. A
5-row frame at width 50 burns ~280 chars on borders + padding; the same
data as a dot-leader list costs ~120. Compounded across many status replies
per session, this is the largest single token-economy lever feynman has.

**Whitelist:** frames containing nested trees (`├──` / `└──`) or embedded
table columns (`│ key │ value │`) — those genuinely need the frame's
grouping. L13 (double-wrap) handles the tree case separately.

**Source:** [`lib/lint/rules.js#L11_overdecoration`](../lib/lint/rules.js)

### Valid (same data as dot-leader)

```
alpha ............ ok
beta  ............ wait
gamma ............ wip
delta ............ done
epsilon .......... done
```

### Invalid (frame for ≤5 items)

```text
┌──────────────────┐
│ alpha .... ok    │
│ beta  .... wait  │
│ gamma .... wip   │
│ delta .... done  │
│ epsilon .. done  │
└──────────────────┘
```

Output:
```text
file:1:1: L11 warn frame used for 5 items; consider dot-leader list (saves ~150 chars)
```

Token-cost comparison:

| form                  | ~chars | when uses              |
|-----------------------|--------|------------------------|
| inline pipe-separated | ~50    | context already set    |
| dot-leader list       | ~120   | default for ≤5 items   |
| frame block           | ~280   | ≥6 items, group needed |

**Autofix:** `feynman lint --fix <file>` converts qualifying frames to
dot-leader. Idempotent — running `--fix` twice produces zero further diff.
Unicode markers (`✓ done`, `✗ fail`, `← готов`) and indentation are
preserved. Non-pattern prose rows fall back to bullets (`- <content>`).

---

## L12: Token Budget (severity: warn)

**What:** A frame whose padding chars exceed its content chars. Padding
includes outer `│` chars and trailing spaces inside each row; content is
the trimmed inner text.

**Why:** When a frame is mostly air, the cost is mostly air. Either tighten
the frame to fit content, drop to a lighter visual, or accept the
token tax explicitly.

**Source:** [`lib/lint/rules.js#L12_token_budget`](../lib/lint/rules.js)

### Valid (content-dominated frame)

```
┌──────────────────────────────────┐
│ deploy production rollout step a │
│ deploy production rollout step b │
│ deploy production rollout step c │
└──────────────────────────────────┘
```

### Invalid (padding-dominated frame)

```text
┌────────────────────────────────────────┐
│ ok                                     │
│ no                                     │
│ ok                                     │
└────────────────────────────────────────┘
```

Output:
```text
file:1:1: L12 warn frame is padding-dominated (padding=120 > content=6); consider lighter visual
```

**`--explain` flag:** `feynman lint --explain <file>` emits a per-frame
breakdown that quantifies the cost difference:

```text
file:1: explain: framing block: ~280 chars (border: 12, padding: 168, content: 100)
file:1: explain: equivalent dot-leader: ~120 chars
file:1: explain: saving: -160 chars
```

Cost data comes from `estimateFrameCost` in [`lib/lint/rules.js`](../lib/lint/rules.js)
— the same source L12 uses for its threshold check.

---

## L13: Double Wrap (severity: warn)

**What:** A tree (`├──` / `└──`) appearing inside a frame block. Tree
indentation already conveys hierarchy — wrapping it adds zero information
at full border cost.

**Why:** A tree IS a visual structure. Wrapping it in a frame is
double-encoding; the frame contributes nothing the indentation does not
already deliver. Drop the frame, keep the tree.

**Source:** [`lib/lint/rules.js#L13_double_wrap`](../lib/lint/rules.js)

### Valid (bare tree, no frame)

```
project
├── src
│   ├── index.js
│   └── utils.js
└── package.json
```

### Invalid (tree wrapped in frame)

```text
┌──────────────────┐
│ project          │
│ ├── src          │
│ │   ├── index.js │
│ │   └── utils.js │
│ └── package.json │
└──────────────────┘
```

Output:
```text
file:1:1: L13 warn tree inside frame block — the tree already conveys hierarchy; drop the frame
```

**Complementary to L11:** L11 (overdecoration) whitelists tree-in-frame
because nested trees can sometimes justify the wrap. L13 takes the
opposite stance: even with grouping, the cost-benefit is negative. Both
rules fire on the same tree-in-frame input, but communicate different
fixes — L11 silent (whitelisted), L13 fires. A unit test
(`L11 and L13 are complementary on tree-in-frame`) pins the contract.

---

## L14: Blank-Line Separation (severity: warn)

**What:** A fenced code block or frame block that is not preceded by a blank
line. Every structural visual element must be separated from the surrounding
prose by at least one blank line.

**Why:** Markdown parsers and terminal renderers depend on blank-line
boundaries to detect block-level elements. A code fence or frame that
immediately follows prose without a blank line can be swallowed into the
paragraph, losing its monospace rendering and breaking copy-paste fidelity.

**Whitelist:** the very first line of the file; code fences that follow
another closing fence or another blank line; frames that start the file.

**Source:** [`lib/lint/rules.ts#L14_blank_line_separation`](../lib/lint/rules.ts)

### Valid (blank line before the block)

```text
Here is the result of the build step.

(blank line above)
npm run build — exit 0
```

### Invalid (code fence immediately after prose)

```text
Here is the result of the build step.
(no blank line)
npm run build — exit 0
```

Output:
```text
file:2:1: L14 warn fenced block not preceded by blank line
```

---

## L15: Homogeneous Frame (severity: warn)

**What:** A frame block (`┌─...─┐ ... └─...─┘`) whose inner lines are all
the same content type: k:v pairs, bullet items, or plain prose. Frames
that homogeneously contain one type of plain content add no visual
information — the box borders and padding are pure token waste.

**Why:** A frame implies internal structure or heterogeneous content. When
every inner line is `key: value`, or every line is `- item`, the box is
redundant decoration. Converting to plain text saves ~30-60% of the token
cost at zero loss of meaning.

**Minimum threshold:** ≥2 inner lines required. A single-item frame is
too ambiguous to auto-convert.

**Whitelist (frame is kept as-is):**
- Inner lines contain tree connectors (`├──` / `└──`) — structural frame.
- Any line contains `│` twice or more — embedded table columns.
- Any line contains right-pointing flow arrows — treated as a flow diagram.
- All inner lines match state markers (`← готов`, `✓ done`, etc.) — status
  frame; L11 handles the conversion path for those.

**Source:** [`lib/lint/rules.ts#L15_homogeneous_frame`](../lib/lint/rules.ts)

### Valid — heterogeneous content stays framed

```text
┌─ Deploy status ──────────┐
│ step 1    ← готов        │
│ step 2    ← в работе     │
│ step 3    ← заморожено   │
└──────────────────────────┘
```

### Invalid — homogeneous k:v content inside frame

```text
┌──────────────────────────┐
│ host:    api.example.com │
│ port:    8080            │
│ timeout: 30s             │
└──────────────────────────┘
```

Output:
```text
file:1:1: L15 warn frame wraps homogeneous kv content; consider plain format (saves ~80 chars)
         Use feynman-lint --fix to convert to plain text — see docs/lint-rules.md#l15
```

### After `--fix`

```text
host:    api.example.com
port:    8080
timeout: 30s
```

**Autofix:** `feynman lint --fix <file>` converts qualifying frames to
plain text. Bullet frames normalise to `- item` style. Title lines
(`┌─ Title ─┐`) are preserved as a leading plain line above the content.
Idempotent — running `--fix` twice produces zero further diff.

**Conservative-first:** the stop-hook (`feynman-session-start`) does **not**
enable L15 conversion by default. Only `feynman lint --fix` opt-in triggers
it. This preserves frames that an author drew intentionally, even if feynman
cannot detect the intent.

