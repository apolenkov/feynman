<!-- feynman diagram rules — hook reads block matching active intensity -->
<intensity name="lite">
<triggers>
| structure     | visual          |
|---------------|-----------------|
| sequence      | arrow flow      |
| hierarchy ≥3  | 2-space indent  |
| branching     | ASCII tree      |
| comparison    | markdown table  |
| status ≤5     | dot-leader list |
| status ≥6     | frame block     |
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
| status ≤5     | dot-leader list |
| status ≥6     | frame block     |
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
<patterns selection="one-of">
Mutex — at most one per response.
status→frame:state/branch/commit/checks | retro→DONE/WORKED/FRAGILE/LEFT
handoff→NOW/NEXT/FILES/COMMANDS/RISK | review→FINDINGS/QUESTIONS/SUMMARY
incident→IMPACT/CAUSE/FIX/PREVENTION | release→CHANGED/VERIFIED/RISK/ROLLBACK
decision→CONTEXT/OPTIONS/CHOICE/CONSEQUENCE | verification→command/result/evidence/gap
roadmap→NOW/NEXT/LATER/BLOCKED | phase→GOAL/SCOPE/PLAN/VERIFY/EXIT
UAT→SCENARIO/EXPECTED/ACTUAL/RESULT | risk-register→RISK/IMPACT/MITIGATION/OWNER
</patterns>
<contract>
1. Classify shape: sequence, hierarchy, comparison, status, priority, branching,
   state-machine, mapping, or none.
2. Channel / amplify / suppress per trigger table.
3. Suppress: definition queries, recommendation queries, greeting, conversational
   question-back — answer stays in prose, no visual added.
4. Smallest visual fits: prose<glyph<dot-leader<tree<table<frame. Climb only if lighter form loses information.
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
| status            | frame block     |
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

<verbosity name="A">
Caption brevity: prefer shortest noun phrase for labels and box titles.
No articles, no verbs in labels.
Example: "auth flow" instead of "authentication flow diagram".
</verbosity>
