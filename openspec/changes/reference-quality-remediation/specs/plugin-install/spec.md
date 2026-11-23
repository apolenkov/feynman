## ADDED Requirements

### Requirement: Preserve preferences on a read failure

State reconciliation SHALL distinguish an unavailable preference file from successfully read malformed data. An unexpected read error SHALL preserve the preferences, existing backup and active flag.

#### Scenario: A disabled preference file temporarily cannot be read

- **WHEN** SessionStart cannot read a valid disabled state due to an I/O failure
- **THEN** it emits no instruction block and leaves the preference, backup and flag bytes intact

#### Scenario: Invalid JSON was successfully read

- **WHEN** the preference file is readable but contains invalid JSON
- **THEN** the existing backup-before-recovery contract applies
