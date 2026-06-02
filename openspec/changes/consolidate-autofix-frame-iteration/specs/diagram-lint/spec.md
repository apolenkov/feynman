## ADDED Requirements

### Requirement: autofix and the linter share one frame definition

The autofixer SHALL detect `┌─…─┐` frames using the same canonical frame
definition as the lint rules (the `nextFrame` helper), so that `--fix` aligns
exactly the frames the linter (L08/L11/L12/L15) recognises. A frame the linter
treats as a frame SHALL be a frame to autofix, and vice versa.

A frame's inner rows for this purpose are the fully-bordered `│ … │` lines
between the opening `┌─…─┐` row and the matching closing `└─…─┘` row at the same
indent; the closer is the first such row found scanning forward, even when
non-inner lines (a blank line or stray prose) appear between.

#### Scenario: frame with a non-bordered inner line is still aligned

- **WHEN** a `┌─…─┐` frame contains an inner line that is not a `│ … │` row (for
  example a blank line) before its closing `└─…─┘` row
- **THEN** autofix treats the block as one frame, finds the closer past that
  line, and aligns the frame's `│ … │` inner rows to the opening row's width

#### Scenario: a row missing its right border is not an inner row

- **WHEN** a `┌─…─┐` frame contains a line that starts with `│` but has no
  closing `│` (a runaway row)
- **THEN** autofix does not treat that line as an inner row, matching what the
  linter's frame detection does for the same input

#### Scenario: well-formed frame output is unchanged

- **WHEN** autofix runs on a frame whose inner lines are all well-formed
  `│ … │` rows
- **THEN** the aligned output is identical to the pre-consolidation output
