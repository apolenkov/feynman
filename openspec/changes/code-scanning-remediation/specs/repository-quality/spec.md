## ADDED Requirements

### Requirement: Reproducible workflow tool installation

CI and release workflows SHALL install their npm-distributed tools from integrity-locked dependencies.

#### Scenario: Release rehearsal and publication

- **WHEN** the release workflow installs dependencies and builds or publishes a package
- **THEN** it uses the locked npm version and runs native tests with the locked Codex CLI
