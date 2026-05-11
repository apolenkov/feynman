# Stack: feynman v0.5.0 «Verbosity Economy»

**Milestone:** v0.5.0 — measuring and closing the +31% verbosity gap
**Researched:** 2026-05-11
**Scope:** eval harness, text metrics, statistical validity, prior art

---

## 1. LLM Evaluation Frameworks

The core constraint: the existing harness runs via Claude Code subagents with **no separate API key**. All evaluation options below are assessed against that constraint.

| Tool | Version/License | API-key-free? | Verdict |
|------|-----------------|---------------|---------|
| `promptfoo` | latest / MIT | **No** — rubric assertions default to OpenAI for grading; needs external LLM even when testing local models | **Reject** for this project. Requires external grading LLM. |
| `braintrust/autoevals` | latest / Apache-2.0 | **No** — BRAINTRUST_API_KEY optional but core grading calls an LLM | **Reject** — same problem. |
| `LangSmith` | SaaS + SDK / MIT SDK | **No** — cloud-first, requires LangChain account | **Reject** — cloud dependency. |
| `Arize Phoenix` | latest / Apache-2.0 | **Yes** — fully self-hosted, no cloud account | Too heavy (Python, Docker). Not worth the setup for 50-prompt suite. |
| `Langfuse` | MIT / self-host | **Yes** — Docker self-host or cloud | Same as Phoenix: Python server overkill for a 7-arm × 50-prompt eval. |
| **Existing subagent harness** | internal / N/A | **Yes** — uses Claude Code's built-in auth | **Keep**. Already works, zero new dependencies, aligned with zero-dep philosophy. |

**Recommendation:** Stay with the existing subagent-based harness. None of the frameworks eliminate the API-key requirement while adding value over the current approach. The harness measures char-count, word-count, lint compliance, and diagram ratio — all computable without an external grading model.

---

## 2. Node.js Text Analysis

These metrics are needed per response: char-count, word-count, sentence-count, estimated token-count, prose-vs-diagram ratio.

| Library | Version | License | Zero deps? | What it does | Verdict |
|---------|---------|---------|------------|--------------|---------|
| `tokenx` | 1.3.0 (Jan 2026) | MIT | **Yes** — 2kB bundle | Token estimation at ~96% accuracy vs full tokenizer | **Use** for token-count column in the 7-arm matrix |
| `text-count` | — | — | unknown (403 on fetch) | chars + words + sentences + lines | **Skip** — unverifiable; trivial to implement inline |
| `words-count` | — | MIT | likely | word count with CJK support | Overkill; `text.split(/\s+/).length` covers the need |
| `word-count` | — | MIT | likely | word count with CJK | Same — not needed |

**Recommendation:** Implement metrics as a single ~40-line inline helper (`lib/eval/metrics.js`):

```js
// All pure Node.js, zero deps
function measure(text) {
  return {
    chars: text.length,
    words: text.trim().split(/\s+/).length,
    sentences: (text.match(/[.!?]+/g) || []).length,
    // tokenx formula: chars / 4 is the standard rough estimate
    tokensEstimated: Math.ceil(text.length / 4),
    diagramLines: (text.match(/^[│├└┌┐┘─┼┤┬┴]/gm) || []).length,
    totalLines: text.split('\n').length,
  };
}
```

Use `tokenx` only if per-model accuracy matters; the `/4` approximation is accurate enough for comparing arm deltas (same model, same prompts). HIGH confidence this is sufficient for relative comparisons.

---

## 3. Statistical Validity at N=50

**Key finding from the literature** (Cameron Wolfe, "Applying Statistics to LLM Evaluations"):

- CLT-based confidence intervals become unreliable below N=100.
- Detecting a 10% effect size at p<0.05 with 80% power requires ~N=200+ with standard tests.
- At N=50, CLT assumptions may fail and CIs are overconfident.

**Practical options for v0.5.0:**

