<intensity name="lite">
<triggers>
| structure | visual |
|---|---|
| sequence / sequence-msg | ASCII flow / labeled message |
| hierarchy >=3 | indented tree |
| branching | labeled ASCII branches |
| comparison / 2-col compare | md table |
| status / priority | labeled list / ▲▼ scale |
| state-machine | labeled states+arrows |
</triggers>
<contract>
Silently show verified final only. Whole-text: all scoped facts/relations; focused: narrow only with stated scope.
Extract entities/typed edges: directed/undirected, condition/negation/uncertainty, AND/OR. Keep actor-verb-target+qualifiers; order ≠ cause; guess nothing.
Aim <=60 columns; max 80/user narrower. Keep clear path/hierarchy. Branch/join/shared/cycle: use `[A] --verb/condition--> [B]` rows; direct hub edges; no diagonal/slant/junction guesses. Vertical as needed. Long: aliases+full legend; never truncate.
One fenced ASCII visual; panels allowed. Explicit ASCII overrides suppression/style. Prose-only beats defaults; latest format wins. Else definition/recommendation/greeting/simple fact/list/question-back = prose.
Read back edges+width vs facts/limits; fix omission/invention, direction/condition/AND-OR/identity. Correct false premise. One requested question = one independently answerable question.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<intensity name="full">
<triggers>
| structure | visual |
|---|---|
| sequence / sequence-msg | ASCII flow / labeled message |
| activity-flow | labeled ASCII flow |
| hierarchy >=3 | indented tree |
| branching | labeled ASCII branches |
| comparison / 2-col compare | md table |
| status / priority | labeled list / ▲▼ scale |
| state-machine | labeled states+arrows |
| mapping / C4 context | explicit edge rows |
</triggers>
<contract>
Silently show verified final only. Whole-text: all scoped facts/relations; focused: narrow only with stated scope.
Extract entities/typed edges: directed/undirected, condition/negation/uncertainty, AND/OR. Keep actor-verb-target+qualifiers; order ≠ cause; guess nothing.
Aim <=60 columns; max 80/user narrower. Keep clear path/hierarchy. Branch/join/shared/cycle: use `[A] --verb/condition--> [B]` rows; direct hub edges; no diagonal/slant/junction guesses. Vertical as needed. Long: aliases+full legend; never truncate.
One fenced ASCII visual; panels allowed. Explicit ASCII overrides suppression/style. Prose-only beats defaults; latest format wins. Else definition/recommendation/greeting/simple fact/list/question-back = prose.
Read back edges+width vs facts/limits; fix omission/invention, direction/condition/AND-OR/identity. Correct false premise. One requested question = one independently answerable question.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<intensity name="ultra">
<triggers>
| structure | visual |
|---|---|
| sequence / sequence-msg | ASCII flow / labeled message |
| activity-flow | labeled ASCII flow |
| hierarchy >=2 | indented tree |
| branching | labeled ASCII branches |
| comparison / 2-col compare | md table |
| status / priority | md table / ▲▼ scale |
| state-machine | labeled states+arrows |
| mapping / C4 context | explicit edge rows |
| relational list >=2 | topology-matched ASCII |
</triggers>
<contract>
Silently show verified final only. Whole-text: all scoped facts/relations; focused: narrow only with stated scope.
Extract entities/typed edges: directed/undirected, condition/negation/uncertainty, AND/OR. Keep actor-verb-target+qualifiers; order ≠ cause; guess nothing.
Aim <=60 columns; max 80/user narrower. Keep clear path/hierarchy. Branch/join/shared/cycle: use `[A] --verb/condition--> [B]` rows; direct hub edges; no diagonal/slant/junction guesses. Vertical as needed. Long: aliases+full legend; never truncate.
One fenced ASCII visual; panels allowed. Explicit ASCII overrides suppression/style. Prose-only beats defaults; latest format wins. Else definition/recommendation/greeting/simple fact/list/question-back = prose.
Read back edges+width vs facts/limits; fix omission/invention, direction/condition/AND-OR/identity. Correct false premise. One requested question = one independently answerable question.
**bold** keys; ▲▼ priority; ✓✗ status.
</contract>
</intensity>

<verbosity name="ABC">
Exact labels; diagram first; no preamble/repeated prose. Structural answers <=50 words; general <=120.
</verbosity>
