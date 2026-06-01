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

**Contract**:
The injected instruction the assistant follows: classify a response's Structure against the Trigger
table, then channel it into the mapped Visual, amplify it, or suppress it (leave as prose).
Suppression outranks Triggers.
_Avoid_: rule (bare)

**Visual**:
The rendered form a Structure becomes. Two axes: a *kind* — what a Trigger turns the Structure into
(`arrow flow`, `▲▼ scale`, `✓✗ status`, `tree`, `table`, `frame`) — and a *size* ladder
`glyph < dot-leader < tree < table < frame`, used by the smallest-sufficient-form rule.
_Avoid_: diagram (informal/marketing word; reserve "ASCII diagram" for README and tagline, not specs)

**Primary Visual**:
The single Visual that *carries* a response's Structure — the one the smallest-sufficient-form rule
picks (anywhere on the ladder, a `glyph` included). At most one per response: the mutex governs the
Primary Visual only.
_Avoid_: diagram

**Annotation**:
A glyph-level marker that *decorates* content rather than carrying it — `▲▼` priority scale,
`✓✗` status, `**bold**` keys. Annotations may co-occur with a Primary Visual and with each other;
they are not bound by the one-Primary-Visual mutex. The same marker is a Primary Visual when it is
the response's carrier (a `priority → ▲▼ scale` answer) and an Annotation when it merely decorates
another Visual (a `▲` inside a table).
_Avoid_: glyph (that is the size rung, not the decorating role)

**Intensity**:
The verbosity tier of the injected rules — `lite`, `full`, or `ultra`. Selects how many Triggers and
how much syntax detail feynman injects; `full` is the default.
_Avoid_: verbosity, level, mode

**Lint rule**:
One of the product linter's L-numbered checks that flags a malformed Visual *after* it is rendered —
box closure, tree characters, arrow style, column widths, and the like. The product linter
(`feynman-lint`) owns the bare word "rule". Distinct from the assistant-facing guidance feynman
injects, which is made of Triggers at an Intensity and tells the assistant how to draw.
_Avoid_: check; "rule" for the injected guidance (reserve bare "rule" for README/tagline, not specs —
in specs say Trigger / Intensity / the injected Contract)
