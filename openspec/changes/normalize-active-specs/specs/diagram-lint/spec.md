## MODIFIED Requirements

### Requirement: L01 — box corners close at the same column

The linter SHALL report an error (L01) for any `┌` or `┐` without a matching
`└` or `┘`, respectively, below it at the same display column, or for either
bottom corner without the corresponding top corner above at the same display
column. Matching SHALL use the width model shared with L08 and L09. L01 SHALL
report one-based UTF-16 source offsets, including escape bytes. L09 SHALL report
display columns.

#### Scenario: unclosed top-left corner

- **WHEN** a Visual contains `┌` at column 5 but no `└` appears at column 5 on any later line
- **THEN** L01 reports an error pointing at the `┌` line

#### Scenario: orphan bottom corner

- **WHEN** a Visual contains `└` at column 5 but no `┌` appears at column 5 on any earlier line
- **THEN** L01 reports an error pointing at the `└` line

#### Scenario: Display width and source offsets differ

- **WHEN** L01 checks a line with ANSI escapes, supported zero-width marks or
  wide characters
- **THEN** it matches corners using the same width approximation as L08 and L09,
  removing ANSI escapes and accounting for the supported zero-width marks and
  wide-character ranges
- **AND** L01 retains its historical UTF-16 source offsets for editor consumers
- **AND** the width model approximates by code point without implementing
  complete grapheme clusters or a terminal emulator

---

### Requirement: L05 — flow boxes on the same line require a connection between them

The linter SHALL report an error (L05) unless the full region between consecutive
`[box]` tokens on one line is one recognized connection or a parallel layout gap
of at least three spaces, with or without a separate `+-->` branch connector
after the gap. L05 SHALL accept bare arrows, undirected runs of at least two
dashes, and bounded labels. It SHALL validate syntax without inferring direction
from a label or an edge across the gap to a separate branch.

#### Scenario: two boxes connected by an arrow

- **WHEN** a line reads `[A] --> [B]`
- **THEN** L05 does not report any issue

#### Scenario: two boxes connected by a labeled undirected edge

- **WHEN** a line reads `[Auth] -- shares bus -- [Bus]`
- **THEN** L05 does not report any issue

#### Scenario: a labeled numeric condition

- **WHEN** a line reads `[Gate] -- load > 8 --> [Scale]`
- **THEN** L05 treats the full bounded label as one directed connection

#### Scenario: an arrow-like substring in prose

- **WHEN** consecutive boxes have the intervening text `label mentions -> symbol`
- **THEN** L05 reports an error because the entire region is not a connection

#### Scenario: conflicting arrows

- **WHEN** consecutive boxes have the intervening text `-> <-`
- **THEN** L05 reports an error because the region contains more than one connection

#### Scenario: two boxes with no connection

- **WHEN** boxes named A and B have fewer than three spaces and no connector between them
- **THEN** L05 reports an error listing both box tokens

#### Scenario: parallel layout columns

- **WHEN** a line reads `[A]   [B]` (three or more spaces between them)
- **THEN** L05 treats them as a parallel layout and does not report any issue

#### Scenario: parallel columns have separate branch connectors

- **WHEN** a line reads `[Adopt]    +--> [Re-open path]`
- **THEN** L05 emits no diagnostic and treats `+-->` as the next column's branch without inferring an edge from Adopt

#### Scenario: Bare arrow forms

- **WHEN** the whole connection between consecutive boxes is `->`, `<-`,
  `-->`, `<--`, `<->`, `<-->`, `→`, `←`, `↔`, `─→`, `──>`, `->>` or `-->>`
- **THEN** L05 accepts it as one connection

#### Scenario: Bounded label forms

- **WHEN** a compact or spaced label is bounded by at least two dashes on each
  side, in forward (`--request-->`), reverse (`<--response--`), bidirectional
  (`<--sync-->`) or undirected (`--shares--`) form
- **THEN** L05 accepts each as one connection, including longer bounding dash
  runs and numeric comparisons such as `-- load > 8 -->`

#### Scenario: Embedded arrows and extra text

- **WHEN** the region contains an arrow token inside a label, an arrow-like
  substring within prose, multiple conflicting arrows or text outside a connector
- **THEN** L05 does not count the region as a connection

---

### Requirement: L11, L12, L13, and L15 — frame-economy rules flag wasteful framing

The linter SHALL warn about short frames without a nested tree or embedded table
column (L11), frames with more padding than content (L12), framed trees (L13),
and frames with at least two homogeneous inner lines and no structural features
(L15). Nested trees SHALL exempt a frame from L11 and L12. Status-marker frames
SHALL be exempt from L15 and considered under L11.

#### Scenario: five-item list in a frame (L11)

- **WHEN** a frame contains exactly 5 inner rows of plain text with no tree or table columns
- **THEN** L11 reports a warning estimating character savings of the dot-leader alternative

#### Scenario: padding-dominated frame (L12)

- **WHEN** a frame's padding_chars value exceeds its content_chars value
- **THEN** L12 reports a warning suggesting a lighter Visual

#### Scenario: tree inside a frame (L13)

- **WHEN** a frame contains `├──` or `└──` tree characters in its inner rows
- **THEN** L13 reports a warning to drop the frame borders

