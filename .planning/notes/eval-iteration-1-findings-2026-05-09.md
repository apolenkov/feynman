---
title: Feynman rules eval iteration-1 findings
date: 2026-05-09
context: 28 subagent runs (16 with_rules + 12 baseline only) measuring impact of rules/feynman-activate.md (full intensity) on Claude's diagram-rendering behavior. Reframes Phase 8 scope.
---

# Eval iteration-1 — what we measured

## Setup

- **Eval set:** 20 prompts (12 should-trigger-diagram, 8 should-not). `evals/evals.json`.
- **Runs:** 16 paired (baseline + with_rules) on 8 evals; 12 baseline-only on remaining.
- **Workspace:** `feynman-rules-workspace/iteration-1/`.
- **Method:** spawn `general-purpose` subagent. Baseline = no rules. With_rules = subagent reads `/tmp/feynman-rules-full.md` and applies the "full" intensity section.
- **Model:** subagents inherit harness model (Opus 4.7).

## Quantitative summary

```
8 paired evals — bytes (baseline → with_rules)
─────────────────────────────────────────────────────────────────
01 sequence       857 →  1076   (+25%, adds explicit ASCII flow)
03 hierarchy     4388 →  3111   (-29%, more compact, same tree)
05 comparison    2440 →  1515   (-38%, but worse format — ASCII pipes)
07 status         981 →   946   (-3%, but 4 visuals instead of 1)
08 priority      2559 →  1945   (-24%, but 4 visuals instead of 1)
10 branching     1859 →  1031   (-44%, adds 1 explicit ASCII flow)
13 single-fact      4 →    35   (both correctly NO diagram)
15 prose-opt-out 4102 →  3431   (both correctly NO diagram)
```

```
12 baseline-only — visual count (frame/tree/arrow/mdtable/priority)
─────────────────────────────────────────────────────────────────
02 sequence-http       0 / 0 / 2 / 0 / 0    inline arrows in prose
04 org chart           0 / 0 / 0 / 0 / 0    pure prose
06 comparison-2        0 / 0 / 0 / 7 / 0    MD table natural
09 state-machine       4 / 4 / 0 /11 / 3    HEAVY (without rules!)
11 mapping             7 / 9 / 5 /13 / 5    MASSIVE (without rules!)
12 ru-status           0 / 0 / 1 / 8 / 0    RU + MD tables
14 pure-code           0 / 0 / 0 / 0 / 0    ✓ correct
16 short-list          0 / 0 / 0 / 0 / 0    ✓ correct
17 recommendation      0 / 0 / 0 / 0 / 0    ✓ correct
18 question-back       0 / 0 / 0 / 0 / 0    ✓ correct
19 greeting            0 / 0 / 0 / 0 / 0    ✓ correct
20 definition          0 / 0 / 3 / 9 / 0    OVER-instrumented baseline
```

## Three classes of evidence

### A. Where rules WIN (proven)

```
class           baseline                    with_rules
────────────────────────────────────────────────────────────────
sequence-01     prose, no arrows            prose + ASCII flow ✓
branching-10    inline arrows in prose      compact ASCII flow + 44% shorter
hierarchy-03    ASCII tree (good)           same tree, -29% bytes
```

These are the cases where feynman justifies its existence. Baseline either lacks a visual entirely (sequence-01, org-04 likely) or scatters arrows inside prose (branching-10).

### B. Where rules HURT or NO-OP

```
class           baseline                    with_rules                   why
────────────────────────────────────────────────────────────────────────────────
comparison-05   clean MD table              ASCII pipes in code block    rules push wrong format
status-07       clean MD table              4 visuals stacked            over-instrumentation
priority-08     clean MD table              4 visuals stacked            over-instrumentation
```

Three failure modes:
1. **Format push:** rules describe "side-by-side ASCII columns max 3" → model emits raw `|`-separated columns inside a code block. Baseline gives proper Markdown table, which is cheaper AND more readable (research-confirmed: MD table beats ASCII pipes both on tokens and LLM compliance).
2. **Visual stacking:** rules list multiple SDLC patterns (status, priority, release, retro, decision) and the model treats them as additive — emits 3-4 blocks for one status response. No mutex semantics.
3. **No budget:** rules don't say "one primary visual per response."

