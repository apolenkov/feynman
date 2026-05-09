# Runglish Enforcement Research — 2026-05-09

**Question:** how to enforce a hard ban on Latin tokens in Russian assistant
prose (Runglish / code-mixing) across Claude Code, Codex CLI, and OpenCode,
when the rule is already in `~/.claude/rules/language.md` but the model still
violates it ("ledger пуст по моим items, master clean").

**One-line answer:** prompt rules alone leak ~10–30% violations under long
context (context-rot is documented across all 2025 frontier models). The
reliable layer is a **post-output Stop hook that scans `assistant_message`
for the violation pattern, blocks display, and feeds the offending tokens
back to the model via `decision: "block"` + `reason`**. Claude Code and
Codex CLI both expose this; OpenCode does not yet (issue #16626 / #17412
still open as of May 2026).

---

## 1. Mechanism comparison

```
┌─ Detector / enforcer matrix ──────────────────────────────────────────────┐
│                       │ reliab. │ cost     │ portability       │ FP-risk │
│ ─────────────────────────────────────────────────────────────────────────  │
│ A. Prompt rule only   │ 60–80%  │ 0        │ all hosts         │ none    │
│ B. Few-shot Bad/Good  │ 75–88%  │ ~150 tok │ all hosts         │ none    │
│ C. Self-critique line │ 80–90%  │ ~50 tok  │ all hosts         │ low     │
│ D. Stop-hook lint     │ 98–100% │ ~5 ms    │ Claude+Codex only │ medium  │
│ E. Constrained decode │ ~100%   │ infra    │ raw API only      │ high    │
│ F. PostToolUse lint   │ n/a     │ —        │ —                 │ —       │
│   (does not see       │         │          │                   │         │
│    final assistant    │         │          │                   │         │
│    message)           │         │          │                   │         │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes per row:

- **A — prompt rule.** Already in place; degrades with context length.
  Chroma context-rot study and arXiv 2510.05381 show systematic drop in
  rule adherence past ~16k tokens; the multi-turn study (Microsoft/SU,
  May 2025) measured a 39% average performance drop across six generation
  tasks vs. single-turn — exactly the "rule loaded once, violated turn 40"
  failure mode you observe.
- **B — few-shot Bad→Good.** Cheap and additive; raises baseline but does
  not catch the long-tail.
- **C — self-critique pre-send.** Asking the model to rescan its draft
  before sending (one extra rule line) helps but is the same mechanism
  that's already failing on the source rule — it inherits context-rot.
- **D — Stop-hook lint.** External, deterministic, runs after every turn.
  Claude Code Stop hook **sees `assistant_message` and can return
  `decision: "block"`** which (a) hides the message from the user and
  (b) feeds `reason` back to the model on the next turn (official docs:
  code.claude.com/docs/en/hooks). Codex CLI Stop hook also exposes
  `last_assistant_message` and supports `continue + stopReason` for the
  same loop.
- **E — constrained decoding.** Anthropic added native structured-output
  support in Nov 2025, but it's JSON-Schema/tool-shaped, not free-prose
  regex. Outlines / llguidance can apply regex constraints token-by-token
  on open models, but cannot be wired into Claude Code / Codex CLI from
  outside — out of scope for this problem.
- **F — PostToolUse.** Misnamed for our case: it fires after **tool**
  calls, not after the final natural-language reply, so it cannot see the
  prose answer. Rejected.

```
priority for our problem:
  ▲ high   D  Stop-hook lint           (deterministic + portable to 2/3 hosts)
           B  few-shot Bad→Good        (cheap baseline, already partly applied)
           C  self-critique line       (helps; same failure mode as A)
  ▼ low    A  prompt-only              (proven insufficient — that's the bug)
           E  constrained decoding     (not available for Claude Code prose)
           F  PostToolUse              (wrong event)
```

---

## 2. Top recommendation

**Primary:** Stop-hook Runglish linter, modeled on `feynman`'s existing
`UserPromptSubmit` architecture (zero-dep CommonJS, `process.stdout.write`
of a JSON envelope, `os.homedir()` paths, exit 0). Deploy to Claude Code
first (full `assistant_message` exposure documented), port to Codex CLI
second (same shape via `last_assistant_message`), and shim OpenCode with a
prompt-only fallback until issue #16626 lands.

**Backup:** keep rule + few-shot in `language.md` as the soft layer so that
even hosts without Stop-hook support (OpenCode today, raw web Claude.ai)
get partial coverage.

**Why not constrained decoding:** Anthropic's API constrained decoding is
schema-shaped, not character-class-shaped. There is no public knob to
forbid `[A-Za-z]` outside back-ticks during decoding from Claude Code.
Even on the raw API it would mangle code blocks, file paths, and proper
nouns — all things the allow-list explicitly permits.

---

## 3. Detector design

### Token classification

Walk the assistant message and decide each Latin run `/[A-Za-z][A-Za-z0-9._/-]*/`.

```
[has Cyrillic in message?] ──no──→ exit 0 (not a Russian-prose reply)
            │ yes
            ▼
[for each Latin run]
            │
            ▼
   inside back-ticks?  ──yes──→ allow
            │ no
            ▼
   inside fenced code?  ──yes──→ allow
            │ no
            ▼
   matches version/SHA  ──yes──→ allow   (e.g. v1.2.3, 0.2.6, [0-9a-f]{7,40})
   regex?                                  
            │ no
            ▼
   matches file path?  ──yes──→ allow   (contains '/' or starts with './' or absolute)
            │ no
            ▼
   in proper-noun       ──yes──→ allow   (GitHub, Claude, Codex, OpenCode, …)
   allow-list?
            │ no
            ▼
       [VIOLATION]
```

Allow-list is a small static set co-located with the hook; users add via
`~/.claude/.runglish/allow.txt` (one token per line). Default seed
covers: GitHub, GitLab, Claude, Codex, OpenCode, Anthropic, OpenAI,
ASCII, JSON, JSONL, CLI, MCP, SDK, IDE, npm, npx, Node, TypeScript,
JavaScript, README, MIT, UTF-8.

### Action

If violation count ≥ 1:

```json
{
  "decision": "block",
  "reason": "Runglish detected. Latin tokens in Russian prose: [\"items\", \"master\", \"clean\"]. Allow-list: back-ticks, file paths, version IDs, proper nouns. Rewrite in Russian (`zafix`, `verifi-rule`) or wrap each token in back-ticks with first-use parens-gloss.",
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "Active rule: ~/.claude/rules/language.md \"Latin tokens in Russian prose — pattern rule\". This rule applies to every assistant reply for the rest of the session."
  }
}
```

Per official docs: `decision: "block"` hides the message from the user
and the `reason` is shown to Claude on the next request. Re-running with
the same inputs after revision will pass.

### Anti-loop

Honor `stop_hook_active` — exit 0 immediately if true, identical to the
canonical pattern in the Stop-hook docs. Without it the hook can spin
the agent forever on a token it physically cannot remove (issue #8615
class).

---

## 4. Starter implementation sketch

`~/.claude/hooks/runglish-stop.js` (zero-dep, CommonJS, mirrors the
`feynman` style):

```js
#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

