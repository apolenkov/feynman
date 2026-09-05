# diagram-lint Specification

## Purpose
Define the diagnostics and layout rules that keep feynman's text diagrams
consistent, readable, and economical.
## Requirements
### Requirement: L01 — box corners close at the same column

The linter SHALL report an error (L01) when any `┌` corner has no matching `└` at the same
display column below it, any `┐` has no matching `┘` at the same display column below it,
or any bottom corner (`└`, `┘`) appears with no matching top corner at the same column above it.
Severity: **error**. Matching uses the shared display-width model, including ANSI
escape removal, supported zero-width marks and wide-character ranges. This
prevents valid Unicode frames from receiving contradictory L01/L08/L09 results.
Reported L01 diagnostic column numbers retain their historical meaning: one-based
UTF-16 source offsets, including escape bytes, for editor consumers. L09 continues
to report display columns. The width model is a code-point approximation, not a
complete grapheme-cluster or terminal-emulator implementation.

#### Scenario: unclosed top-left corner

- **WHEN** a Visual contains `┌` at column 5 but no `└` appears at column 5 on any later line
- **THEN** L01 reports an error pointing at the `┌` line

#### Scenario: orphan bottom corner

- **WHEN** a Visual contains `└` at column 5 but no `┌` appears at column 5 on any earlier line
- **THEN** L01 reports an error pointing at the `└` line

---

### Requirement: L02 — last tree child uses └── not ├──

The linter SHALL report an error (L02) when a tree node uses `├──` but has no subsequent
sibling at the same indent level, meaning it is the last child in its group.
Severity: **error**.

#### Scenario: last child uses wrong connector

- **WHEN** a tree Visual ends a sibling group with `├──` instead of `└──`
- **THEN** L02 reports an error on that line with a suggestion to replace `├──` with `└──`

#### Scenario: non-last child uses ├── correctly

- **WHEN** a tree Visual uses `├──` and at least one sibling with the same indent prefix follows
- **THEN** L02 does not report any issue on that line

---

### Requirement: L03 — one arrow style per Visual

The linter SHALL report an error (L03) when a single Visual uses more than one arrow style
from the set `-->`, `→`, `─→`, `──>`, and the sequence-message family (`->>` / `-->>`).
The two sequence-message variants (`->>` and `-->>`) SHALL be treated as a single style
(`seq-msg`) so a sequence Visual that uses both does not trigger L03. Mixing `seq-msg` with
any flow-arrow style SHALL be flagged.
Severity: **error**.

#### Scenario: single arrow style throughout

- **WHEN** a Visual uses only `→` on every flow line
- **THEN** L03 does not report any issue

#### Scenario: mixed flow arrow styles

- **WHEN** a Visual contains both `-->` on one line and `→` on another
- **THEN** L03 reports an error on the second style's first line

#### Scenario: seq-msg family is one style

- **WHEN** a sequence Visual uses both `-->>` (return) and `->>` (call) within the same block
- **THEN** L03 does not report any issue (both are `seq-msg`)

#### Scenario: seq-msg mixed with flow arrow

- **WHEN** a Visual uses `->>` and also `-->`
- **THEN** L03 reports an error for the mixed style

---

### Requirement: L04 — markdown table column count is consistent

The linter SHALL report an error (L04) when a markdown table has a row or separator whose
column count differs from the header row's column count.
Severity: **error**.

#### Scenario: row column mismatch

- **WHEN** a table header has 3 columns and a body row has 2 columns
- **THEN** L04 reports an error on the mismatched row

#### Scenario: separator column mismatch

- **WHEN** a table header has 3 columns and the `|---|` separator has 2 columns
- **THEN** L04 reports an error on the separator row

---

### Requirement: L05 — flow boxes on the same line require a connection between them