### C. Where rules CORRECTLY do nothing

```
class                baseline      with_rules    
────────────────────────────────────────────────
single-fact-13       "443"         "The default port is 443."
prose-opt-out-15     pure prose    pure prose
pure-code-14         one-liner     n/a (not run with_rules)
greeting-19          brief         n/a
definition-20        9 mdt!        n/a (would over-suppress?)
```

Negatives proven on 13/15. **F2 of the prompt-rewrite research (drop "когда диаграмма не появляется") MUST BE CANCELLED** — the negative-condition section is what protects these cases.

## The big inversion

**Baseline Claude over-instruments half of the structure classes without any rules.** Eval-09 (state-machine) emitted 4 frames + tree + 11 MD tables + 3 priority markers BEFORE feynman touched anything. Eval-11 (mapping) was even bigger. Eval-20 (definition: "what does idempotent mean") got 3 arrows + 9 MD tables.

This reframes feynman's role:

```
old framing:  "make Claude draw diagrams when it wouldn't"
new framing:  "channel Claude's existing diagram impulse into cheap formats,
               add diagrams ONLY where baseline lacks them,
               suppress over-instrumentation where baseline already does too much"
```

## Phase 8 — updated scope

```
factor                          status    rationale (eval evidence)
────────────────────────────────────────────────────────────────────
F1 XML-tagged sections          KEEP      research-confirmed
F2 drop negative conditions     CANCEL    eval-13/15 prove negatives work and matter
F3 expanded few-shot literals   KEEP      research-confirmed
F4 structure→visual table       KEEP      + add "ONE primary visual per response"
F5 CoT classify-first           KEEP      research-confirmed
F7 XML intensity wrapper        KEEP      research-confirmed
F8 token-economy matrix         ADD       eval-05/07/08 confirm: dot-leader > frame
                                          comparison MUST be MD table, NOT ASCII pipes
F9 mutex visuals                ADD       eval-07/08 stacked 3-4 visuals
                                          rule: SDLC patterns are alternatives, not additive
F10 suppress over-instrument    ADD-NEW   eval-20 baseline shows model over-visualizes
                                          for definition/recommendation
                                          rule: simple Q&A → prose, even if structure exists
F11 channel format              ADD-NEW   comparison → MD table (not ASCII pipes)
                                          status → dot-leader (not frame)
                                          hierarchy → indent (not box-tree) at lite
```

## Open questions (for iteration-2)

1. Does the rewritten ruleset (with F8-F11) actually deliver gains on the over-instrumented classes? Need with-NEW-rules runs on eval-07/08/05/20.
2. Does suppression (F10) over-suppress legitimate visuals? Risk: definition prompts that genuinely benefit from diagrams (e.g., "what is async vs sync" comparison) get prose-only.
3. Do XML-tagged sections (F1) actually shift compliance vs current markdown headers? Need direct A/B.
4. Token cost wire-saving: how much of `additionalContext` 10k cap do we free up after rewrite? Current rules are ~5.6KB.

## Reproducibility

```
runs       feynman-rules-workspace/iteration-1/eval-NN/{baseline,with_rules}/outputs/answer.md
eval set   evals/evals.json (20 prompts)
rules      rules/feynman-activate.md (full intensity → /tmp/feynman-rules-full.md)
```

Subagent prompt template:

```
[baseline]    Answer naturally. No rules/skills. PROMPT: <eval prompt>. Write to <path>.
[with_rules]  Read /tmp/feynman-rules-full.md. Apply ALL "full" intensity rules. PROMPT: <eval prompt>. Write to <path>.
```

## Decision log

- 2026-05-09: F2 (drop negatives) **cancelled** based on eval-13/15 evidence. Negatives stay, optional rewording allowed.
- 2026-05-09: F10 + F11 **added** based on eval-09/11/20 baseline evidence — feynman role expands to suppression + canalization, not just amplification.
- 2026-05-09: Iteration-2 deferred until Phase 8 rewrite ships (then A/B old vs new on full 20-eval set).
