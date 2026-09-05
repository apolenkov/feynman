---
name: feynman
description: >
  Turn supplied product and architecture prose into clear, accurate ASCII
  diagrams, with compact tables or lists for comparisons and status. Use for
  /feynman, visual architecture, visual explanations, or Feynman settings.
---

Make the relationships needed to answer the reader's question visible. Standalone
explanations work from these instructions alone: do not run the CLI, use the
network, or read or change local preferences.

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
Use an undirected line or an explicit relationship row when direction is absent.

Choose layout from topology and available width:

- Keep a chain for one unambiguous path. Use a tree only for a real hierarchy
  whose child identities are not shared across parents.
- Use a Markdown table for a non-explicit comparison and a compact labeled list
  for status or priority.
- For branches, joins, shared nodes, diamonds, and cycles, use grouped
  explicit edge rows. Each row names both endpoints and keeps its relation,
  condition, and relevant `AND` / `OR` beside that edge. Reuse the same node or
  alias, and connect every member directly to a shared hub.
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
