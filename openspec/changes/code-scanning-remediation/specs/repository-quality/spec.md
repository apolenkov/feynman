## ADDED Requirements

### Requirement: Reproducible workflow tool installation

CI and release workflows SHALL install their npm-distributed tools from integrity-locked dependencies.

#### Scenario: Release rehearsal and publication

- **WHEN** the release workflow installs dependencies and builds or publishes a package
- **THEN** it uses the locked npm version and runs native tests with the locked Codex CLI

### Requirement: Preserve diagram behavior with linear token matching

The parser, linter and autofixer SHALL preserve diagram recognition, issue details and corrected text. Bracket label and flow arrow matching SHALL take linear time in the input length.

#### Scenario: Mixed and unfinished labels

- **WHEN** a diagram contains nested openings, empty labels, multiple arrows or an unfinished label
- **THEN** the parser, linter and autofixer produce the same results as before remediation

#### Scenario: Long unfinished label

- **WHEN** a generic or Mermaid fence contains 100,000 consecutive opening brackets
- **THEN** parsing, linting and autofixing complete within the regression time budget

### Requirement: Inspect and read files through the opened descriptor

Repository maintenance tools SHALL inspect metadata and read content through the same descriptor. Size-limited readers SHALL enforce their byte limit even when the source grows.

#### Scenario: Source snapshot

- **WHEN** the reproducibility check hashes a regular source file
- **THEN** its mode and contents come from the same opened file

#### Scenario: Source exceeds its read limit

- **WHEN** a factory input exceeds its limit at open time or during reading
- **THEN** the reader refuses the input and closes the descriptor
