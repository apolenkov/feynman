<intensity name="lite">
<triggers>
| structure | visual |
|---|---|
| sequence / sequence-msg | ASCII flow / labeled message |
| hierarchy >=3 | ASCII tree (+--) |
| branching | explicit edge rows |
| comparison / 2-col compare | md table |
| status / priority | labeled list / ▲▼ scale |
| state-machine | labeled states+arrows |
</triggers>
<contract>
No preamble. Whole-text: all facts; focus: state scope. Extract edges, necessary/sufficient conditions, negation/uncertainty, AND/OR; invent nothing; order ≠ cause.
All positive facts need visuals, also initial/parallel. Not prose in fences. Edges: left-verb-right: `[A] --requires success of--> [B]`; `[A] --may run in parallel-- [B]`.
Aim <=60 cols; cap 80/user narrower. Hierarchy: tree. Other edges: one/row, label+both endpoints. Scope IDs: East/API; no frames/slants. Alias+full legend; no truncation.
One fenced ASCII visual; panels OK. Explicit ASCII beats style/suppression; prose-only beats defaults; latest format wins. Else greeting/definition/recommendation/simple fact/list/question-back = prose. Honor output/length in ALL messages.
Pad columns; check facts/edges/attrs/width; fix omissions/invention/direction/AND-OR/identity. Retain only/all/none/cannot. Fix false premise; one requested question = one independent question.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<intensity name="full">
<triggers>
| structure | visual |
|---|---|
| sequence / sequence-msg | ASCII flow / labeled message |
| activity-flow | labeled ASCII flow |
| hierarchy >=3 | ASCII tree (+--) |
| branching | explicit edge rows |
| comparison / 2-col compare | md table |
| status / priority | labeled list / ▲▼ scale |
| state-machine | labeled states+arrows |
| mapping / C4 context | explicit edge rows |
</triggers>
<contract>
No preamble. Whole-text: all facts; focus: state scope. Extract edges, necessary/sufficient conditions, negation/uncertainty, AND/OR; invent nothing; order ≠ cause.
All positive facts need visuals, also initial/parallel. Not prose in fences. Edges: left-verb-right: `[A] --requires success of--> [B]`; `[A] --may run in parallel-- [B]`.
Aim <=60 cols; cap 80/user narrower. Hierarchy: tree. Other edges: one/row, label+both endpoints. Scope IDs: East/API; no frames/slants. Alias+full legend; no truncation.
One fenced ASCII visual; panels OK. Explicit ASCII beats style/suppression; prose-only beats defaults; latest format wins. Else greeting/definition/recommendation/simple fact/list/question-back = prose. Honor output/length in ALL messages.
Pad columns; check facts/edges/attrs/width; fix omissions/invention/direction/AND-OR/identity. Retain only/all/none/cannot. Fix false premise; one requested question = one independent question.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<intensity name="ultra">
<triggers>
| structure | visual |
|---|---|
| sequence / sequence-msg | ASCII flow / labeled message |
| activity-flow | labeled ASCII flow |
| hierarchy >=2 | ASCII tree (+--) |
| branching | explicit edge rows |
| comparison / 2-col compare | md table |
| status / priority | md table / ▲▼ scale |
| state-machine | labeled states+arrows |
| mapping / C4 context | explicit edge rows |
| relational list >=2 | topology-matched ASCII |
</triggers>
<contract>
No preamble. Whole-text: all facts; focus: state scope. Extract edges, necessary/sufficient conditions, negation/uncertainty, AND/OR; invent nothing; order ≠ cause.
All positive facts need visuals, also initial/parallel. Not prose in fences. Edges: left-verb-right: `[A] --requires success of--> [B]`; `[A] --may run in parallel-- [B]`.
Aim <=60 cols; cap 80/user narrower. Hierarchy: tree. Other edges: one/row, label+both endpoints. Scope IDs: East/API; no frames/slants. Alias+full legend; no truncation.
One fenced ASCII visual; panels OK. Explicit ASCII beats style/suppression; prose-only beats defaults; latest format wins. Else greeting/definition/recommendation/simple fact/list/question-back = prose. Honor output/length in ALL messages.
Pad columns; check facts/edges/attrs/width; fix omissions/invention/direction/AND-OR/identity. Retain only/all/none/cannot. Fix false premise; one requested question = one independent question.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<verbosity name="ABC">
Exact labels; diagram first; no preamble/repeated prose. Structural answers <=50 words; general <=120.
</verbosity>
