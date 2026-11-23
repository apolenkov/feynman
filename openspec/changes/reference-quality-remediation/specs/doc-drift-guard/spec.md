## ADDED Requirements

### Requirement: Report incomplete drift inspection

The drift check SHALL fail and identify the tracked live path if an unexpected read error prevents inspection. It SHALL keep document contents out of the error.

#### Scenario: A live tracked file cannot be read

- **WHEN** a tracked live path yields an I/O error during the drift sweep
- **THEN** the command returns a nonzero status and names the affected path

#### Scenario: A document was removed from the working tree

- **WHEN** an otherwise clean sweep encounters an intentionally removed file
- **THEN** the existing removal policy continues to apply
