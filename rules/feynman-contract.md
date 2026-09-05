<!-- feynman diagram rules — hook reads block matching active intensity -->
<intensity name="lite">
<triggers>
| structure | visual |
|---|---|
| sequence | arrow flow |
| sequence-msg | A->>B: msg |
| hierarchy ≥3 | 2-space indent |
| branching | ASCII tree |
| comparison | md table |
| 2-col compare | md table |
| status | dot-leader list |
| priority | ▲▼ scale |
| state-machine | states+arrows |
</triggers>
<syntax>
`[A] → [B] → [C]`
```
root
  ├── child-a
  └── child-b
      └── leaf
```
</syntax>
<examples>
`[commit] → [build] → [test] → [staging] → [production]`
```
repo
  ├── apps
  │   └── web
  └── packages
      └── shared
```
</examples>
<contract>
classify shape → channel, amplify, or suppress (definition, recommendation, greeting, question-back → prose).
Mutex: at most one primary visual per response.
Smallest: prose<glyph<dot-leader<tree<table<frame.
Horizontal `[A] → [B] → [C]` for ≤5 nodes; vertical when branching or labeled edges.
Use Markdown tables and fenced multiline diagrams. Preserve relationship verbs.
Honor format. Check claims against source: actors, direction, values, uncertainty; invent no mechanisms/links. Fix false premises; unknown direction: no arrow. One requested question means one independently answerable question.
</contract>
</intensity>

<intensity name="full">
<triggers>
| structure | visual |
|---|---|
| sequence | arrow flow |
| sequence-msg | A->>B / A-->>B |
| activity-flow | [s] → [d?] → [s] |
| hierarchy ≥3 | ASCII tree |
| branching | ASCII tree |
| comparison | md table |
| 2-col compare | md table |
| status | dot-leader list |
| priority | ▲▼ scale |
| state-machine | states+arrows |
| mapping | pairs grid |
| C4 context | Person(x)-->WebApp: lbl |
One primary visual per response.
</triggers>
<examples>
`[commit] → [build] → [test] → [staging] → [production]`
```
repo          tests
├── apps      ├── unit
│   ├── web   │   ├── hook
│   └── api   │   └── lint
└── packages  └── e2e
    └── shared
```
</examples>
<contract>
1. Classify shape (see trigger table), then channel / amplify / suppress.
2. Suppress: definition, recommendation, greeting, question-back → prose.
3. Mutex: at most one primary visual per response.
4. Smallest: prose<glyph<dot-leader<tree<table<frame.
5. Horizontal `[A] → [B] → [C]` for ≤5 nodes; vertical/tree when branching/labeled.
6. Use Markdown tables and fenced multiline diagrams; avoid duplicate lists.
7. Applies to .md plan files (.planning/**, goals/**).
**bold** keys; ▲▼ priority; ✓✗ status.
Honor format. Check claims against source: actors, direction, values, uncertainty; invent no mechanisms/links. Fix false premises; unknown direction: no arrow. One requested question means one independently answerable question.
</contract>
</intensity>

<intensity name="ultra">
<triggers>
| structure | visual |
|---|---|
| sequence | arrow flow |
| sequence-msg | A->>B / A-->>B |
| activity-flow | [s] → [d?] → [s] |
| hierarchy ≥2 | ASCII tree |
| branching | ASCII tree |
| comparison | md table |
| 2-col compare | md table |
| status | md table |
| priority | ▲▼ scale |
| state-machine | states+arrows |
| mapping | pairs grid |
| C4 context | Person(x)-->WebApp: lbl |
| any list ≥2 items | tree or flow |
One primary visual per response.
</triggers>
<contract>
1. Classify shape (see trigger table); suppression outranks triggers.
2. Suppress: definition, recommendation, greeting, question-back → prose.
3. Channel / amplify per trigger table for everything else.
4. Smallest within ultra floor: dot-leader<tree<table<frame.
5. Horizontal `[A] → [B] → [C]` for ≤5 nodes; vertical/tree when branching/labeled.
6. Use Markdown tables and fenced multiline diagrams; avoid duplicate lists.
**bold** keys; ▲▼ priority; ✓✗ status.
Honor format. Check claims against source: actors, direction, values, uncertainty; invent no mechanisms/links. Fix false premises; unknown direction: no arrow. One requested question means one independently answerable question.
</contract>
</intensity>

<verbosity name="ABC">
A. Caption: concise labels; preserve meaningful relationship verbs.
B. Narration: classify silently; diagram-first; no "Here is the X:" preamble.
C. Length: ≤50 prose words (structural) / ≤120 (general); cut prose duplicating the visual.
</verbosity>
