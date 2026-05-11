# Architecture: feynman v0.5.0 «Verbosity Economy» — eval harness

**Domain:** Claude Code hook plugin (ASCII diagram rule injection)
**Updated:** 2026-05-11  
**Scope of this update:** eval harness design for v0.5.0 50-prompt × 7-arm run

---

## Q1 — Corpus structure (50 prompts)

**Decision: augment the existing 15, total = 50.** 35 new prompts added to `eval/v0.5.0-verbosity/prompts.json`. Do NOT replace Phase 11 baseline — continuity of the +31% number requires seq/hier/comp/status IDs to match.

Target distribution (includes existing 15):

| class         | count | existing | new |
|---------------|-------|----------|-----|
| sequence      | 6     | 2        | 4   |
| hierarchy     | 6     | 2        | 4   |
| comparison    | 6     | 2        | 4   |
| status        | 6     | 2        | 4   |
| priority      | 4     | 1        | 3   |
| branching     | 4     | 1        | 3   |
| state-machine | 4     | 1        | 3   |
| mapping       | 4     | 1        | 3   |
| none          | 10    | 3        | 7   |
| **total**     | **50**| 15       | 35  |

### Coverage axes (mandatory per class)

- **Size boundary:** `status` must include 3-item, 5-item (L11 boundary), 9-item variants.
- **Domain variance:** spread across CI/CD, auth, finance, biology, ops, data. Not all engineering.
- **Phrasing variance:** 50% explicit ("show as tree"), 50% implicit ("describe the structure").
- **`none` sub-types:** definition, single-answer, recommendation, opinion, conversational — 2 per type.
- **Boundary flag:** add `"boundary": true` to one prompt per class for focused analysis.

Schema extension to `prompts.json`:

```json
{
  "id": "status-03",
  "class": "status",
  "prompt": "...",
  "boundary": true,
  "phrasing": "implicit",
  "domain": "finance"
}
```

---

## Q2 — Parallel execution strategy (7 arms × 50 prompts)

**Decision: option (b) — phased waves.**

```
Wave 1 (3 parallel subagents)              Wave 2 (4 parallel subagents)
  v0.2.x baseline                            v0.4.x + A (caption brevity)
  v0.3.x current                             v0.4.x + B (no-narration)
  v0.3.x + ladder                            v0.4.x + C (response-length budget)
                                             v0.4.x + ABC (combined)
         │
         ▼
  Sanity gate: compare total-chars vs Phase 11
  If drift > 10% on any arm → ABORT, investigate
  If pass → spawn Wave 2
```

**Why not option (a):** 7 concurrent subagents exceeds the 4-5 cap (global `CLAUDE.md`) — ECONNRESET risk.  
**Why not option (c) 25+25 split:** Phase 11 ran 15 prompts per subagent without timeout. Sonnet finishes 50 in 5-15 min. Orchestration overhead of split > savings.

**Smoke run (mandatory before Wave 1):** re-run the v0.2.x baseline twice. Document variance band. Minimum detectable effect = 2× variance. Candidates below this band cannot be reliably ranked.

---

## Q3 — REPORT.md synthesis

**Decision: small aggregator script + manual verdicts.**

Add `eval/v0.5.0-verbosity/aggregate.js` (~100 LoC, zero deps, CommonJS) that reads `results-*.json` and emits markdown tables with all numeric cells filled.

```
aggregate.js reads:
  results-v02.json
  results-v03.json
  results-v03-ladder.json
  results-arm-A.json
  results-arm-B.json
  results-arm-C.json
  results-arm-ABC.json

Automates:
  total chars per arm
  per-class mean chars
  % delta vs v0.2.x baseline
  % delta vs v0.3.x current
  lint pass rate per arm
  diagram-presence count per class

Manual (requires human judgment):
  WIN / HURT / NEUTRAL verdicts per class per arm
  root-cause prose
  recommendation: which arm ships as v0.5.0 winner
```

7 arms × 9 classes = 63 delta cells — computing these by hand is the highest defect risk in this milestone.

---

## Q4 — Winner application

**Decision: candidates stay in `eval/`; single commit copies winner.**

```
eval/v0.5.0-verbosity/
  rules-v02.md              ← baseline (read-only)
  rules-v03.md              ← baseline (read-only)
  rules-v03-ladder.md       ← baseline (read-only)
  rules-arm-A.md            ← caption brevity candidate
  rules-arm-B.md            ← no-narration candidate
  rules-arm-C.md            ← budget candidate
  rules-arm-ABC.md          ← combined candidate

After REPORT.md verdict:
  cp eval/v0.5.0-verbosity/rules-arm-<winner>.md rules/feynman-activate.md
  git commit "feat(v0.5.0): apply <arm> verbosity reduction"
```

No feature branch unless the winner also requires hook/lint changes (compaction to free 333 bytes MAY touch adjacent code — assess at report time).

---

## Component map (v0.5.0 additions)

```
eval/
└── v0.5.0-verbosity/
    ├── prompts.json          ← 50-prompt corpus (extends Phase 11 set)
    ├── aggregate.js          ← auto-compute numeric REPORT cells
    ├── rules-v02.md          ← baseline (symlink or copy)
    ├── rules-v03.md          ← baseline (symlink or copy)
    ├── rules-v03-ladder.md   ← baseline (symlink or copy)
    ├── rules-arm-A.md        ← caption brevity
    ├── rules-arm-B.md        ← no-narration
    ├── rules-arm-C.md        ← response-length budget
    ├── rules-arm-ABC.md      ← combined ABC
    └── REPORT.md             ← generated tables + manual verdicts
```

Subagent contract (unchanged from Phase 11):

```
stdin:  { rules_text, prompts[], model }
stdout: { arm, results: [{ id, class, response, chars, lint_pass, has_diagram }] }
```

---

## Open questions at milestone start

| # | Question | Decision needed by |
|---|----------|--------------------|
| 1 | Which baseline files to symlink vs copy into v0.5.0 dir? | Corpus authoring |
| 2 | Does arm-ABC require 333 bytes freed from rules? | Arm file authoring |
| 3 | Smoke-run variance band — if >15%, is 50 prompts enough? | Wave 1 execution |
| 4 | Does winner need a feature branch if compaction touches hook code? | REPORT.md verdict |
