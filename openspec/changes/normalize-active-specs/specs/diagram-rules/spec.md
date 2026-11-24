## MODIFIED Requirements

### Requirement: Explicit diagram requests take precedence

Explicit ASCII-diagram requests SHALL override automatic suppression and
`output_style` visual-form limits. Explicit prose-only requests SHALL override
defaults. When explicit formats conflict, the latest instruction SHALL win.
Without an explicit diagram request, greetings, simple definitions,
recommendations, single facts, simple lists and question-backs SHALL stay
prose. False premises SHALL be corrected. One requested question SHALL yield
exactly one independently answerable question.

#### Scenario: Short style still honors an explicit diagram request

- **WHEN** `output_style` is `short` and the user explicitly requests an ASCII diagram
- **THEN** an accurate diagram remains allowed while commentary stays minimal

#### Scenario: Simple definition stays prose by default

- **WHEN** the user asks for a simple definition without requesting a diagram
- **THEN** the response stays prose

#### Scenario: The user changes format

- **WHEN** the user requests an ASCII diagram and then asks for prose only
- **THEN** the response follows the latest format instruction

#### Scenario: One clarification is requested

- **WHEN** the user asks for one question to clarify an erroneous premise
- **THEN** the response corrects the false premise and asks exactly one
  independently answerable question
