# Lint Rules Reference

feynman includes a linter for ASCII diagrams in markdown files.
Eight rules (L01-L08) enforce structural correctness.

Run: `npx feynman lint <file.md>` or `feynman lint <file.md>`

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
