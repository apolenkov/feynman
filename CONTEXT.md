# feynman domain language

feynman is a Codex plugin that injects a compact Contract at session start.
The Contract helps Codex make structured answers visible without turning plain
prose into decoration.

## Canonical terms

**Structure** — a recognizable shape in content: sequence, hierarchy,
comparison, status, or state machine.

**Trigger** — the mapping from a Structure to a Visual. It describes when a
visual form is useful, not the content itself.

**Contract** — the injected instruction that classifies Structure, applies the
Trigger table, and either selects, amplifies, or suppresses a Visual.
Suppression wins; definitions, greetings, recommendations, and question-backs
remain prose.

**Visual** — the rendered form selected for a Structure: flow, tree, table,
status marker, or frame. The smallest-sufficient ladder is:
`prose < glyph < dot-leader < tree < table < frame`.

**Primary Visual** — the one Visual that carries a response's main Structure.
At most one is used per response.

**Annotation** — a marker that decorates content without carrying its main
Structure, such as `▲▼`, `✓✗`, or a bold key. Annotations may accompany a
Primary Visual.

**Intensity** — the size of the injected Contract: `lite`, `full`, or `ultra`.
`full` is the default.

**Lint rule** — an L-numbered diagnostic applied after a Visual is rendered.
It checks layout and economy; it is distinct from the assistant-facing
Triggers in the Contract.