The linter SHALL report an error (L05) when two or more `[box]` tokens appear on
the same line and the complete region between consecutive boxes is not one
recognized connection. Connections MAY be bare directed arrows (`->`, `<-`,
`-->`, `<--`, `<->`, `<-->`, `→`, `←`, `↔`, `─→`, `──>`, `->>`, or `-->>`),
bare undirected dash runs of at least two dashes, or labels bounded by dash runs
of at least two dashes. Bounded labels MAY be compact or spaced, forward
(`--request-->`), reverse (`<--response--`), bidirectional (`<--sync-->`), or
undirected (`--shares--`), and MAY contain numeric comparisons such as
`-- load > 8 -->`. Longer bounding dash runs SHALL be valid. An arrow token
inside a label, an arrow-like substring within prose, multiple conflicting
arrows, or text outside a connector SHALL NOT count as a connection. A gap of
three or more spaces between boxes is treated as a parallel layout column and
is not flagged. A separate `+-->` branch connector after such a gap SHALL start
the next parallel column and SHALL NOT imply an edge from the preceding box.
L05 SHALL validate syntax without inferring a direction from label text.
Severity: **error**.

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

- **WHEN** a box named Adopt is followed by a wide gap and a `+-->` branch into a box named Re-open path
- **THEN** L05 treats `+-->` as the next column's branch and does not infer an edge from Adopt

---

### Requirement: L06 — priority scale requires both ▲ and ▼ markers

The linter SHALL report a warning (L06) when a Visual contains `▲ <text>` at the start of
a line but no `▼ <text>` at the start of any line, or vice versa. A priority scale requires
both the high and the low end to be explicit.
Severity: **warn**.

#### Scenario: ▲ without ▼

- **WHEN** a Visual contains `▲ High priority` but no `▼ …` marker
- **THEN** L06 reports a warning on the `▲` line

#### Scenario: both markers present

- **WHEN** a Visual contains both `▲ High` and `▼ Low`
- **THEN** L06 does not report any issue

---

### Requirement: L07 — Mermaid and ASCII Visuals must not coexist in the same response

The linter SHALL report a warning (L07) when the full response text contains a
` ```mermaid ` fenced block alongside any ASCII Visual indicators (box-drawing characters,
arrow-flow `[box]-->` patterns, or tree characters `├──`/`└──`). Only one format SHALL
be used throughout.
Severity: **warn**. This rule operates on the full response text, not on a single
AST node.

#### Scenario: Mermaid only

- **WHEN** the response contains ` ```mermaid ` and no ASCII box-drawing characters
- **THEN** L07 does not report any issue

#### Scenario: Mermaid alongside ASCII tree

