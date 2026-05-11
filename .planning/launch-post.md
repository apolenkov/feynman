# feynman v0.4.0 — launch post drafts

Three variants targeting different audiences. Pick one, edit names/links, post.

---

## Variant A — Hacker News (Show HN)

**Title** (max 80 chars):
```
Show HN: feynman – auto-inject ASCII diagram rules into Claude Code prompts
```

**Body:**
```
feynman is a Claude Code / Codex hook plugin that injects ASCII diagram
rules on every prompt. The thesis: when your question has structure —
flow, hierarchy, comparison, status — the response should *show* the
structure, not just describe it in prose.

It runs as a UserPromptSubmit hook (no `SessionStart` problem with
context compaction). On each prompt it appends ~4KB of rules telling the
model: classify shape → channel/amplify/suppress → pick smallest visual
that fits.

Three output style presets (short/middle/full) trade verbosity at
runtime. Built-in linter has 13 rules with autofix engine that converts
overdecorated frames to dot-leader lists in place.

Built it because I was tired of asking "show me as a tree" or "make it
a flowchart" every time I needed the model to actually draw something
instead of bullet-list it.

Zero npm dependencies, pure CommonJS, MIT. 364 tests, CI on macOS +
Linux.

GitHub:    https://github.com/apolenkov/feynman
npm:       @albinocrabs/feynman
Install:   npx @albinocrabs/feynman install

Three things you might find interesting in the repo:

1. eval/v0.4.0-compliance/REPORT.md — empirical A/B harness comparing
   v0.2.x and v0.3.x rule sets across 15 prompts; found 100% lint
   compliance + 31% verbosity gap, smallest-visual-first ladder
   intervention measured (hypothesis refuted, data preserved).

2. docs/lint-rules.md — the 13 rules with valid/invalid examples, source
   line cross-refs, and a token-cost comparison row per rule.

3. lib/lint/width.js — single visual-width source handling ANSI escapes,
   combining marks, ZWJ sequences, and CJK widechar in one place so L08
   (frame width) and L09 (right-edge alignment) and autofix never
   diverge.

Curious what other folks would build on top of the hook architecture.
```

---

## Variant B — Reddit r/ClaudeAI or r/programming

**Title** (60-80 chars):
```
I built a Claude Code plugin that draws ASCII diagrams when your question has structure
```

**Body** (Reddit allows longer + images):
```
**TL;DR:** [feynman](https://github.com/apolenkov/feynman) is a hook plugin
that makes Claude Code / Codex actually *draw* the answer when you ask
"show me the deploy pipeline" or "what's our repo structure" — without
having to add "as ASCII art" to every prompt.

## Before

> "Show me the deploy pipeline"
>
> The pipeline starts with a code commit. Then the CI system runs the build
> step. After that, tests execute. If tests pass, the artifact is deployed
> to staging. Finally, after manual approval, it goes to production.

## After (with feynman)

> "Show me the deploy pipeline"
>
> ```
> [commit] → [build] → [test] → [staging] → [production]
> ```

That's it. The plugin reads a 4KB rules file and appends it to every
prompt via `UserPromptSubmit`. The rules tell the model: classify the
question's shape (sequence / hierarchy / comparison / etc.), pick the
smallest visual that conveys it (arrow flow / tree / table / frame), and
suppress visuals on definition queries.

## What's in v0.4.0

- 13-rule linter (L01-L13) catches structural mistakes in the diagrams
  the model produces (orphan box corners, misaligned frames, padding
  > content, etc.)
- Autofix engine repairs misaligned frames in place
- Three output-style presets (`/feynman style short|middle|full`) for
  controlling verbosity per session
- Install targets: Claude Code, Codex, Cline, Cursor, Windsurf
- A/B compliance harness measuring the rules against an older version
  (results: 100% lint pass on both, +31% verbosity gap surfaced for
  follow-up research)

## How to install

```bash
cd your-project
npx @albinocrabs/feynman install --target claude
# or --target codex, cline, cursor, windsurf
```

Then restart Claude Code / Codex.

Repo: https://github.com/apolenkov/feynman
npm:  @albinocrabs/feynman (MIT, zero npm runtime deps)

Happy to answer questions about the hook architecture, the rules-file
budget (4480 bytes hard ceiling), or the linter rules.
```

---

## Variant C — Twitter/X (280 chars × thread)

**Tweet 1:**
```
Built a Claude Code plugin that makes the model actually *draw* the answer
when your question has structure.

You ask "show me the repo structure" — instead of bullets you get a tree.
"Compare REST vs GraphQL" — markdown table. Status of 4 tasks —
dot-leader list.

feynman: github.com/apolenkov/feynman
```

**Tweet 2:**
```
Architecture: a UserPromptSubmit hook that injects a 4KB rules file on
every prompt. The rules tell the model to classify shape →
channel/amplify/suppress → pick the smallest visual that fits.

No SessionStart problem — survives context compaction by design.
```

**Tweet 3:**
```
v0.4.0 ships with a 13-rule linter + autofix for ASCII diagrams,
three output-style presets (short/middle/full), and install targets for
Claude Code, Codex, Cline, Cursor, Windsurf.

Zero npm deps. MIT. 364 tests.

npx @albinocrabs/feynman install
```

**Tweet 4 (optional, technical):**
```
Most interesting bit imo: an A/B compliance harness comparing v0.2.x
(HTML-comment rules) vs v0.3.x (XML contract) across 15 prompts. Both
100% lint-compliant, but v0.3.x produces +31% longer responses. The
smallest-visual-first ladder I shipped closed only -3.5%. Hypothesis
refuted, data preserved in eval/REPORT.md.
```

---

## Pre-launch checklist

- [ ] npm token rotated (security debt, optional but recommended before traffic)
- [ ] README has a screenshot or animated gif (current is text-only — could record one with ttygif/asciinema)
- [ ] At least 1-2 GitHub stars on the repo (avoid 0-star Show HN — Anthropic plugin marketplace acceptance can wait)
- [ ] Logo replaced (pencil emoji → albino crab) — optional but nicer for first impression

## When to post

Best time for HN/Reddit dev posts:
- **Tuesday-Thursday, 8-11am ET** (HN front-page friendly)
- Avoid Mon morning (Show HN queue heavy)
- Avoid Friday afternoon (weekend traffic dies)

Reddit r/ClaudeAI specifically: any weekday morning works; the sub is small enough that timing matters less.

## Anti-patterns to avoid

- Don't post 3 variants in same week — exhausts goodwill
- Don't argue with HN comments about the verbosity gap finding — point at the REPORT.md and let the data speak
- Don't oversell — "13 rules + autofix + 3 install targets" is the honest scope, not "the future of AI coding"
