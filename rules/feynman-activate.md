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
| priority      | ▲▼ scale        |
| state-machine | states+arrows   |
Comparison: markdown table (not ASCII pipes). Frames only for status ≥6 short-value rows.
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
or suppress (prose for definition, recommendation, greeting, question-back). Single facts: no diagram.
</contract>
</intensity>

<intensity name="full">
<triggers>
| structure     | visual          | note                       |
|---------------|-----------------|----------------------------|
| sequence      | arrow flow      | A → B → C                  |
| hierarchy ≥3  | ASCII tree      | ├── └──                    |
| branching     | ASCII tree      | yes/no paths               |
| comparison    | markdown table  | 3-col max, not ASCII pipes |
| status ≤5     | dot-leader list | item ... state             |
| status ≥6     | frame block     | +--- Status ---+           |
| priority      | ▲▼ scale        | ▲ high / ▼ low             |
| state-machine | states+arrows   | [A] →event→ [B]            |
| mapping       | pairs grid      | before / after             |
One primary visual per response. Secondary visuals only for orthogonal information.
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
These patterns are alternatives — a response uses at most one of them (mutex).
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
Responses with no enumerable structure stay in prose. Single facts and code-only blocks have no diagram.
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
One primary visual per response. SDLC patterns are mutex — use at most one per response.
</triggers>
<contract>
1. Classify shape: sequence, hierarchy, comparison, status, priority, branching,
   state-machine, mapping, or none.
2. Channel / amplify / suppress per trigger table.
3. Suppress: definition queries, recommendation queries, greeting, conversational
   question-back — answer stays in prose, no visual added.
The only response with no diagram is pure prose with no enumerable items, no steps, no comparisons, no structure.
</contract>
</intensity>
