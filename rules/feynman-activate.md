<!-- feynman diagram rules — feynman-activate.md -->
<!-- Hook reads only the section matching the active intensity. -->
<!-- Variants: lite (flow+trees), full (all types, default), ultra (force diagrams). -->

<!-- lite -->
## Feynman Diagram Rules — Lite

### When diagrams appear

**Sequential flows** — A response describing a sequence of steps, stages, or events (A then B then C, or numbered steps that proceed in order) includes an ASCII flow diagram.

Syntax: `[Step A] --> [Step B] --> [Step C]`

For branching flows:
```
[Start] --> [Decision?]
               |
        yes -- + -- no
        |             |
    [Path A]      [Path B]
        |             |
        +---- [End] --+
```

**Hierarchical structures** — A response describing a hierarchy, tree, or containment relationship with three or more levels includes an ASCII tree diagram.

Syntax:
```
root
├── child-a
│   ├── grandchild-1
│   └── grandchild-2
└── child-b
    └── grandchild-3
```

### When no diagram appears

Responses that are any of the following contain no diagram:
- A single fact or direct answer (one or two sentences)
- An answer under four lines that contains no explicit structure
- A response consisting entirely of a code block
- A comparison of options without multiple criteria (use a prose sentence or a list instead)
- A response where the user explicitly asked for prose, a narrative, or an explanation in words

The purpose of diagrams is clarity. A diagram that adds no clarity is absent.
<!-- /lite -->

<!-- full -->
## Feynman Diagram Rules — Full

### When diagrams appear

**Sequential flows** — A response describing a sequence of steps, stages, or events includes an ASCII flow diagram.

Syntax: `[Step A] --> [Step B] --> [Step C]`

For branching flows:
```
[Start] --> [Decision?]
               |
        yes -- + -- no
        |             |
    [Path A]      [Path B]
        |             |
        +---- [End] --+
```

**Hierarchical structures** — A response describing a hierarchy, tree, or containment relationship with three or more levels includes an ASCII tree diagram.

Syntax:
```
root
├── child-a
│   ├── grandchild-1
│   └── grandchild-2
└── child-b
    └── grandchild-3
```

**Comparisons** — A response comparing two or more options across multiple criteria includes side-by-side ASCII columns (maximum three columns, ten words per cell).

Syntax:
```
Option A          | Option B          | Option C
------------------|-------------------|------------------
fast startup      | slow startup      | medium startup
low memory        | high memory       | medium memory
no persistence    | full persistence  | optional
```

**Status summaries** — A response summarizing the status of multiple items, tasks, or states where the total content exceeds five lines uses a frame block.

Syntax:
```
+---- Status ----+
|item-a: done    |
|item-b: in prog |
|item-c: blocked |
+----------------+
```

**Priority orderings** — A response that orders three or more items by priority, importance, severity, or rank includes an ▲▼ priority scale.

Syntax:
```
▲ high
  item-1
  item-2
▼ low
  item-3
```

### When no diagram appears

Responses that are any of the following contain no diagram:
- A single fact or direct answer (one or two sentences)
- An answer under four lines that contains no explicit structure
- A response consisting entirely of a code block
- A case where a plain list or table already captures the structure clearly without a diagram
- A response where the user explicitly asked for prose, a narrative, or an explanation in words

The purpose of diagrams is clarity. A diagram that adds no clarity is absent.
<!-- /full -->

<!-- ultra -->
## Feynman Diagram Rules — Ultra

### When diagrams appear

All rules from full mode apply.

**Any structured response** — A response that contains any structure — even short ones — includes an ASCII diagram. Structure means: any list with two or more items, any comparison, any sequence, any hierarchy, any set of states.

**Short lists** — A response with two or more items in a list includes at minimum a simple ASCII tree or column layout, even when the overall answer is brief.

Syntax for a short tree:
```
topic
├── item-a
└── item-b
```

Syntax for a short column:
```
item-a    | item-b
----------|--------
detail    | detail
```

**Sequential flows** — Same as full mode. Includes an ASCII flow diagram.

**Hierarchical structures** — Same as full mode. Includes an ASCII tree.

**Comparisons** — Same as full mode. Includes side-by-side ASCII columns.

**Status summaries** — Same as full mode. Uses ┌─ frame blocks.

**Priority orderings** — Same as full mode. Uses ▲▼ scale.

### When no diagram appears

The only response that contains no diagram is a single sentence of pure prose with no enumerable items, no steps, no comparisons, and no structure of any kind.

All other responses — including those with two or more items, any named concept with sub-parts, any sequence of actions, any set of options — include an ASCII diagram.
<!-- /ultra -->