| Approach | N=50 valid? | Notes |
|----------|-------------|-------|
| Two-sample t-test (char-count delta) | Marginal — works if distribution is roughly normal | OK for a directional signal, not for publication |
| Paired t-test (same prompt × two arms) | **Yes** — variance reduction makes N=50 workable | **Recommended**: same 50 prompts in all 7 arms eliminates between-prompt variance |
| Wilcoxon signed-rank (nonparametric) | **Yes** — no normality assumption, valid at N=50 | Use as backup check alongside paired t-test |
| Bootstrap CI (1000 resamples) | **Yes** — model-free, works at any N | Best for reporting; pure JS, ~20 lines |
| Binary sign test on per-prompt winner | Valid at N=50 (binomial exact test) | Simplest — count how many of 50 prompts arm X beats baseline |

**Recommended harness design:** Paired measurement — run all 7 arms on the **same** 50 prompts. Report:
1. Mean char-count delta vs baseline per arm.
2. Paired t-test p-value (or Wilcoxon signed-rank as a sanity check).
3. Bootstrap 95% CI on the delta.
4. Binary: how many of 50 prompts show ≥-20% reduction?

Effect size threshold −20% at N=50 via paired test is statistically reachable (MEDIUM confidence). Going to N=100 would make claims more robust; flagged for CORP-01.

---

## 4. Prior Art: Prompt Brevity Techniques

Evidence from Anthropic official docs (current), claude-token-efficient repo, and The Prompt Report survey.

**Confirmed interventions that reduce output length (HIGH confidence — Anthropic official docs):**

| Technique | Example instruction | Expected effect |
|-----------|--------------------|--------------------|
| **A. Caption brevity** — explicit word budget | `"Respond in ≤N words."` / `"Keep captions to ≤5 words."` | Directly caps length per item |
| **B. No-narration** — strip filler | `"No preamble. No closing remarks. Skip 'Sure!', 'Great question', 'I hope this helps'."` | Removes ~10-20% boilerplate (drona23 measured -63% in extreme form) |
| **C. Response-length budget** — explicit total | `"Keep text between diagrams to ≤25 words. Final responses ≤100 words unless task requires more."` | Broadest scope; Anthropic internal guideline for Claude Code |
| **D. Positive examples** | Show a concise reference response | More effective than telling the model what NOT to do (Anthropic confirmed) |
| **E. Format constraint** | `"Use bullet points only. No preamble."` | Structural constraint blocks narrative expansion |
| **F. Chain of Draft (CoD)** | Constrain words per reasoning step | Reduces latency + tokens; matches CoT accuracy |

The A/B/C nomenclature in the v0.5.0 REQUIREMENTS maps directly to techniques A, B, C above — this is confirmed prior art, not speculative. HIGH confidence each reduces verbosity; exact magnitude varies by model and prompt type.

**Note:** Anthropic explicitly states that positive examples outperform negative prohibitions. The ABC candidate rule files should include a short concrete "good response" example rather than just prohibitions.

---

## Confidence Levels

| Area | Confidence | Source |
|------|------------|--------|
| Eval frameworks (API key required) | HIGH | WebSearch + official docs for promptfoo, braintrust |
| tokenx library details | HIGH | GitHub README (johannschopplich/tokenx) |
| Inline metrics implementation | HIGH | Standard JS, no library needed |
| N=50 statistical validity | MEDIUM | Cameron Wolfe substack, LLM eval statistics literature |
| Paired t-test + bootstrap recommendation | HIGH | Standard statistics |
| Prompt brevity techniques A/B/C | HIGH | Anthropic official prompting docs (May 2026), drona23 repo |
| CoD technique | MEDIUM | arxiv 2024, single source |

---

## Sources

- [promptfoo/promptfoo — GitHub](https://github.com/promptfoo/promptfoo)
- [Promptfoo FAQ](https://www.promptfoo.dev/docs/faq/)
- [braintrustdata/autoevals — GitHub](https://github.com/braintrustdata/autoevals)
- [tokenx — GitHub (johannschopplich)](https://github.com/johannschopplich/tokenx)
- [Applying Statistics to LLM Evaluations (Cameron Wolfe)](https://cameronrwolfe.substack.com/p/stats-llm-evals)
- [Prompting best practices — Anthropic official docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [claude-token-efficient (drona23)](https://github.com/drona23/claude-token-efficient)
- [The Prompt Report, arXiv 2406.06608](https://arxiv.org/abs/2406.06608)
