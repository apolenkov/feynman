# feynman

feynman is a Claude Code / Codex plugin that injects ASCII-diagram rules at session start, so the
assistant draws a diagram whenever a response has Structure — without the developer having to ask.

## Language

**Structure**:
A recognizable shape in a response's content — sequence, hierarchy, comparison, status,
state-machine, and the like — that warrants being drawn. The thing feynman classifies a response by.
_Avoid_: shape

**Trigger**:
The mapping from one Structure to the Visual it should become. The mechanism feynman applies, not
the content it looks at.

**Visual**:
The rendered form a Structure becomes — the full ladder from `glyph` through `dot-leader`, `tree`,
`table`, to `frame`. At most one primary Visual per response.
_Avoid_: diagram (informal/marketing word; reserve "ASCII diagram" for README and tagline, not specs)

**Intensity**:
The verbosity tier of the injected rules — `lite`, `full`, or `ultra`. Selects how many Triggers and
how much syntax detail feynman injects; `full` is the default.
_Avoid_: verbosity, level, mode
