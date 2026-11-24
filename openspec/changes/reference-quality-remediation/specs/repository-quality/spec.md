## ADDED Requirements

### Requirement: Review growth of implementation units

The project SHALL review implementation modules above 300 significant lines and functions above 50 significant lines. A retained exception SHALL identify the rule, path, symbol, reason, stable fingerprint and verification that protects its behavior. A reduction elsewhere SHALL NOT offset a new exception.

#### Scenario: A change introduces a long function

- **WHEN** a production or automation function exceeds the review threshold for the first time
- **THEN** the change must either separate cohesive responsibilities with characterization tests or document a specific reviewed exception

#### Scenario: An existing exception changes identity

- **WHEN** a reviewed exception disappears and another symbol crosses the same threshold
- **THEN** the new symbol requires its own review even if the total violation count stays constant