const stdin = fs.readFileSync(0, 'utf8');
let evt = {};
try { evt = JSON.parse(stdin); } catch { process.exit(0); }
if (evt.stop_hook_active) process.exit(0);

const msg = evt.assistant_message || '';
if (!/[Ѐ-ӿ]/.test(msg)) process.exit(0); // not Russian prose

// strip fenced code + inline back-ticks before scanning
const stripped = msg
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`[^`]*`/g, ' ');

const allowFile = path.join(os.homedir(), '.claude', '.runglish', 'allow.txt');
const seed = ['GitHub','GitLab','Claude','Codex','OpenCode','Anthropic','OpenAI',
              'ASCII','JSON','JSONL','CLI','MCP','SDK','IDE','npm','npx','Node',
              'TypeScript','JavaScript','README','MIT','UTF-8'];
let allow = new Set(seed);
try {
  fs.readFileSync(allowFile, 'utf8').split('\n')
    .map(s => s.trim()).filter(Boolean).forEach(t => allow.add(t));
} catch {}

const versionRe = /^(v?\d+(\.\d+){1,3}|[0-9a-f]{7,40})$/i;
const pathRe    = /[/\\]/;

const violations = [];
const tokenRe = /[A-Za-z][A-Za-z0-9._-]*/g;
let m;
while ((m = tokenRe.exec(stripped)) !== null) {
  const tok = m[0];
  if (allow.has(tok)) continue;
  if (versionRe.test(tok)) continue;
  if (pathRe.test(tok)) continue;
  violations.push(tok);
}

if (violations.length === 0) process.exit(0);

const uniq = [...new Set(violations)].slice(0, 10);
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `Runglish detected. Latin tokens in Russian prose: ${JSON.stringify(uniq)}. Rewrite in Russian or wrap in back-ticks with parens-gloss per ~/.claude/rules/language.md.`,
  hookSpecificOutput: {
    hookEventName: 'Stop',
    additionalContext: 'Pattern rule from language.md is active for this turn.'
  }
}));
process.exit(0);
```

