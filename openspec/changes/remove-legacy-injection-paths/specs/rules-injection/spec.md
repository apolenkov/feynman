## ADDED Requirements

### Requirement: the injection hook appends the output_style suffix

The SessionStart hook SHALL append the suffix string mapped to the active `output_style` (from the `OUTPUT_STYLE_SUFFIX` map) to the rules text before writing stdout. The default style `full`, any unmapped style, and any non-string value map to no suffix.

#### Scenario: Non-default style appends a suffix

- **WHEN** the hook injects rules and an `output_style` with a mapped suffix is active
- **THEN** the suffix is appended to the rules text

#### Scenario: Default or invalid style appends no suffix

- **WHEN** the active `output_style` is `full`, unmapped, or not a string
- **THEN** no suffix is appended to the injected rules

### Requirement: the injection hook writes plain text to stdout

The SessionStart hook SHALL write the extracted rules text directly to stdout with no wrapping and no trailing newline.

#### Scenario: Plain-text output

- **WHEN** the hook injects rules successfully
- **THEN** stdout is the raw rules text with no JSON wrapper

#### Scenario: No trailing newline

- **WHEN** the hook writes its output to stdout
- **THEN** the last byte written is the last character of the content, not a newline

## MODIFIED Requirements

### Requirement: the rule block matching the active Intensity is injected

The SessionStart hook SHALL read the rules file and extract the block whose `<intensity name="...">` tag matches the active Intensity. If the `<intensity>` tags are unbalanced the hook SHALL inject nothing. If the matched block is empty after trimming, the hook SHALL inject nothing. The rules file is XML-only — there is no HTML-comment fallback.

#### Scenario: XML format — correct Intensity block extracted

- **WHEN** the rules file contains `<intensity name="lite">…</intensity>` and the active Intensity is `lite`
- **THEN** the content inside that tag (trimmed) is injected

#### Scenario: No XML intensity tags — nothing injected

- **WHEN** the rules file has no `<intensity name="...">` tags
- **THEN** the hook exits 0 and injects nothing

#### Scenario: Unbalanced intensity tags

- **WHEN** the rules file has mismatched `<intensity>` open/close counts
- **THEN** the hook exits 0 and injects nothing

#### Scenario: Empty matched block

- **WHEN** the extracted block for the active Intensity is empty after trimming
- **THEN** the hook exits 0 and injects nothing

## REMOVED Requirements

### Requirement: UserPromptSubmit degrades to a fallback on malformed rules and records it in state

**Reason**: The UserPromptSubmit hook (`hooks/feynman-activate.ts`) is deleted; no live install path registered it. `MALFORMED_FALLBACK` and the `malformed_rules` state field existed only on this path and are removed with it.
**Migration**: None. On the SessionStart path, unbalanced `<intensity>` tags inject nothing — see "the rule block matching the active Intensity is injected".

### Requirement: UserPromptSubmit appends an output_style suffix to the injected rules

**Reason**: The UserPromptSubmit path is deleted, and this requirement's "The SessionStart path SHALL NOT append any suffix" clause contradicted the actual SessionStart behavior (A04 / `applyOutputStyle`). Replaced by a SessionStart-scoped requirement.
**Migration**: See ADDED "the injection hook appends the output_style suffix".

### Requirement: SessionStart outputs plain text; UserPromptSubmit outputs a JSON wrapper

**Reason**: The UserPromptSubmit JSON-wrapper output path is deleted; only the SessionStart plain-text output remains.
**Migration**: See ADDED "the injection hook writes plain text to stdout".
