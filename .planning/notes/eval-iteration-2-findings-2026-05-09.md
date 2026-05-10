---
title: Feynman rules eval iteration-2 findings
date: 2026-05-10
context: 60 outputs (20 evals × 3 arms) measuring impact of new XML contract rules vs old markdown-comment rules vs baseline. Validates Phase 8 rewrite amplify/channel/suppress behavior.
---

# Eval iteration-2 — what we measured

## Setup

- **Eval set:** 20 prompts (12 should-trigger-diagram, 8 should-not). `evals/evals.json`.
- **Arms:** baseline (no rules), with_old_rules (pre-plan-02 markdown-comment format), with_new_rules (post-plan-02 XML contract).
- **Workspace:** `feynman-rules-workspace/iteration-2/`.
- **Method:** general-purpose model. Baseline = no rules. with_old_rules = apply `<!-- full -->` section. with_new_rules = apply `<intensity name="full">` section.
- **Old rules snapshot:** git SHA `703599d` (pre-plan-02, HTML-comment format, 5554 bytes full section).
- **New rules snapshot:** post-plan-02 XML contract, 2102 bytes full section (62% reduction vs old).

## Quantitative summary — bytes per arm

```
eval                         baseline   with_old   with_new   old→new delta
──────────────────────────────────────────────────────────────────────────────
01 sequence-deploy             515        758        382        -50%
02 sequence-http               568        808        466        -42%
03 hierarchy                   761       1158        664        -43%
04 hierarchy-org               861        984        666        -32%
05 comparison-3db              873        826        828        +0.2%
06 comparison-2fw              798        788        684        -13%
07 status-multi                495       1011        315        -69%
08 priority-bugs               657       1110        391        -65%
09 state-machine              1162       1105        504        -54%
10 branching-auth              828        906        627        -31%
11 mapping-before-after        843       2098        735        -65%
12 ru-status                   630        875        556        -36%
13 single-fact                   4         35         35          0%
14 pure-code                    22         22         22          0%
15 prose-opt-out               988        964        755        -22%
16 short-list                   59        314         24        -92%
17 recommendation              346        284        154        -46%
18 question-back               425        388        283        -27%
19 greeting                     69         44         44          0%
20 definition                  541        416        289        -31%
──────────────────────────────────────────────────────────────────────────────
TOTAL                        11445      14894       8424
AVERAGE                        572        744        421
```

**New rules vs baseline:** -26% overall (-151 bytes/eval avg).
**New rules vs old rules:** -43% overall (-323 bytes/eval avg).
**Old rules vs baseline:** +30% overhead (old rules inflated output).

## Visual count table (frame / tree / arrow / mdtable / priority)

```
eval / arm               frames  trees  arrows  mdtbl  priority
──────────────────────────────────────────────────────────────────
01-sequence baseline         0      0      1       0        0
01-sequence old_rules        0      0      1       0        0
01-sequence new_rules        0      0      1       0        0  ✓ arrow preserved
─
02-sequence-http baseline    0      0      1       0        0
02-sequence-http old_rules   0      0      3       0        0
02-sequence-http new_rules   0      0      2       0        0  ✓ compact
─
03-hierarchy baseline        0     17      0       0        0
03-hierarchy old_rules       0     24      0       0        0
03-hierarchy new_rules       0     13      0       0        0  ✓ compact tree
─
05-comparison baseline       0      0      0       5        0
05-comparison old_rules      0      0      0       0        0  ← ASCII pipes (HURT-1 fixed!)
05-comparison new_rules      0      0      0       5        0  ✓ MD table
─
07-status baseline           0      0      0       9        0
07-status old_rules          2      0      0       7        2  ← stacked (frames+mdtbl+priority)
07-status new_rules          0      0      0       0        0  ✓ dot-leader only, 1 visual
─
08-priority baseline         0      0      0       0        2
08-priority old_rules        0      0      0       7        3  ← stacked (table+priority)
08-priority new_rules        0      0      0       0        2  ✓ priority scale only, 1 visual
─
10-branching baseline        0      0      1       0        0
10-branching old_rules       0      0      3       0        0
10-branching new_rules       0      0      5       0        0  ✓ branching flow preserved
─
11-mapping baseline          0      0      1       8        0
11-mapping old_rules         1      7      1       7        0  ← stacked (frame+tree+table)
11-mapping new_rules         0      0      0       8        0  ✓ MD table only
─
13-single-fact baseline      0      0      0       0        0
13-single-fact old_rules     0      0      0       0        0
13-single-fact new_rules     0      0      0       0        0  ✓ pure prose
─
15-prose baseline            0      0      0       0        0
15-prose old_rules           0      0      0       0        0
15-prose new_rules           0      0      0       0        0  ✓ pure prose
─
17-recommendation baseline   0      0      0       0        0
17-recommendation old_rules  0      0      0       0        0
17-recommendation new_rules  0      0      0       0        0  ✓ pure prose
─
20-definition baseline       0      0      0       0        0
20-definition old_rules      0      0      0       0        0
20-definition new_rules      0      0      0       0        0  ✓ pure prose
```

## WIN / HURT / NEUTRAL classification (new_rules vs old_rules)

