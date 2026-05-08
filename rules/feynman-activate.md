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

### Terminal-safe rendering

Tables are allowed when they stay readable in terminal chat. Wide Markdown
tables are a rendering defect: convert them into a cleaner terminal layout
instead of letting columns wrap unpredictably.

Choose the layout by readability:

```text
short matrix -> Markdown table is OK
status maps  -> ASCII frame blocks
long rows    -> key-value bullets
hierarchy    -> ASCII tree
sequence     -> arrow flow
comparison   -> max 3 columns, max 10 words per cell
```

Frame discipline:

```text
+---- Status ----+
| item-a | done  |
| item-b | risk  |
+----------------+
```

- Keep frame rows visually aligned.
- Keep diagram lines under about 88 columns when possible.
- If a row becomes long, split it into bullets or grouped frames instead of
  widening the table.
- Optimize for human scanning: aligned labels, short cells, stable columns,
  and no wrapped table rows.
- Use plain ASCII frames with `+`, `-`, and `|` when terminal compatibility
  matters.

### SDLC output patterns

For engineering status, retrospectives, handoffs, reviews, and release notes,
choose a human-scannable shape before writing prose. Prefer compact blocks with
explicit evidence over long narrative.

Use these shapes:

```text
status       -> frame with state, branch, commit, checks, blocker
retro        -> DONE / WORKED / FRAGILE / LEFT
handoff      -> NOW / NEXT / FILES / COMMANDS / RISK
review       -> FINDINGS first, then QUESTIONS, then SUMMARY
incident     -> IMPACT / CAUSE / FIX / PREVENTION
release      -> CHANGED / VERIFIED / RISK / ROLLBACK
decision     -> CONTEXT / OPTIONS / CHOICE / CONSEQUENCE
verification -> command -> result -> evidence -> gap
roadmap      -> NOW / NEXT / LATER / BLOCKED
phase        -> GOAL / SCOPE / PLAN / VERIFY / EXIT
UAT          -> SCENARIO / EXPECTED / ACTUAL / RESULT
risk register -> RISK / IMPACT / MITIGATION / OWNER
```

Status block pattern:

```text
+---- Status ----+
| repo    | name  |
| branch  | main  |
| commit  | abc12 |
| checks  | PASS  |
| blocker | none  |
+----------------+
```

Retro pattern:

```text
DONE:
- landed change with evidence

WORKED:
- useful command or decision

FRAGILE:
- risk or assumption

LEFT:
- next executable action
```

Roadmap pattern:

```text
NOW:
- current milestone or active phase

NEXT:
- next executable phase

LATER:
- deferred work

BLOCKED:
- dependency or decision needed
```

Phase pattern:

```text
GOAL:
- promised outcome

SCOPE:
- included / excluded boundaries

PLAN:
- implementation path

VERIFY:
- command, test, or review evidence

EXIT:
- condition for done
```

UAT pattern:

```text
SCENARIO:
- user action or workflow

EXPECTED:
- expected behavior

ACTUAL:
- observed behavior

RESULT:
- PASS / FAIL / BLOCKED
```

Risk register pattern:

```text
▲ high
RISK:
- what can go wrong
IMPACT:
- why it matters
MITIGATION:
- concrete control
OWNER:
- agent / human / system
▼ low
```

Rules:

- Put the answer first, evidence second, next action last.
- Never bury blockers in prose; give them their own label.
- For status and retro, avoid wide tables even when Markdown would be valid.
- Prefer `PASS`, `FAIL`, `BLOCKED`, `not run`, and exact command names.
- If verification was not run, say `not run` and name the command.
- For Russian chat, keep prose Russian and keep commands, paths, config keys,
  commits, and status labels in English.

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

**Status summaries** — Same as full mode. Uses ASCII `+---` frame blocks.

**Priority orderings** — Same as full mode. Uses ▲▼ scale.

### Terminal-safe rendering

Tables are allowed when they are compact and readable. Wide Markdown tables are
a rendering defect in terminal chat. Prefer ASCII frames, key-value bullets,
trees, and short columns for long content. Keep diagram lines under about 88
columns when possible. If content is long, split it into bullets or grouped
frames instead of widening the visual block.

### SDLC output patterns

All full-mode SDLC patterns apply. In ultra mode, use them aggressively for any
engineering status, retrospective, review, release, handoff, decision, or
verification answer. The default shape is:

```text
[state] --> [evidence] --> [risk] --> [next]
```

For retrospectives, prefer:

```text
DONE / WORKED / FRAGILE / LEFT
```

For status answers, prefer:

```text
+---- Status ----+
| item    | state |
| checks  | PASS  |
| blocker | none  |
+----------------+
```

### When no diagram appears

The only response that contains no diagram is a single sentence of pure prose with no enumerable items, no steps, no comparisons, and no structure of any kind.

All other responses — including those with two or more items, any named concept with sub-parts, any sequence of actions, any set of options — include an ASCII diagram.
<!-- /ultra -->
