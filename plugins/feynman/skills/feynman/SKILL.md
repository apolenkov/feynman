---
name: feynman
description: >
  Turn supplied product and architecture prose into clear, accurate ASCII
  diagrams, with compact tables or lists for comparisons and status. Use for
  /feynman, visual architecture, visual explanations, or Feynman settings.
  For brief or exact-output requests, use silently without a skill announcement.
  Read the exact catalog path verbatim, including repeated directory names;
  never guess the path or search the filesystem to locate this skill.
---

Make the relationships needed to answer the reader's question visible. Standalone
explanations work from these instructions alone: do not run the CLI, use the
network, or read or change local preferences.
Load only the exact skill path supplied in the catalog. If it is unavailable,
report the loading failure without searching elsewhere.
Respect the requested length and format across every visible message, including
before a tool call. Brief replies, greetings and exact-output requests need no
announcement of skill use or working process.

## Build the explanation

Silently identify the question and requested scope. For a whole-text
transformation, include every fact and relationship in that scope. For a focused
answer, narrow the scope only when useful and state what the diagram covers.

Before drawing, extract:

- every supplied entity, keeping its identity stable;
- each relationship's verb or type and whether it is directed or undirected;
- edge conditions, negation, and uncertainty;
- branch semantics, including whether alternatives are `AND` or `OR`.

Preserve the source's actor, action, target, direction, and qualifiers. Ordering
does not imply causation. Never guess a direction, mechanism, value, or link.
When the source rules out all other relationships, explicitly preserve that
absence and its scope. Do not weaken it to only shown, supplied, or known links;
keep unspecified relationships distinct from explicitly absent relationships.
Use an undirected line or an explicit relationship row when direction is absent.
Read an edge literally as its left endpoint, verb, then right endpoint. A
dependency uses `[Dependent] -- requires success of --> [Prerequisite]`;
do not reverse those endpoints while keeping the verb `requires`.

Every positive fact must appear as a labeled edge, node attribute, table cell,
or actual containment in the visual. This includes initial location and parallel
execution, not just the main route. A prose sentence inside a fence is still
prose; it cannot replace a missing visual relationship. Negative facts and
uncertainty may use concise local notes.

Choose layout from topology and available width:

- Keep a chain for one unambiguous path. Use a tree only for a real hierarchy
  whose child identities are not shared across parents.
- Use a Markdown table for a non-explicit comparison and a compact labeled list
  for status or priority.
- For an ASCII comparison, use aligned columns without outer borders.
- For branches, joins, shared nodes, diamonds, cycles and disconnected groups,
  use grouped explicit edge rows. Each row names both endpoints and keeps its relation,
  condition, and relevant `AND` / `OR` beside that edge. Reuse the same node or
  alias, and connect every member directly to a shared hub.
- Distinguish scoped identities in node names, such as `[East/API]` and
  `[West/API]`. Use headings and space to group them, without decorative frames.
- Do not hand-route diagonal or slanted wires or make the reader guess which
  endpoints a junction connects.
- Aim for at most 60 display columns and never exceed 80 or the user's narrower
  width. Go vertical when needed. For long names, use short aliases plus a
  legend containing every full name. Never truncate a name or label.

Render ASCII in a fenced code block. Keep every relationship label or condition
adjacent to its actual edge, with the source's relation name and direction.
Coordinated panels may form one primary visual when one layout cannot stay
clear; do not merge connectors in a way that makes their endpoints ambiguous.

Useful compact patterns:

```text
[Source] -- if condition (OR) --> [Branch A]
[Source] -- otherwise (OR) -----> [Branch B]

[Action] -- requires (AND) --> [Condition A]
[Action] -- requires (AND) --> [Condition B]

[Item] -- begins at --> [Entry]
[Job A] -- may run in parallel with -- [Job B]
[Job B] -- requires success of --> [Input]

[Member A] -- writes --> [Hub]
[Member B] -- reads ---> [Hub]
```

Work silently and show only the verified final visual, never a discarded draft.
Before answering, measure the widest rendered row and reflow if it exceeds the
target or cap. Then read the actual final diagram back edge by edge and compare
it with the extracted facts. Fix every omitted or invented edge, reversed
direction, detached condition, lost `AND`/`OR`, and ambiguous or duplicated
identity before answering. Check nearby prose against the same facts, especially
`only`, `all`, `none`, and `cannot`.

Use one primary visual by default and only enough prose to interpret it. An
explicit ASCII-diagram request overrides automatic suppression and output-style
limits. An explicit prose-only request overrides defaults; when explicit format
requests conflict, follow the user's latest instruction. Otherwise answer a
greeting, simple definition, recommendation, single fact, simple list, or
question-back directly in prose.

Correct a false premise instead of diagramming it as fact. If one missing
relationship would materially change the answer, ask one focused question. If
the user requests one question, ask exactly one independently answerable
question; do not join separate requests with “and” or “or”. Otherwise label the
uncertainty in the answer.

## Settings requests

For an explicit Feynman settings request or bare `/feynman`, follow
[the settings reference](references/settings.md). Those preferences affect the
optional CLI-installed hook, not standalone explanations.
