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

- Use a chain only for one path. Use a tree only for a real hierarchy whose
  child identities are not shared across parents.
- Use a Markdown table for a non-explicit comparison and a compact labeled list
  for status or priority.
- For branches, put each condition beside its edge and mark `AND` or `OR` where
  that distinction matters.
- For shared nodes, diamonds, and cycles, use a graph or grouped explicit edge
  rows. Reuse the same node or alias, and connect every member directly to a
  shared hub.
- Assume 80 display columns unless the user gives a width. Draw horizontally
  only when all labels and edges remain readable. Otherwise use a vertical
  layout or short aliases plus a legend containing every full name. Never
  truncate a name or label.

Render ASCII in a fenced code block. Keep every relationship label or condition
adjacent to its actual edge, with the source's relation name and direction.
Coordinated panels may form one primary visual when one layout cannot stay
clear; do not merge connectors in a way that makes their endpoints ambiguous.

Useful compact patterns:

```text
[Route] selects one branch (OR):
  |-- if cached --> [Cache]
  `-- otherwise --> [Origin]

[Deploy] -- requires (AND) --> [Tests pass]
[Deploy] -- requires (AND) --> [Approval]

[Writer] -- writes --> [Store]
[Reader] -- reads ---> [Store]
```

Work silently and show only the verified final visual, never a discarded draft.
Before answering, read the actual diagram back edge by edge and compare it with
the extracted facts. Fix every omitted or invented edge, reversed direction,
detached condition, lost `AND`/`OR`, and ambiguous or duplicated identity before
answering. Check nearby prose against the same facts, especially `only`, `all`,
`none`, and `cannot`.

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
