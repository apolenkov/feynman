# rules-injection Specification

## Purpose
TBD - created by archiving change add-rules-injection-spec. Update Purpose after archive.
## Requirements
### Requirement: session_id path-traversal guard runs before any file access

The hook SHALL reject any session_id value that contains a path separator (`/`, `\`) or a
`..` sequence by calling `process.exit(0)` before reading the flag file or state.json.
A session_id that is absent or empty SHALL pass the guard without error.

#### Scenario: Malicious session_id with path separator

- **WHEN** the SessionStart hook receives a session_id containing `/` or `\`
- **THEN** the hook exits 0 and injects nothing

#### Scenario: Malicious session_id with directory traversal

- **WHEN** the SessionStart hook receives a session_id containing `..`
- **THEN** the hook exits 0 and injects nothing

#### Scenario: Empty session_id passes the guard

- **WHEN** the SessionStart hook receives an empty or absent session_id
- **THEN** the guard does not trigger and the hook continues to the flag-file check

### Requirement: flag-file check gates injection and is written on first activation

The hook SHALL check for the flag file at `$CLIENT_HOME/.feynman-active` after the path-traversal
guard passes. If the flag file does not exist and `state.json` does not exist, the hook SHALL write
a default `state.json` (enabled `true`, Intensity `full`) and then write the flag file before
injecting rules. If the flag file does not exist and `state.json` exists with `enabled` set to
`false`, the hook SHALL exit 0 and inject nothing without writing the flag file.

#### Scenario: First install — neither flag nor state exists

- **WHEN** neither the flag file nor `state.json` exists at hook run time
- **THEN** the hook writes a default `state.json` and flag file, then injects the `full` rule block

#### Scenario: Flag absent, state disabled

- **WHEN** the flag file is absent and `state.json` has `enabled: false`
- **THEN** the hook exits 0 and injects nothing

#### Scenario: Flag present — normal run

- **WHEN** the flag file already exists
- **THEN** the hook skips first-activation bootstrap and proceeds to read state.json

### Requirement: SessionStart removes the flag file when disabled or state is corrupt

The SessionStart hook SHALL delete the flag file at `$CLIENT_HOME/.feynman-active` when `state.json`
fails to parse, and when `state.json` has `enabled: false`. This keeps the flag absent while feynman
is disabled, so the next run re-evaluates activation from a clean state. The deletion SHALL be
best-effort and tolerate a missing flag file.

#### Scenario: Corrupt state removes the flag

- **WHEN** the SessionStart hook reads a `state.json` that is not valid JSON
- **THEN** the hook removes the flag file (if present) and exits 0 without injecting

#### Scenario: Disabled state removes the flag

- **WHEN** the SessionStart hook reads `state.json` with `enabled: false`
- **THEN** the hook removes the flag file (if present) and exits 0 without injecting

### Requirement: state.json is read to obtain the enabled flag and Intensity

The hook SHALL read `state.json` from `$CLIENT_HOME/.feynman/state.json` to determine the `enabled`
flag and the `intensity` field. If `state.json` is missing or unparseable, the hook SHALL exit 0
and inject nothing (fail-safe). If `enabled` is `false`, the hook SHALL exit 0 and inject nothing.
An unknown or absent `intensity` value SHALL be treated as `full`.

#### Scenario: Corrupt state.json

- **WHEN** `state.json` exists but is not valid JSON
- **THEN** the hook exits 0 and injects nothing

#### Scenario: Disabled in state.json

- **WHEN** `state.json` has `enabled: false`
- **THEN** the hook exits 0 and injects nothing

#### Scenario: Unknown intensity falls back to full

- **WHEN** `state.json` has an `intensity` value not in `["lite", "full", "ultra"]`
- **THEN** the hook treats the Intensity as `full` and injects the `full` rule block

### Requirement: the rule block matching the active Intensity is injected

The hook SHALL read the rules file and extract the block whose `<intensity name="...">` tag matches
the active Intensity. If the XML tags are unbalanced the hook SHALL inject nothing (SessionStart)
or a short fallback string (UserPromptSubmit legacy path). If the matched block is empty after
trimming, the hook SHALL inject nothing.

#### Scenario: XML format — correct Intensity block extracted

- **WHEN** the rules file contains `<intensity name="lite">…</intensity>` and the active Intensity is `lite`
- **THEN** the content inside that tag (trimmed) is injected

#### Scenario: Legacy HTML-comment fallback

- **WHEN** the rules file has no XML `<intensity>` tags but has `<!-- full -->…<!-- /full -->` markers
- **THEN** the content between the markers (trimmed) is injected

#### Scenario: Unbalanced intensity tags — SessionStart path

- **WHEN** the rules file has mismatched `<intensity>` open/close counts and the hook is SessionStart
- **THEN** the hook exits 0 and injects nothing

#### Scenario: Empty matched block

- **WHEN** the extracted block for the active Intensity is empty after trimming
- **THEN** the hook exits 0 and injects nothing

### Requirement: UserPromptSubmit degrades to a fallback on malformed rules and records it in state

On the UserPromptSubmit path, when the rules file has unbalanced `<intensity>` tags, the hook SHALL
inject the `MALFORMED_FALLBACK` string, set `malformed_rules: true` in `state.json`, and exit 0. On a
later run where the tags parse correctly, the hook SHALL clear the `malformed_rules` field from state.
This is the UserPromptSubmit-specific divergence from the SessionStart path, which injects nothing on
the same condition.

#### Scenario: Unbalanced tags — UserPromptSubmit path

- **WHEN** the rules file has mismatched `<intensity>` open/close counts and the hook is UserPromptSubmit
- **THEN** the hook injects the `MALFORMED_FALLBACK` string, sets `malformed_rules: true` in state, and exits 0

#### Scenario: Recovery clears the malformed flag

- **WHEN** a later UserPromptSubmit run parses the `<intensity>` tags successfully and `malformed_rules` was set
- **THEN** the hook removes the `malformed_rules` field from state

### Requirement: UserPromptSubmit appends an output_style suffix to the injected rules

On the UserPromptSubmit path, the hook SHALL append the suffix string mapped to the active
`output_style` (from the `OUTPUT_STYLE_SUFFIX` map) to the rules text before writing stdout. The
default style `full` maps to no suffix. The SessionStart path SHALL NOT append any suffix.

#### Scenario: Non-default style appends a suffix

- **WHEN** the UserPromptSubmit hook injects rules and an `output_style` with a mapped suffix is active
- **THEN** the suffix is appended to the rules text inside `additionalContext`

#### Scenario: Default style appends no suffix

- **WHEN** the active `output_style` is `full` (or has no mapped suffix)
- **THEN** no suffix is appended to the injected rules

### Requirement: SessionStart outputs plain text; UserPromptSubmit outputs a JSON wrapper

The SessionStart hook SHALL write the extracted rules text directly to stdout with no wrapping and
no trailing newline. The legacy UserPromptSubmit hook SHALL wrap the rules text in a JSON object
`{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"<rules>"}}` and
write it to stdout with no trailing newline.

#### Scenario: SessionStart plain-text output

- **WHEN** the SessionStart hook injects rules successfully
- **THEN** stdout is the raw rules text (no JSON wrapper, no trailing newline)

#### Scenario: UserPromptSubmit JSON output

- **WHEN** the UserPromptSubmit hook injects rules successfully
- **THEN** stdout is a JSON object with `hookSpecificOutput.additionalContext` set to the rules text

#### Scenario: No trailing newline on either path

- **WHEN** either hook writes its output to stdout
- **THEN** the last byte written is the last character of the content, not a newline character