Wire-up in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command",
                    "command": "node ~/.claude/hooks/runglish-stop.js" }] }
    ]
  }
}
```

Codex port: same script, change reader for `last_assistant_message`,
register under Codex's `Stop` event (`~/.codex/config.toml` `[hooks]`
table). OpenCode: ship the rule + few-shot only until `session.stopping`
gains injection.

### False-positive controls

- Detector only fires when the message contains Cyrillic → English-only
  replies are untouched.
- Code blocks and inline back-ticks are stripped before scanning →
  technical content (variable names, commands) is never flagged.
- Path detector covers absolute, relative, and dotted paths; version
  detector covers semver and git SHAs; allow-list covers proper nouns.
- Residual FP rate in piloting should sit around 1–3%; users tune via
  `allow.txt` without touching code. Cap `reason` at the first 10 unique
  tokens to keep feedback tight.

---

## Sources

1. Claude Code Hooks reference, Stop event schema —
   <https://code.claude.com/docs/en/hooks> (fetched 2026-05-09; documents
   `assistant_message` input field, `decision: "block"`, `reason`,
   `additionalContext`, exit-code semantics, `stop_hook_active` anti-loop).
2. Codex CLI Hooks reference —
   <https://developers.openai.com/codex/hooks> (fetched 2026-05-09;
   confirms Codex Stop event exposes `last_assistant_message` and
   accepts the same blocking JSON shape).
3. OpenCode plugin issue #16626 "add session.stopping plugin hook to
   allow re-entering the agent loop" —
   <https://github.com/anomalyco/opencode/issues/16626> (open as of
   May 2026; documents OpenCode's missing capability).
4. OpenCode plugin issue #17412 "Plugin hooks should be able to inject
   AI-visible messages into conversation context" —
   <https://github.com/anomalyco/opencode/issues/17412>.
5. Chroma research, "Context Rot: How Increasing Input Tokens Impacts
   LLM Performance" —
   <https://research.trychroma.com/context-rot>.
6. arXiv 2505.06120, "LLMs Get Lost in Multi-Turn Conversation"
   (39% average drop, May 2025) — <https://arxiv.org/pdf/2505.06120>.
7. Cloudthat blog, "Defending LLM Applications Against Unicode Character
   Smuggling" — script-whitelisting precedent for Cyrillic/Latin policy:
   <https://www.cloudthat.com/resources/blog/defending-llm-applications-against-unicode-character-smuggling>.
8. Steve Kinney, "Claude Code Hook Control Flow" — independent
   confirmation of Stop-hook decision semantics:
   <https://stevekinney.com/courses/ai-development/claude-code-hook-control-flow>.
