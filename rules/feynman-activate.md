<!-- feynman diagram rules — hook reads block matching active intensity -->
<intensity name="lite">
<triggers>
| structure     | visual          |
|---------------|-----------------|
| sequence      | arrow flow      |
| hierarchy ≥3  | 2-space indent  |
| branching     | ASCII tree      |
| comparison    | markdown table  |
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
classify shape → channel (replace inline visual), amplify (add when baseline produces none),
or suppress (prose for definition, recommendation, greeting, question-back).
Smallest visual fits: prose<glyph<dot-leader<tree<table<frame.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<intensity name="full">
<triggers>
| structure     | visual          |
|---------------|-----------------|
| sequence      | arrow flow      |
| hierarchy ≥3  | ASCII tree      |
| branching     | ASCII tree      |
| comparison    | markdown table  |
| status        | dot-leader list |
| priority      | ▲▼ scale        |
| state-machine | states+arrows   |
| mapping       | pairs grid      |
One primary visual per response.
</triggers>
<examples>
`[commit] → [build] → [test] → [staging] → [production]`
`[request] → [validate] → [check scope] → [respond]`
```
repo
├── apps
│   ├── web
│   └── api
└── packages
    └── shared
```
```
tests
├── unit
│   ├── hook
│   └── lint
└── e2e
```
</examples>
<contract>
1. Classify shape: sequence, hierarchy, comparison, status, priority, branching,
   state-machine, mapping, or none.
2. Channel / amplify / suppress per trigger table.
3. Suppress: definition queries, recommendation queries, greeting, conversational
   question-back — answer stays in prose, no visual added.
4. Mutex: at most one primary visual per response.
5. Smallest visual fits: prose<glyph<dot-leader<tree<table<frame. Climb only if lighter form loses information.
6. Rules apply to .md plan files (plan.md, PLAN.md, .planning/**, goals/**).
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<intensity name="ultra">
<triggers>
| structure         | visual          |
|-------------------|-----------------|
| sequence          | arrow flow      |
| hierarchy ≥2      | ASCII tree      |
| branching         | ASCII tree      |
| comparison        | markdown table  |
| status            | markdown table  |
| priority          | ▲▼ scale        |
| state-machine     | states+arrows   |
| mapping           | pairs grid      |
| any list ≥2 items | tree or flow    |
One primary visual per response.
</triggers>
<contract>
1. Classify shape: sequence, hierarchy, comparison, status, priority, branching,
   state-machine, mapping, or none.
2. Suppression outranks triggers — apply triggers only after suppression check passes.
3. Suppress: definition, recommendation, greeting, conversational question-back — prose only.
4. Channel / amplify per trigger table for everything else.
5. Smallest visual within ultra floor: dot-leader<tree<table<frame.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<verbosity name="ABC">
A. Caption: shortest noun phrase; no articles, no verbs in labels.
B. Narration: classify silently; diagram-first; no "Here is the X:" preamble.
C. Length: ≤50 prose words (structural) / ≤120 (general); excludes code-fenced and ASCII. Cut prose duplicating the visual.
</verbosity>
