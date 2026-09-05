# diagram-rules Specification

## Purpose
Define how feynman turns supplied relationships into a clear, source-faithful
ASCII diagram while preserving direct prose for requests that do not benefit
from a visual.

## Requirements

### Requirement: Intensity tiers select monotone rule sets

The system SHALL define `lite`, `full`, and `ultra` Intensity tiers and SHALL
inject only the active tier. `full` SHALL be the default. Each higher tier SHALL
contain every Trigger in the tier below it and MAY add Triggers or lower a
Trigger threshold. Every tier SHALL include the extraction, layout, rendering,
and read-back workflow.

#### Scenario: Default Intensity

- **WHEN** rules are injected and no Intensity has been chosen
- **THEN** the `full` rule block is injected

#### Scenario: Higher tiers preserve lower-tier coverage

- **WHEN** the Trigger tables are compared from `lite` through `ultra`
- **THEN** each higher tier supports all Structures supported below it

### Requirement: Scope and supplied relationships are extracted before drawing

The Contract SHALL identify the question and scope, then extract every supplied
entity and typed relationship in that scope, including direction or lack of
direction, conditions, negation, uncertainty, and `AND` / `OR` branch semantics.
It SHALL distinguish sequence from causation and SHALL NOT guess a direction,
mechanism, value, or connection.

#### Scenario: Whole-text transformation is complete

- **WHEN** the user asks to transform a supplied text into a diagram
- **THEN** every fact and relationship in the requested scope is represented

#### Scenario: Focused answer narrows explicitly

- **WHEN** only a subset of the supplied material answers a focused question
- **THEN** the response may diagram that subset and states the narrower scope

#### Scenario: Unknown direction stays unknown

- **WHEN** the source names a relationship but gives no direction
- **THEN** the diagram uses an undirected connection or an explicit relationship row without adding an arrow

### Requirement: Layout follows topology and display width

The Contract SHALL select a layout from graph topology and the user's display
width, defaulting to 80 columns. It SHALL use a tree only for a real hierarchy.
Shared nodes, diamonds, cycles, and hubs SHALL use a graph or grouped explicit
edge rows that preserve node identity; each member SHALL connect directly to a
shared hub. Long names SHALL use a vertical layout or aliases with a full-name
legend and SHALL NOT be truncated.

#### Scenario: Node count does not force a horizontal chain

- **WHEN** a short set of nodes branches or has labeled edges that do not fit clearly
- **THEN** the Contract chooses a topology-preserving vertical or explicit-edge layout

#### Scenario: Shared target keeps one identity

- **WHEN** two actors have distinct relationships with the same target
- **THEN** both edges connect to the same target node or alias with their own labels and directions

### Requirement: Edge meaning remains adjacent and unambiguous

Each label and condition SHALL be adjacent to its actual edge and preserve the
source relation name and direction. `AND` and `OR` SHALL remain explicit when
they affect branch meaning. One Primary Visual MAY contain coordinated panels,
but connectors SHALL NOT be merged when their endpoints would become ambiguous.

#### Scenario: Conditional alternatives remain distinct

- **WHEN** two outgoing edges apply under different conditions
- **THEN** each condition is shown beside its edge and their `AND` or `OR` semantics remain visible

### Requirement: Rendered output is read back against the source

Before answering, the Contract SHALL require reading the actual diagram edge by
edge and repairing omitted or invented edges, wrong directions or conditions,
lost branch semantics, and ambiguous or duplicated identities.

#### Scenario: Read-back finds an omitted edge

- **WHEN** an extracted source relationship is absent from the rendered diagram
- **THEN** the diagram is corrected before it is returned

### Requirement: Explicit diagram requests take precedence

An explicit ASCII-diagram request SHALL override automatic suppression and
`output_style` visual-form limits. Explicit prose-only requests SHALL override
defaults; if explicit format instructions conflict, the user's latest
instruction SHALL win. Without an explicit diagram request, greetings, simple
definitions, recommendations, single facts, simple lists, and question-backs
SHALL remain prose. False premises SHALL be corrected. A request for one
question SHALL produce exactly one independently answerable question.

#### Scenario: Short style still honors an explicit diagram request

- **WHEN** `output_style` is `short` and the user explicitly requests an ASCII diagram
- **THEN** an accurate diagram remains allowed while commentary stays minimal

#### Scenario: Simple definition stays prose by default

- **WHEN** the user asks for a simple definition without requesting a diagram
- **THEN** the response stays prose
