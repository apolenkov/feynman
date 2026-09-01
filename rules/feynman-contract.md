<!-- feynman diagram rules — hook reads block matching active intensity -->
<intensity name="lite">
<triggers>
| structure     | visual          |
|---------------|-----------------|
| sequence      | arrow flow      |
| sequence-msg  | A->>B: msg      |
| hierarchy ≥3  | 2-space indent  |
| branching     | ASCII tree      |
| comparison    | md table        |
| 2-col compare | a │ b cols      |
| status        | dot-leader list |
| priority      | ▲▼ scale        |
| state-machine | states+arrows   |
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
2-col: single `│`. Labels: shortest noun phrase, no articles/verbs.
</contract>
</intensity>

<intensity name="full">
<triggers>
| structure     | visual                  |
|---------------|-------------------------|
| sequence      | arrow flow              |
| sequence-msg  | A->>B / A-->>B          |
| activity-flow | [s] → [d?] → [s]       |
| hierarchy ≥3  | ASCII tree              |
| branching     | ASCII tree              |
| comparison    | md table                |
| 2-col compare | a │ b cols              |
| status        | dot-leader list         |
| priority      | ▲▼ scale                |
| state-machine | states+arrows           |
| mapping       | pairs grid              |
| C4 context    | Person(x)-->WebApp: lbl |
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
6. 2-col: single `│`. >3 entities: bullet list first, then draw.
7. Applies to .md plan files (.planning/**, goals/**).
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<intensity name="ultra">
<triggers>
| structure         | visual                  |
|-------------------|-------------------------|
| sequence          | arrow flow              |
| sequence-msg      | A->>B / A-->>B          |
| activity-flow     | [s] → [d?] → [s]       |
| hierarchy ≥2      | ASCII tree              |
| branching         | ASCII tree              |
| comparison        | md table                |
| 2-col compare     | a │ b cols              |
| status            | md table                |
| priority          | ▲▼ scale                |
| state-machine     | states+arrows           |
| mapping           | pairs grid              |
| C4 context        | Person(x)-->WebApp: lbl |
| any list ≥2 items | tree or flow            |
One primary visual per response.
</triggers>
<contract>
1. Classify shape (see trigger table); suppression outranks triggers.
2. Suppress: definition, recommendation, greeting, question-back → prose.
3. Channel / amplify per trigger table for everything else.
4. Smallest within ultra floor: dot-leader<tree<table<frame.
5. Horizontal `[A] → [B] → [C]` for ≤5 nodes; vertical/tree when branching/labeled.
6. 2-col: single `│`. >3 entities: bullet list first, then draw.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<verbosity name="ABC">
A. Caption: shortest noun phrase; no articles, no verbs in labels.
B. Narration: classify silently; diagram-first; no "Here is the X:" preamble.
C. Length: ≤50 prose words (structural) / ≤120 (general); cut prose duplicating the visual.
</verbosity>
