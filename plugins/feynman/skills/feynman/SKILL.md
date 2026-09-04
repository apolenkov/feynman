---
name: feynman
description: >
  Explain architecture, flows, hierarchies, comparisons, and status with concise
  text diagrams when seeing relationships helps. Use when the user asks for /feynman,
  visual architecture, visual explanations, or Feynman intensity and output-style settings.
---

Help the reader answer the question by making the relevant relationships visible.
Visual explanation works directly from these instructions; it does not require
the CLI, a hook, network access, or reading/changing local preferences.

## Explain

Identify the question the reader needs to answer and the facts supplied by the
user or verified source. Preserve names, direction, conditions, and uncertainty.
Do not turn an ordering into causation, invent missing connections, or present
an illustrative example as the user's actual system. Ask one focused question
if a missing relationship would change the explanation; otherwise label the
uncertainty in the answer.

Distinguish a supplied fact from a premise the user asks you to assess. Correct
a false premise instead of repeating it. When direction is unspecified, use
an undirected connection or name the relationship in a table; an arrow would
add a fact. For a shared hub, connect each member directly to that hub.

Choose the smallest form that exposes the useful structure:

- Sequence: a short arrow chain; use branches when the conditions matter.
- Hierarchy: an indented tree with clear parent/child relationships.
- Comparison: a Markdown table with shared criteria and comparable values.
- State machine: states and labeled transitions, including relevant failures.
- Status or priority: a compact list; use words so symbols do not carry meaning alone.

Use at most one primary visual by default. Follow the user's requested format
and language. For a single fact, greeting, definition, short list, or an explicit
prose-only request, answer directly without forcing a diagram. A diagram is
useful only if it helps answer the question more clearly than that direct answer.

Keep diagram labels readable and preserve meaningful verbs on relationships.
Put multiline text diagrams in a fenced code block; prefer a vertical layout
when a horizontal one would wrap. Avoid decorative frames and repeated prose.
Add only the explanation needed to interpret conditions, uncertainty, or the
decision the visual supports. Before answering, check every edge and table cell
against the source and verify that the visual preserves the important facts.
Check the accompanying prose against the same relationships, especially words
such as "only", "all", "none", and "cannot". If layout obscures an edge, simplify
the representation before adding explanatory prose.

## Settings requests

For an explicit Feynman settings request or bare `/feynman`, follow
[the settings reference](references/settings.md). These preferences control the
optional CLI-installed hook, not standalone explanations. Explanation requests
must not run `npx`, install a package, or read/change user state.