- **WHEN** the response contains both ` ```mermaid ` and a `├──` tree Visual
- **THEN** L07 reports a warning pointing to the Mermaid block line

---

### Requirement: L08 and L09 — frame rows have consistent display width and right-edge alignment

The linter SHALL report an error (L08) when any inner row or closing row of a `┌─…─┐` frame
has a display width (measured with ANSI escapes stripped and CJK wide characters counted as
2 columns) that differs from the opening row's display width. The linter SHALL also report an
error (L09) when any inner `│` or the closing `┘` does not land at the same visual column
as the opening `┐`.
Severity of both L08 and L09: **error**.

#### Scenario: misaligned inner row (L08)

- **WHEN** the opening frame row is 20 chars wide and an inner row is 18 chars wide
- **THEN** L08 reports an error on the inner row

#### Scenario: right edge of inner row off-column (L09)

- **WHEN** the closing `│` on an inner row lands at column 19 but `┐` is at column 20
- **THEN** L09 reports an error on the inner row

#### Scenario: aligned frame

- **WHEN** all inner rows and the closing row have the same width and right-edge column as the opener
- **THEN** L08 and L09 report no issues

---

### Requirement: L10 — tokens must not mix Cyrillic and Latin script

The linter SHALL report a warning (L10) for any word-token that contains both Cyrillic
letters (`А–Я`, `а–я`, `Ё`, `ё`) and Latin letters (`A–Z`, `a–z`). Hyphenated tokens,
numeric-suffixed identifiers, and the published package name, keywords, or `bin`
names SHALL NOT be flagged. Package identifiers use Latin script; tests SHALL
verify their acceptance without filesystem access from the lint core.
Severity: **warn**.

#### Scenario: pure-Cyrillic token

- **WHEN** a line contains the token `алгоритм`
- **THEN** L10 does not report any issue

#### Scenario: mixed-script token

- **WHEN** a line contains the token `алгоритмSort` (Cyrillic + Latin)
- **THEN** L10 reports a warning identifying the token

#### Scenario: hyphenated identifier

- **WHEN** a line contains `feynman-contract` (hyphenated)
- **THEN** L10 does not report any issue

---

### Requirement: L11, L12, L13, and L15 — frame-economy rules flag wasteful framing

The linter SHALL report warnings for four related patterns of wasteful framing:
- **L11** (warn): a `┌─…─┐` frame with 1–5 inner rows that contains no nested tree
  (`├──`/`└──`) and no embedded table column (fewer than 3 `│` chars on any single row).
  The Trigger-table prescribes a dot-leader Visual for lists of ≤5 items; a full frame
  wastes roughly 50% of characters on borders and padding.
- **L12** (warn): any frame whose padding characters exceed its content characters
  (padding-dominated frame). The `--explain` CLI flag exposes the full cost breakdown.
- **L13** (warn): a tree Visual wrapped inside a frame. The tree's indentation already
  conveys hierarchy; adding a frame border adds zero information.
- **L15** (warn): a frame whose inner lines are all the same content type — all bullet
  items, all `key: value` pairs, or all plain prose — with no structural features that
  justify the frame (no arrows, no nested trees, no embedded table columns, no
  status-marker lines). Requires at least 2 inner lines.

All four rules share a whitelist: frames that contain a nested tree (`├──`/`└──`) are
exempt from L11 and L12; status-marker frames (lines ending with `← готов` / `✓` / `✗`
markers) are exempt from L15 and deferred to L11.

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

---

### Requirement: L14 — fenced Visual blocks require blank-line separation from surrounding prose

The linter SHALL report a warning (L14) when a fenced ` ``` ` block that renders a Visual
(contains box-drawing, arrow, or tree-connector characters) has prose text touching the
opening or closing fence without a blank line in between. Indented or list-adjacent blocks,
blocks adjacent to a heading, and blocks at the file boundary SHALL NOT be flagged.
Severity: **warn**.

#### Scenario: prose directly above opening fence

- **WHEN** the line immediately before ` ``` ` is a non-blank prose sentence and the block
  renders a Visual
- **THEN** L14 reports a warning on the opening fence line

#### Scenario: blank line before fence

- **WHEN** a blank line separates the prose above from the ` ``` ` opening fence
- **THEN** L14 does not report any issue

#### Scenario: list-adjacent block

- **WHEN** the line before ` ``` ` is a list marker (`- `, `* `, `1. `)
- **THEN** L14 does not report any issue regardless of Visual content

---

### Requirement: CLI accepts a file path or stdin and emits gcc-format or JSON output

The linter CLI (`feynman-lint`) SHALL accept a single Markdown file path or `-` (stdin) as
its primary input. It SHALL emit issues in gcc-compatible format by default and as a JSON
object when `--json` is passed. It SHALL exit with code 0 when no errors are found, 1 when
errors are found (or any issue when `--strict` is set), and 2 on usage errors.
The `--fix` flag SHALL apply autofix in-place (requires a file path, not stdin).
The `--explain` flag SHALL annotate each frame with its token-cost breakdown without
modifying the file.

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

### Requirement: autofix and the linter share one frame definition

The autofixer SHALL detect `┌─…─┐` frames using the same canonical frame
definition as the lint rules (the `nextFrame` helper), so that `--fix` aligns
exactly the frames the linter (L08/L11/L12/L15) recognises. A frame the linter
treats as a frame SHALL be a frame to autofix, and vice versa.

A frame's inner rows for this purpose are the fully-bordered `│ … │` lines
between the opening `┌─…─┐` row and the matching closing `└─…─┘` row at the same
indent; the closer is the first such row found scanning forward, even when
non-inner lines (a blank line or stray prose) appear between. Empty non-inner
lines may be collapsed during alignment. If any non-empty line cannot be
classified as an inner row, autofix SHALL preserve its content and skip frame
alignment and conversion; it SHALL NOT delete text to make a valid frame.
The scan is bounded to the surrounding non-fence segment: a frame never
spans a ` ``` ` fence boundary, so fenced sample frames are left untouched, the
same way the linter only ever sees one fence-free block at a time.

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