#### Scenario: homogeneous bullet frame (L15)

- **WHEN** a frame contains 3 inner rows that each start with `- ` (bullet items), no arrows,
  and no tree characters
- **THEN** L15 reports a warning suggesting plain format

#### Scenario: tree-framed block is exempt from L11/L12

- **WHEN** a frame contains `├──` tree characters
- **THEN** L11 and L12 do not report any issue on that frame

#### Scenario: Short frame alternatives and table columns

- **WHEN** a frame has one to five inner rows, no nested tree (`├──` or `└──`)
  and fewer than three `│` characters on every row
- **THEN** L11 reports a warning. The Trigger table prescribes a dot-leader
  Visual for lists of at most five items, where a full frame can spend roughly
  half its characters on borders and padding

#### Scenario: Padding costs and redundant tree borders

- **WHEN** a maintainer inspects a padding-dominated frame using `--explain`
- **THEN** the CLI exposes the full cost breakdown
- **AND** a frame around a tree does not add hierarchy beyond the tree's
  indentation, which is why L13 warns about those borders

#### Scenario: Homogeneous frame types and exemptions

- **WHEN** two or more inner lines are all bullet items, all `key: value`
  pairs or all plain prose, with no arrows, nested trees, embedded table
  columns or status-marker lines
- **THEN** L15 reports a warning
- **AND** a frame with lines ending in `← готов`, `✓` or `✗` is exempt from
  L15 and considered under L11

---

### Requirement: CLI accepts a file path or stdin and emits gcc-format or JSON output

`feynman-lint` SHALL accept one Markdown path or `-` for stdin, and report in
gcc-compatible format by default or as a JSON object with `--json`. Exit status
SHALL be 0 without errors, 1 for errors (any issue with `--strict`), or 2 for
usage errors. `--fix` SHALL apply autofix in-place and requires a file path.
`--explain` SHALL annotate each frame with its token-cost breakdown without
modifying the input.

#### Scenario: default gcc output

- **WHEN** `feynman-lint file.md` is run and the file has one L01 error
- **THEN** the CLI writes a gcc-format line to stdout and exits with code 1

#### Scenario: JSON output

- **WHEN** `feynman-lint --json file.md` is run
- **THEN** the CLI writes a JSON object with `file`, `passed`, and `issues` fields and exits
  with the appropriate code

#### Scenario: --strict promotes warnings to errors

- **WHEN** `feynman-lint --strict file.md` is run and the file has only L06 warnings
- **THEN** the CLI exits with code 1

#### Scenario: --fix repairs frames in-place

- **WHEN** `feynman-lint --fix file.md` is run
- **THEN** misaligned ASCII frames are repaired and the file is written back; exit 0

#### Scenario: Input from stdin

- **WHEN** `feynman-lint -` receives Markdown on stdin
- **THEN** it lints the input using the selected reporting format
- **AND** `feynman-lint --fix -` exits with usage status 2

#### Scenario: Token-cost explanation

- **WHEN** `feynman-lint --explain file.md` checks a file containing frames
- **THEN** it shows the cost breakdown for each frame and the file is unchanged

### Requirement: autofix and the linter share one frame definition

Autofix and L08/L11/L12/L15 SHALL share the canonical frame definition
(`nextFrame`). A frame SHALL stay within a fence-free segment and end at the
first matching same-indent closer. Its inner rows SHALL be fully bordered.
Autofix MAY collapse empty non-inner lines. If any non-empty non-inner line is
present, autofix SHALL preserve the content and skip alignment and conversion.

#### Scenario: frame with a non-bordered inner line is still aligned

- **WHEN** a `┌─…─┐` frame contains a blank line before its closing `└─…─┘` row
- **THEN** autofix treats the block as one frame, finds the closer past that
  line, and aligns the frame's `│ … │` inner rows to the opening row's width;
  the non-bordered line is collapsed and does not appear in the output

#### Scenario: a row missing its right border is preserved

- **WHEN** a `┌─…─┐` frame contains a line that starts with `│` but has no
  closing `│` (a runaway row)
- **THEN** autofix preserves the line and skips alignment and conversion of
  this frame, leaving the ambiguous structure available for manual repair
- **AND** this holds for L11/L15 conversion and explicitly processed fences

#### Scenario: a frame is not detected across a fence boundary

- **WHEN** a `┌─…─┐` opener appears outside a ` ``` ` fence and the only matching
  `└─…─┘` closer lies inside the following fenced block
- **THEN** autofix does not join them into one frame and leaves the block
  untouched, preserving fenced sample content

#### Scenario: well-formed frame output is unchanged

- **WHEN** autofix runs on a frame whose inner lines are all well-formed
  `│ … │` rows
- **THEN** the aligned output is identical to the pre-consolidation output

#### Scenario: Frame rows and closer selection

- **WHEN** a frame opener is followed by inner lines, non-inner lines and
  multiple matching closer rows
- **THEN** the first matching closer at the same indent ends the frame even
  after a blank line or stray prose
- **AND** only fully bordered `│ … │` lines count as inner rows. If stray
  prose is present, autofix preserves it and skips alignment and conversion
