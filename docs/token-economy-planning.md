# Token Economy in Planning

## Why plan documents bloat

When a model describes a pipeline or decision tree in prose, the reader has to
reconstruct the structure mentally before understanding it. The model
compensates for this extra cognitive load by adding explanation, repetition, and
transition phrases — "first we do X, then Y, and finally Z" — which can double
or triple the character count of a response that could have been a three-node
diagram.

## How feynman flips this

feynman injects diagram rules into every prompt via the `UserPromptSubmit` hook,
so the assistant draws structure instead of narrating it:

```
without feynman                    with feynman
─────────────────────────────────────────────────────────────
"First we parse the input,         [parse] → [validate]
then we validate it against              → [persist]
the schema, and finally we               → [notify]
persist the result and send
a notification."
```

The rules live in [`rules/feynman-activate.md`](../rules/feynman-activate.md)
and fire on every prompt — including prompts that ask the model to write or
review a plan file.

Three orthogonal interventions combine in v0.5.0:

- **A — caption brevity**: diagram labels and captions stay short
- **B — no narration preamble**: response starts at the diagram, not a
  sentence explaining the diagram
- **C — prose cap**: prose below a diagram is bounded to what the diagram
  cannot express

## Measured impact

Corpus: 50 prompts across 9 structural classes (sequence, hierarchy,
comparison, status, priority, branching, state-machine, mapping, none).
Evaluation: simulated responses with rules injected, char counts compared
across 7 arms.

```
avg response size (characters)

v0.3.x baseline  ████████████████████████████████████████████  436
v0.5.x-A         █████████████████████████                     245  −43.8%
v0.5.x-B         ████████████████████████████                  275  −36.9%
v0.5.x-C         ██████████████████████████                    259  −40.6%
v0.5.x-ABC  ▶    ████████████████████                          197  −54.7%  ← winner
```

All four candidates passed ≥ 95% lint compliance. ABC is the production rule
set shipped in v0.5.0.

Per-class breakdown for plan-relevant structural types:

```
class          v0.3.x   ABC    delta
──────────────────────────────────────
sequence         344     119   −65%
hierarchy        323     151   −53%
branching        378     115   −70%
state-machine    318     105   −67%
comparison       588     250   −57%
status           438     187   −57%
──────────────────────────────────────
overall avg      436     197   −55%
```

## Where it kicks in for plan writers

· `/gsd-plan-phase` → writes `PLAN.md` in `.planning/phases/`
· `/plannotator-setup-goal` → writes `goals/<slug>/plan.md`
· Manual "write a plan for X" prompt in any chat session
· **New in v0.5.0:** rules explicitly apply to `.md` plan files —
  `plan.md`, `PLAN.md`, `.planning/**`, `goals/**`

## Anti-patterns to avoid

Narration wrapper (removes itself):
· "Here is the plan for the migration. As you can see from the diagram below, ..."
  → start at the diagram

Prose echo (restates what the visual already shows):
· `[A] → [B] → [C]`  then: "So first A happens, which leads to B, then C."
  → drop the prose

Over-decorated single item (use a dot-leader instead):
· A full ASCII frame (`┌ … ┐`) for one status bullet
  → `· status: ready` is enough

## Checklist for plan writers

- Does every sequence of steps have an `[A] → [B] → [C]` arrow diagram?
- Does every branching decision have a yes/no tree instead of "if X then ... otherwise ..."?
- Does every parallel track have a side-by-side block instead of a numbered list?
- Does every table or status frame stand alone, with prose only for what the visual cannot express?
- Is there a preamble sentence that says what the diagram is about to show? Delete it.

## Beyond planning — delegation

For heavy multi-step planning sessions, feynman's token savings compound with
the Subagent Delegation principle — delegate research and implementation waves
to subagents, keep the orchestrator lean.

```text
[orchestrator — feynman active, lean context]
      │
      ├── Wave 1: N parallel subagents (each with full brief)
      │     └── each agent: fresh context, compact summary returned
      │
      └── Wave 2: orchestrator merges summaries, writes plan
```

feynman ensures that every subagent response — including diagram-heavy planning
output — stays compact. The orchestrator's context stays below the compaction
threshold longer.

See: [SUBAGENT-DELEGATION.md](https://github.com/apolenkov/core-principles/blob/main/docs/core/SUBAGENT-DELEGATION.md)
in the core-principles repository for the full delegation principle.
