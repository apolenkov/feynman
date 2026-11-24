## MODIFIED Requirements

### Requirement: Accurate ASCII explanations

Whole-text transformations SHALL render all in-scope facts with zero inventions
or changes. Relationships SHALL preserve identities, type, direction or its
uncertainty, conditions, negation, and AND/OR prerequisites. The graph SHALL keep
shared nodes and return edges. Width SHALL be checked against the supplied
budget in display columns.

New failures SHALL be retained and addressed with source changes;
criteria SHALL NOT be relaxed after seeing outputs to obtain a pass.

#### Scenario: Independent output reconstruction

- **GIVEN** source texts, atomic facts and reader questions frozen before generation
- **WHEN** the native skill and actual installed hook produce the diagrams
- **THEN** an independent reviewer reconstructs each diagram without the source
- **AND** the reconstructed facts are compared with the complete frozen fact set
- **AND** ambiguous connectors and unsupported prose are treated as defects
- **AND** corrupted control diagrams demonstrate the review can detect semantic errors.

#### Scenario: User intent and settings

- **WHEN** the user explicitly requests an ASCII diagram
- **THEN** intensity and output style do not suppress that requested diagram
- **AND** the requested width is respected without removing facts
- **AND** ordinary prose-only and applicable suppression requests remain diagram-free.

#### Scenario: A new failure occurs during an authorized protocol run

- **WHEN** an authorized run under the linked ASCII transformation protocol
  finds a new failure
- **THEN** the failure is retained and addressed with source changes
- **AND** the criteria are not relaxed after seeing outputs to obtain a pass

The complete task counts, delivery evidence, negative controls and reporting
rules live in the linked protocol. This measures correctness and structural
answerability on the frozen tasks, not human reading speed or universal model
reliability.
