## MODIFIED Requirements

### Requirement: failed writes preserve user files

Settings and state SHALL be written through a staged file and atomic rename.
A write, flush or rename failure SHALL leave the previous destination intact.
Corrupt state SHALL be backed up before replacement; backup failure SHALL stop
recovery without overwriting the original bytes.

#### Scenario: Staging or replacing a settings or state file fails

- **WHEN** writing or flushing the staged file, or renaming it over a user's
  settings or state file, fails
- **THEN** the previous destination bytes remain intact

#### Scenario: Corrupt state cannot be backed up

- **WHEN** recovery reads corrupt state and fails to back it up
- **THEN** recovery stops and the original bytes are preserved