```
eval                    class     rationale
──────────────────────────────────────────────────────────────────────────────
01 sequence-deploy      WIN       arrow flow preserved; -50% vs old
02 sequence-http        WIN       compact flow; -42% vs old
03 hierarchy            WIN       compact tree; -43% vs old
04 hierarchy-org        WIN       compact tree; -32% vs old
05 comparison-3db       WIN       MD table (not ASCII pipes); HURT-1 fixed
06 comparison-2fw       WIN       MD table preserved; -13%
07 status-multi         WIN       1 visual (dot-leader); old had 4 stacked; HURT-2 fixed
08 priority-bugs        WIN       1 visual (priority scale); old had table+priority stacked; HURT-3 fixed
09 state-machine        WIN       arrow flow preserved; -54%
10 branching-auth       WIN       branching flow preserved; -31%
11 mapping              WIN       MD table only; old had frame+tree+table stacked; -65%
12 ru-status            WIN       dot-leader; -36%
13 single-fact          NEUTRAL   both emit prose; no regression
14 pure-code            NEUTRAL   both emit code block; no regression
15 prose-opt-out        WIN       smaller prose; no visual added; opt-out respected
16 short-list           WIN       terse answer; old added 5-item list; -92%
17 recommendation       WIN       prose only; suppressed; -46%
18 question-back        WIN       shorter conversational; -27%
19 greeting             NEUTRAL   both terse; no change
20 definition           WIN       prose only; suppressed; -31%
──────────────────────────────────────────────────────────────────────────────
SUMMARY      WIN=17  NEUTRAL=3  HURT=0
```

## Verdict on iteration-1 failure modes

### HURT-1: comparison-05 (ASCII pipes instead of MD table)
**Status: FIXED**
- Iteration-1: old_rules pushed model to emit ASCII pipes inside code block
- Iteration-2: new_rules triggers table correctly; `eval-05-comparison/with_new_rules` = proper MD table (5 table rows, no code block)
- Evidence: `grep -cE '^\|.*\|$' eval-05.../with_new_rules/answer.md` = 5

### HURT-2: status-07 (4 visuals stacked)
**Status: FIXED**
- Iteration-1: old_rules emitted 4 SDLC patterns stacked (frame + priority + retro + decision)
- Iteration-2: new_rules emits dot-leader list only (0 frames, 0 mdtables, 0 priority); mutex enforced
- Evidence: `eval-07.../with_old_rules` = frames=2 mdtbl=7 priority=2 vs `with_new_rules` = frames=0 mdtbl=0 priority=0

### HURT-3: priority-08 (4 visuals stacked)
**Status: FIXED**
- Iteration-1: old_rules emitted priority scale + risk table + decision block
- Iteration-2: new_rules emits priority scale only (▲▼, 1 visual); 0 frames, 0 tables
- Evidence: `eval-08.../with_old_rules` = mdtbl=7 priority=3 vs `with_new_rules` = mdtbl=0 priority=2 (single ▲▼ scale)

### HURT-4: definition-20 suppression (baseline produced 9 MD tables)
**Status: FIXED**
- Iteration-1: baseline eval-20 emitted 9 MD tables for "what does idempotent mean"
- Iteration-2: `eval-20.../with_new_rules` = prose only, 0 frames, 0 tables, 289 bytes (53% of 541 baseline)
- Suppression rule explicit: definition queries → prose, even if structure exists

## Token economy summary

```
Rule payload size comparison:
  old full-intensity section: 5554 bytes
  new full-intensity section: 2102 bytes  (-62%)
  
Average output size comparison:
  baseline avg:  572 bytes
  old_rules avg: 744 bytes (+30% overhead vs baseline — old rules inflated output)
  new_rules avg: 421 bytes (-26% vs baseline, -43% vs old rules)

Key insight: old rules pushed model to produce MORE content, not less.
New XML contract channels to cheap formats → smaller, denser outputs.
```

## Open questions resolved by iteration-2

1. **Does rewritten ruleset deliver gains on over-instrumented classes?** YES — eval-07/08 fixed; eval-20 suppressed.
2. **Does suppression over-suppress legitimate visuals?** NO — eval-01/02/03/10 still produce appropriate visuals; WIN class preserved.
3. **Do XML-tagged sections shift compliance vs markdown headers?** YES — iteration-2 shows measurably different behavior (mutex working, suppression working).
4. **Token cost wire-saving?** ~62% rule payload reduction + 43% smaller outputs = significant `additionalContext` budget freed.

## Reproducibility

```
runs       feynman-rules-workspace/iteration-2/eval-NN/{baseline,with_old_rules,with_new_rules}/outputs/answer.md
eval set   evals/evals.json (20 prompts, unchanged from iteration-1)
old rules  git show 703599d:rules/feynman-activate.md | awk '/<!-- full -->/,/<!-- \/full -->/' > /tmp/feynman-rules-old-full.md
new rules  node -e 'const fs=require("fs");const r=fs.readFileSync("rules/feynman-activate.md","utf8");const m=/<intensity\s+name=["'"'"']full["'"'"']\s*>([\s\S]*?)<\/intensity>/.exec(r);fs.writeFileSync("/tmp/feynman-rules-new-full.md",m[1].trim());'
```
