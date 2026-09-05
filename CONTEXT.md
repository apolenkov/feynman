# feynman domain language

feynman helps readers understand supplied information through accurate,
compact visual explanations.

## Canonical terms

**Structure** — a recognizable shape in content: sequence, hierarchy,
comparison, status, or state machine.

**Trigger** — the mapping from a Structure to a Visual. It describes when a
visual form is useful, not the content itself.

**Relationship** — a supplied connection between identified entities, including
its meaning, direction or uncertainty, conditions, and qualifiers. Order,
causation, joint prerequisites, and alternatives are different relationships.

**Scope** — the part of the supplied information the reader asks to understand.
A whole-text transformation includes every fact within that scope; a focused
explanation can identify a smaller scope.

**Contract** — the instructions for preserving Relationships, classifying
Structure, and selecting or suppressing a Visual. Explicit format requests
take precedence over automatic visual preferences. Definitions, greetings,
recommendations, and question-backs ordinarily remain prose.

**Visual** — the rendered form selected for a Structure: flow, tree, table,
status marker, or frame. The smallest-sufficient ladder is:
`prose < glyph < dot-leader < tree < table < frame`.

**Primary Visual** — the one Visual that carries a response's main Structure.
At most one is used by default; coordinated panels may form a single Visual
when they preserve clear entity identities and relationships.

**Annotation** — a marker that decorates content without carrying its main
Structure, such as `▲▼`, `✓✗`, or a bold key. Annotations may accompany a
Primary Visual.

**Intensity** — the breadth of automatic visual selection: `lite`, `full`, or `ultra`.
`full` is the default.

**Lint rule** — an L-numbered diagnostic applied after a Visual is rendered.
It checks layout and economy; it is distinct from the assistant-facing
Triggers in the Contract.
