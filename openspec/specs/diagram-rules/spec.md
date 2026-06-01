# diagram-rules Specification

## Purpose
TBD - created by archiving change establish-feynman-openspec-baseline. Update Purpose after archive.
## Requirements
### Requirement: Intensity tiers select the injected rule set

The system SHALL define three Intensity tiers — `lite`, `full`, and `ultra` — and SHALL inject the
rule block matching the active Intensity. `full` SHALL be the default when no Intensity is set. A
higher tier SHALL expose at least as many Triggers as the tier below it.

#### Scenario: Default Intensity

- **WHEN** rules are injected and no Intensity has been chosen
- **THEN** the `full` rule block is injected

#### Scenario: Explicit Intensity selects its block

- **WHEN** the active Intensity is `lite`
- **THEN** the `lite` rule block is injected and the `full` / `ultra` blocks are not

### Requirement: Structure is classified, then channelled, amplified, or suppressed

The injected Contract SHALL instruct the assistant to classify a response's Structure against the
Trigger table and then either channel it into the mapped Visual, amplify it, or suppress it. Content
shapes that read as prose — definition, recommendation, greeting, question-back — SHALL be
suppressed (left as prose), not drawn.

#### Scenario: A structured shape is channelled

- **WHEN** a response's content is a sequence (e.g. a pipeline of steps)
- **THEN** it is drawn as the mapped Visual (arrow flow) per the Trigger table

#### Scenario: A prose shape is suppressed

- **WHEN** a response is a definition, recommendation, greeting, or question-back
- **THEN** no Visual is drawn and the response stays prose

### Requirement: At most one primary Visual, drawn at the smallest sufficient form

The Contract SHALL enforce a mutex of at most one primary Visual per response, and SHALL prefer the
smallest sufficient form along the ladder `prose < glyph < dot-leader < tree < table < frame`.

#### Scenario: Mutex on primary Visual

- **WHEN** a response contains more than one structured shape
- **THEN** at most one primary Visual is drawn

#### Scenario: Smallest sufficient form

- **WHEN** a status list of five items and a full table would both convey the content
- **THEN** the smaller form (dot-leader list) is chosen over the table

