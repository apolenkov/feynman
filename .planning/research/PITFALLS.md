# Pitfalls: feynman

**Domain:** Claude Code hook plugin — UserPromptSubmit context injection
**Researched:** 2026-05-06
**Confidence:** HIGH (all major pitfalls verified against official issue tracker and docs)

---

## Hook Architecture Pitfalls

### Pitfall 1: stdout from UserPromptSubmit causes a hook error

**What goes wrong:**
Any text written to stdout by a UserPromptSubmit hook triggers "UserPromptSubmit hook error" in
the Claude Code UI, even on exit 0. The official docs say stdout is "added as context," but the
current runtime contradicts this — stdout breaks the hook silently in practice.

**Why it happens:**
Claude Code's runtime parses stdout from UserPromptSubmit hooks as JSON. Plain text fails JSON
parsing and the runtime surfaces an error rather than forwarding the text as context.

**Consequences:**
A feynman hook that does `echo "$RULES"` or any plain text output will show a red error on every
prompt. Users will uninstall immediately.

**Prevention:**
Use the JSON `hookSpecificOutput.additionalContext` path exclusively. Never emit plain text stdout.

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "<diagram rules markdown here>"
  }
}
```

**Detection:** Red "hook error" banner appears on every message in the Claude Code TUI.

**Phase:** Phase 1 (hook implementation). Must be resolved before any other testing.

**Sources:** [Issue #13912](https://github.com/anthropics/claude-code/issues/13912)

---

### Pitfall 2: Plugin-defined UserPromptSubmit hooks silently never execute

**What goes wrong:**
When the hook is defined inside `.claude-plugin/plugin.json` (the plugin manifest), it registers
and matches correctly but the command never executes. This is a confirmed runtime bug specific
to UserPromptSubmit — other hook types (SessionStart, PostToolUse) work fine in plugins.

**Why it happens:**
Claude Code uses a different execution path for plugin-vs-settings UserPromptSubmit hooks and the
plugin path has a gap. This was filed as a bug and closed as duplicate of a broader plugin
execution issue.

**Consequences:**
feynman's diagram rules would never inject. Every message would be rule-free with no error
signal — the worst kind of failure (silent).

**Prevention:**
Define the UserPromptSubmit hook in `~/.claude/settings.json` directly (via the install script),
not inside `plugin.json`. Use the plugin manifest only for SessionStart and other hooks that
work reliably.

**Workaround architecture:**
```
plugin.json  → SessionStart only (safe in plugins)
install.sh   → writes UserPromptSubmit entry to ~/.claude/settings.json
```

**Detection:** Add a `date >> /tmp/feynman-hook.log` at hook entry. If the log never appears,
the hook never ran.

**Phase:** Phase 1 (install design). Determines the entire install architecture.

**Sources:** [Issue #10225](https://github.com/anthropics/claude-code/issues/10225)

---

### Pitfall 3: Hook uses `~` in path — breaks when Claude starts from a subdirectory

**What goes wrong:**
`"command": "~/.claude/feynman/hook.js"` works when Claude is started from `$HOME` but silently
fails when started from any subdirectory. This is a confirmed Claude Code bug specific to
UserPromptSubmit hooks — PreToolUse hooks resolve `~` correctly in all cases.

**Why it happens:**
Path resolution for UserPromptSubmit hooks is tied to the working directory at startup, not
expanded from `$HOME`.

**Consequences:**
Developers who `cd ~/projects/foo && claude` (the normal usage) get no diagram rules injected.

**Prevention:**
Use the absolute expanded path in settings.json. Install script must write `$HOME` expanded:

```bash
# In install.sh
HOOK_PATH="$(realpath ~/.claude/feynman/hook.js)"
# Write $HOOK_PATH (not "~/.claude/feynman/hook.js") into settings.json
```

**Detection:** Hook works from `$HOME`, fails from any other directory.

**Phase:** Phase 1 (install script). Single line fix but easy to miss.

**Sources:** [Issue #8810](https://github.com/anthropics/claude-code/issues/8810)

---

### Pitfall 4: Rules injected via disabled plugin still execute

**What goes wrong:**
When feynman is "disabled" (set to false in `enabledPlugins`), its hooks continue to fire and
inject diagram rules into every message anyway. The user believes feynman is off but it isn't.

**Why it happens:**
Claude Code does not gate hook execution on the `enabledPlugins` flag — a confirmed open bug.
The only way to fully silence hooks is a full uninstall.

**Consequences:**
The `/feynman off` toggle skill appears to work (session flag cleared) but the hook continues
injecting rules. Users lose trust in the off switch.

**Prevention:**
The hook script itself must read a flag file and exit 0 silently when feynman is disabled:

```js
// hook.js
const flagFile = path.join(os.homedir(), '.claude', '.feynman-active');
if (!fs.existsSync(flagFile)) {
  process.exit(0); // silent, no output, no error
}
```

The `/feynman off` skill writes/removes the flag file. The hook checks it. This mirrors the
caveman flag-file pattern (`~/.claude/.caveman-active`).

**Detection:** Send a message after `/feynman off` — if diagram rules appear in Claude's
context, the hook is still injecting.

**Phase:** Phase 2 (/feynman toggle skill). Must design flag-file approach from the start.

**Sources:** [Issue #35713](https://github.com/anthropics/claude-code/issues/35713)

---

### Pitfall 5: Hook output exceeds 10,000-character cap

**What goes wrong:**
Claude Code caps `additionalContext` at 10,000 characters. If the injected rules markdown
exceeds this, the runtime saves it to a temp file and injects a file-path reference instead.
Claude then reads a file rather than having the rules inline — slower and potentially broken.

**Why it happens:**
Hard limit in the Claude Code runtime, not configurable.

**Consequences:**
Rules arrive as a file path reference. Claude may or may not read the file. Diagram behavior
becomes unreliable.

**Prevention:**
Keep `feynman-rules.md` under 8,000 characters (leaving headroom). Measure at build time:

```bash
wc -c feynman-rules.md  # must stay < 8000
```

All three intensity modes (lite/full/ultra) must be measured separately. The hook injects
only the active mode's rules, not all three.

**Detection:** Character count check in CI. Runtime symptom: Claude Code shows a temp-file
path in the hook output panel instead of inline text.

**Phase:** Phase 1 (rules authoring). Enforce as a CI check.

**Sources:** Official docs — hooks reference context size cap

---

## Rules Quality Pitfalls

### Pitfall 6: Imperative phrasing triggers Claude's prompt-injection defense

**What goes wrong:**
Rules phrased as commands ("Always draw a diagram when…", "You must use ASCII boxes for…")
can trigger Claude's built-in prompt-injection detector. Claude surfaces a warning to the user
or refuses to process the injected context.

**Why it happens:**
Claude's security layer distinguishes "trusted user instructions" from "untrusted injected
instructions." Out-of-band text that reads like system commands is flagged as potential injection.

**Consequences:**
Claude shows "prompt injection attack detected" warnings. Users are alarmed. Diagram rules
are ignored.

**Prevention:**
Write rules as declarative facts, not commands:

```
# BAD (imperative — triggers defense)
Always draw an ASCII diagram when the answer contains a flow.

# GOOD (declarative — reads as project context)
Responses that contain flows, hierarchies, or comparisons include an ASCII diagram.
Status summaries longer than 5 lines use a ┌─frame─┐ block.
```

The pattern: describe the expected behavior of the system, not instructions to the AI.

**Detection:** Claude Code shows "prompt injection" warning in the TUI. Test by injecting the
rules and asking for a response that would trigger a diagram.

**Phase:** Phase 1 (rules authoring). All rules must be audited before release.

**Sources:** [Issue #17804](https://github.com/anthropics/claude-code/issues/17804), [Claude Code hooks docs](https://code.claude.com/docs/en/hooks)

---

### Pitfall 7: Rules are too broad — diagrams appear on single-fact answers

**What goes wrong:**
Rules like "draw a diagram whenever there is any structure" cause Claude to generate ASCII
boxes for one-line answers, code-only responses, and direct factual questions. The user
experience degrades — diagrams feel spammy.

**Why it happens:**
The AI applies rules literally. Without precise negative conditions ("when NOT to draw"),
every response with any hierarchical token triggers diagram generation.

**Consequences:**
Users turn feynman off permanently. The product fails the "useful without being annoying" bar.

**Prevention:**
Rules must define both positive triggers AND explicit negative conditions:

```
Draw when:
- Flow or pipeline (A → B → C with meaningful steps)
- Hierarchy with 3+ levels
- Comparison of 2+ options across multiple criteria
- Status summary longer than 5 lines
- Priority ordering of 3+ items

Do NOT draw when:
- Single-fact answer ("What does X do?" → one sentence)
- Code block is the entire answer
- Answer is under 4 lines total
- User asked for prose explanation only
```

Calibration test: run 20 diverse prompts. Count diagram appearances. Target: diagram on
~30-40% of responses in full mode, ~15-20% in lite mode, ~60-70% in ultra.

**Detection:** Manual testing with short answers. If "What is 2+2?" triggers a diagram, the
rules are too aggressive.

**Phase:** Phase 1 (rules authoring) and Phase 3 (calibration testing).

---

### Pitfall 8: Rules are too passive — Claude ignores them under time pressure

**What goes wrong:**
Vague trigger conditions ("consider using a diagram when helpful") give the AI too much
discretion. Under token pressure (long conversations) or when the AI prioritizes brevity, it
skips diagrams entirely.

**Why it happens:**
Advisory language without clear thresholds is deprioritized by the AI when other
constraints compete. The longer the conversation, the less influential early-injected rules become.

**Consequences:**
feynman appears to do nothing. Users see no difference with or without the plugin.

**Prevention:**
Rules must have specific, measurable triggers — not suggestions:

```
# BAD (too passive)
Consider using ASCII diagrams when the answer might benefit from visual structure.

# GOOD (specific threshold)
When listing 3 or more steps that have sequential dependency: draw an ASCII flow diagram.
```

Also: rules re-injected on every prompt via hook remain "fresh" — this is actually an
advantage for feynman. The hook re-injection means rules are always in the immediate context,
not buried in conversation history.

**Detection:** Send 10 prompts that clearly match positive trigger conditions. If fewer than
7 produce diagrams, rules are too passive.

**Phase:** Phase 1 (rules authoring) and Phase 3 (calibration testing).

---

### Pitfall 9: Intensity modes conflict — ultra overrides caveman compression

**What goes wrong:**
Ultra mode forces diagrams even on short answers. Caveman ultra compresses everything to
minimal tokens. When both are ultra: caveman compresses the prose, feynman expands with a
diagram, net effect is undefined and potentially unpredictable.

**Why it happens:**
Two independent rule sets injected simultaneously can produce contradictory directives:
"be minimal" vs. "always visualize." The AI must choose.

**Consequences:**
Diagrams appear but the surrounding prose is caveman-compressed, producing stylistically
inconsistent output. Or the AI alternates between modes unpredictably.

**Prevention:**
Document the interaction table explicitly in README and in the rules file itself:

```
| feynman mode | caveman mode | Expected behavior                        |
|-------------|-------------|------------------------------------------|
| lite        | any         | Diagrams only for flow + trees           |
| full        | lite/full   | Diagrams per trigger; prose compressed   |
| full        | ultra       | Diagrams per trigger; prose ultra-short  |
| ultra       | ultra       | All responses get diagrams + ultra prose |
```

The rules file should note: "Diagram structure is additive. It does not override prose style."

**Phase:** Phase 2 (caveman coexistence). Test all matrix combinations.

---

## Caveman Coexistence Pitfalls

### Pitfall 10: Double injection bloats context on every prompt

**What goes wrong:**
Caveman injects its rules via UserPromptSubmit (mode-tracking hook). feynman injects diagram
rules via UserPromptSubmit. Both fire on every prompt. If each injects 3,000 characters,
every prompt starts with 6,000 characters of meta-instructions before Claude sees the question.

**Why it happens:**
There is no coordination mechanism between independent hooks. Each hook is isolated.

**Consequences:**
Context fills faster. Long sessions hit compaction earlier. Both plugins' rules are dropped
from context first during compaction (oldest context is pruned).

**Prevention:**
Keep feynman rules concise (target 1,500–2,500 chars for full mode). This is the primary
reason to have lite/full/ultra — lite stays under 1,000 chars.

Measure the combined injection budget:
```
caveman hook output: ~1,200 chars (mode tracking only)
feynman full rules: ~2,000 chars target
total per prompt: ~3,200 chars
```

At 30 prompts per session: ~96,000 chars (48K tokens) consumed by meta-instructions.
This is acceptable but must be monitored. Do not let rules grow without re-measuring.

**Detection:** `wc -c` on each hook's output. Add both. Track against the 10K cap.

**Phase:** Phase 2 (caveman coexistence validation).

---

### Pitfall 11: Hook ordering is undefined — caveman and feynman may race

**What goes wrong:**
Multiple UserPromptSubmit hooks in settings.json have no guaranteed execution order. If
caveman runs after feynman, caveman's context is appended after feynman's. If caveman runs
first, the order reverses. The AI sees both, but their relative positions in context differ.

**Why it happens:**
Claude Code documentation states hooks for the same event "can run in parallel." Execution
order within an event is not guaranteed.

**Consequences:**
In practice, the order likely doesn't matter for the AI (both are present). But if either hook
depends on reading the other's output (which they should not), it will fail.

**Prevention:**
Design feynman's hook to be entirely self-contained. Never read or depend on caveman's
flag files or output. The flag-file pattern (`~/.claude/.feynman-active`) is internal only.

Document for users: "feynman and caveman are independent. Hook order does not matter."

**Detection:** Check `~/.claude/settings.json` after installing both — confirm both entries
exist and neither references the other.

**Phase:** Phase 2 (coexistence testing).

---

### Pitfall 12: Skill namespace collision — /feynman triggers caveman commands

**What goes wrong:**
If caveman defines a `/feynman` command or any skills with overlapping descriptions, the AI
may invoke the wrong skill when the user types `/feynman`.

**Why it happens:**
Claude Code skill resolution uses description matching, not just exact name matching. Skills
whose descriptions overlap can both be offered or the wrong one invoked.

**Consequences:**
`/feynman lite` triggers a caveman mode switch instead of a feynman mode switch.

**Prevention:**
Check caveman's skill list before naming feynman skills. As of research date, caveman
exposes: `/caveman`, `/caveman-commit`, `/caveman-review`. The `/feynman` namespace is clear.

Use `disable-model-invocation: true` on `/feynman` and `/feynman-stats` to prevent Claude
from auto-invoking them. They are explicit user commands, not ambient skills.

**Detection:** Type `/feynman` in a session with both plugins active. Confirm only feynman
skills appear in autocomplete.

**Phase:** Phase 2 (skill definition).

---

## Install/Distribution Pitfalls

### Pitfall 13: Install script uses jq — breaks on Windows and minimal Linux

**What goes wrong:**
If `install.sh` uses `jq` to merge JSON into `~/.claude/settings.json`, it fails silently on
Windows (Git Bash) and minimal Linux containers where jq is not installed. This is the exact
bug that broke the official Ralph Wiggum plugin.

**Why it happens:**
`jq` is standard on developer macOS (via Homebrew) but not universally available. Plugin
authors assume their own environment is representative.

**Consequences:**
Hook entry is never written to settings.json. feynman appears installed (README says done)
but never activates. No error is shown because the install script may exit 0 anyway.

**Prevention:**
Write a pure-bash JSON merge using `sed`/`awk`, or use Node.js (already required by the hook
itself):

```bash
# Use node to merge settings.json — node is guaranteed present if Claude Code is installed
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.claude/settings.json';
const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : {};
// merge hook entry
fs.writeFileSync(p, JSON.stringify(s, null, 2));
"
```

Also: detect jq and print a clear error if it's missing rather than silently failing.

**Detection:** Test install.sh on a machine without jq (`which jq` returns nothing). The
hook entry should still appear in settings.json.

**Phase:** Phase 1 (install script authoring). Test on a vanilla Ubuntu container.

**Sources:** [Issue #14817](https://github.com/anthropics/claude-code/issues/14817)

---

### Pitfall 14: Install script is not idempotent — re-running duplicates the hook entry

**What goes wrong:**
Running `install.sh` a second time (update scenario) adds a second UserPromptSubmit entry
to settings.json without removing the first. Claude Code then fires feynman's hook twice
per prompt — double injection, doubled context cost, potentially doubled errors.

**Why it happens:**
Naive array-append to settings.json does not check for existing entries. Settings arrays
are replaced (not deep-merged) in Claude Code's merge strategy, so manual appends stack.

**Consequences:**
Diagram rules are injected twice. Context cost doubles. Users on slow connections notice.

**Prevention:**
The install script must:
1. Parse existing settings.json
2. Remove any existing feynman hook entries (identified by a stable marker or the hook path)
3. Insert the new entry

```bash
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.claude/settings.json';
const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : {};
if (!s.hooks) s.hooks = {};
if (!s.hooks.UserPromptSubmit) s.hooks.UserPromptSubmit = [];
// Remove existing feynman entries
s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit.filter(
  h => !h.description || !h.description.includes('feynman')
);
// Add current entry
s.hooks.UserPromptSubmit.push({ description: 'feynman diagram rules', hooks: [{ type: 'command', command: '$HOOK_PATH' }] });
fs.writeFileSync(p, JSON.stringify(s, null, 2));
"
```

**Detection:** Run `install.sh` twice. Count UserPromptSubmit entries in settings.json.
Should be exactly 1.

**Phase:** Phase 1 (install script authoring). Must be correct before first public release.

---

### Pitfall 15: Uninstall path leaves orphaned settings.json entries

**What goes wrong:**
A user uninstalls feynman (removes the repo/plugin) but the hook entry in settings.json
remains. The hook command path no longer exists. Claude Code fires the hook, gets a
"command not found" error, and shows a red error banner on every message.

**Why it happens:**
Claude Code has no plugin lifecycle hooks for install/uninstall events as of research date
(feature request open, not shipped). Cleanup must be explicit.

**Consequences:**
The user gets hook errors after uninstalling. They blame Claude Code or their own config.
Trust is damaged.

**Prevention:**
Ship an `uninstall.sh` that removes the settings.json entry (same logic as install, but
removes rather than upserts). Document it prominently in README.

Alternatively: the hook script itself should check if feynman's rules file exists and
exit 0 silently if not. This makes orphaned entries self-healing:

```js
// hook.js — graceful degradation if feynman is removed
const rulesPath = path.join(__dirname, 'feynman-rules.md');
if (!fs.existsSync(rulesPath)) {
  process.exit(0); // silent — feynman was uninstalled, don't error
}
```

**Detection:** Delete the feynman directory. Start Claude Code. No error should appear.

**Phase:** Phase 1 (install script). Design for removal from day one.

**Sources:** [Feature request #11240](https://github.com/anthropics/claude-code/issues/11240)

---

## Skill/Command Pitfalls

### Pitfall 16: SKILL.md description too vague — Claude auto-invokes /feynman on unrelated prompts

**What goes wrong:**
A `/feynman` skill with description "manage diagram settings" gets auto-invoked by Claude
whenever the user mentions diagrams, settings, or visualization — even when the user just
wants Claude to draw a diagram naturally, not toggle a mode.

**Why it happens:**
Claude auto-invokes skills whose description matches the semantic content of the prompt.
A skill about "diagram settings" matches too many queries.

**Consequences:**
The user asks "draw a flow diagram of this code" and `/feynman` activates instead of Claude
just drawing the diagram. Unexpected behavior.

**Prevention:**
Add `disable-model-invocation: true` to both `/feynman` and `/feynman-stats`. These are
explicit user commands, not ambient assistance:

```yaml
---
name: feynman
description: Toggle feynman diagram injection on/off and switch intensity modes (lite/full/ultra)
disable-model-invocation: true
---
```

**Detection:** Ask Claude "show me a diagram of X" with feynman installed. The `/feynman`
skill should NOT appear in the response. Claude should just draw the diagram.

**Phase:** Phase 2 (skill implementation).

**Sources:** [Claude Code skills docs — disable-model-invocation](https://code.claude.com/docs/en/skills)

---

### Pitfall 17: Skill content stays in context for the full session — long SKILL.md is a recurring cost

**What goes wrong:**
Once `/feynman` is invoked, its SKILL.md content enters the conversation and stays there
for the entire session (Claude Code re-attaches skills after compaction, up to 5,000 tokens
each). A verbose SKILL.md with instructions, examples, and mode documentation costs tokens
on every subsequent turn.

**Why it happens:**
Skill content lifecycle: loaded once on invocation, stays in context, re-attached after
compaction within a 25,000-token shared budget across all invoked skills.

**Consequences:**
Users who run `/feynman` to check status pay a context cost for the rest of the session.
If both `/feynman` and `/feynman-stats` are invoked, the budget is consumed faster.

**Prevention:**
Keep SKILL.md content under 300 lines. `/feynman` needs only:
1. How to toggle on/off (write flag file)
2. How to switch modes (write mode to flag file)
3. Current state readout

Move examples and background to supporting files referenced but not loaded automatically.

**Detection:** Invoke `/feynman`, then check context usage indicator. Should not add more
than ~500 tokens to session cost.

**Phase:** Phase 2 (skill implementation).

---

### Pitfall 18: /feynman-stats requires session state — no native session memory in hooks

**What goes wrong:**
Tracking "how many diagrams were drawn this session" requires counting across turns. Hooks
have no access to conversation history. There is no shared session state between hook
invocations.

**Why it happens:**
Each hook invocation is an isolated process. `UserPromptSubmit` receives only the current
prompt — not previous turns. There is no built-in session counter.

**Consequences:**
`/feynman-stats` either returns 0 always, or requires a workaround that is brittle.

**Prevention:**
Use a session-scoped temp file keyed on `$CLAUDE_SESSION_ID` (available as an environment
variable in hooks). The hook increments a counter on each invocation. The stats skill reads
the file:

```js
// In hook.js — count injections per session
const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';
const countFile = path.join(os.tmpdir(), `feynman-${sessionId}.count`);
const count = fs.existsSync(countFile) ? parseInt(fs.readFileSync(countFile, 'utf8')) : 0;
fs.writeFileSync(countFile, String(count + 1));
```

The stats skill reads the same file. Clean up on session end (PostToolUse on Stop event).

**Alternative:** Accept that stats = "prompts with feynman active" (hook invocations), not
actual diagram render count. This is simpler and honest.

**Detection:** Run 5 prompts with feynman active. `/feynman-stats` should report 5.

**Phase:** Phase 2 (stats skill). Design the session-file approach before implementing.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Hook output format | stdout causes errors (Pitfall 1) | Use JSON additionalContext only |
| Plugin vs settings hook | Silent no-execute (Pitfall 2) | Ship hook in settings.json via install.sh |
| Path in settings.json | Tilde expansion breaks (Pitfall 3) | Expand to absolute path in install script |
| Rules phrasing | Injection defense triggers (Pitfall 6) | Declarative facts, not commands |
| Rules scope | Too broad = spam (Pitfall 7) | Explicit negative conditions |
| Install script deps | jq not present (Pitfall 13) | Use Node.js for JSON manipulation |
| Update flow | Duplicate hook entries (Pitfall 14) | Idempotent upsert pattern |
| Uninstall | Orphaned hook causes errors (Pitfall 15) | Self-healing hook + uninstall.sh |
| feynman off toggle | Disabled plugin still injects (Pitfall 4) | Flag-file check at hook entry |
| Two hooks active | Context bloat from double injection (Pitfall 10) | Keep rules under 2,500 chars |
| Skill descriptions | Auto-invocation on diagram queries (Pitfall 16) | disable-model-invocation: true |
| Stats tracking | No session memory in hooks (Pitfall 18) | Session-keyed temp file |

---

## Sources

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) — official docs, output format, context cap
- [Claude Code skills reference](https://code.claude.com/docs/en/skills) — SKILL.md format, frontmatter, lifecycle
- [Issue #13912 — stdout causes UserPromptSubmit error](https://github.com/anthropics/claude-code/issues/13912)
- [Issue #10225 — plugin UserPromptSubmit hooks never execute](https://github.com/anthropics/claude-code/issues/10225)
- [Issue #8810 — subdirectory path resolution failure](https://github.com/anthropics/claude-code/issues/8810)
- [Issue #17804 — prompt injection false positive](https://github.com/anthropics/claude-code/issues/17804)
- [Issue #35713 — disabled plugin still injects](https://github.com/anthropics/claude-code/issues/35713)
- [Issue #14817 — undocumented jq dependency breaks Windows](https://github.com/anthropics/claude-code/issues/14817)
- [Issue #32057 — rules re-injected on every tool call](https://github.com/anthropics/claude-code/issues/32057)
- [Issue #11240 — no plugin install/uninstall lifecycle hooks](https://github.com/anthropics/claude-code/issues/11240)
- [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) — reference implementation patterns

---

## v0.5.0 Verbosity Economy — Additional Pitfalls

**Added:** 2026-05-11
**Scope:** A/B measurement harness, brevity rule-writing, release gates, budget compaction

---

### M1: Claiming effect size without confidence intervals (harness-build phase)

**Warning sign:** Report says "20% improvement" with no CI bounds.
**Why it fails:** With n=50 and binary pass/fail, the 95% Wilson CI half-width is ≈±14 pp.
A 10% effect is statistically invisible; 20% is right at the noise floor.
**Prevention:** Use paired design — run each of the 50 prompts through both control and
treatment in the same session, measure within-prompt delta, test with Wilcoxon signed-rank.
Paired analysis collapses between-prompt variance; 50 pairs is sufficient for 10–15 pp effects.
Report: median delta + IQR + Wilson CI, not a bare percentage.

---

### M2: Corpus coverage bias — all prompts from one shape class (harness-build phase)

**Warning sign:** Distribution of shapes in the 50-prompt set clusters around status frames
or sequences; state machines, mapping pairs, and suppression cases are absent.
**Prevention:** Stratify — at least 3 prompts per shape class from the trigger table
(`rules/feynman-activate.md` `<triggers>`), plus ≥5 "suppress" cases (definitions, greetings,
questions). Unbalanced corpus overfits to covered shapes and cannot generalize.

---

### M3: Session carry-over — prompts are not i.i.d. (harness-build phase)

**Warning sign:** All 50 prompt pairs run in a single session; earlier responses alter model
behavior for later ones (context accumulation).
**Prevention:** Each prompt pair gets a fresh session. No carry-over context.

---

### R1: Brevity rule collapses amplify → suppress (rules-edit phase)

**Warning sign:** Control arm produces a diagram; treatment arm produces prose only.
**Why it fails:** A "keep responses short" instruction pushes borderline amplify decisions
into suppress — the model drops the diagram entirely to hit the word budget.
This directly inverts feynman's purpose.
**Prevention:** Scope the brevity constraint to prose-around-visual only. Phrase as
"shorten prose *surrounding* the diagram, not the diagram itself." Never express budget as
a total word count that includes code-fenced or ASCII blocks.

---

### R2: Caption brevity makes diagrams decorative (rules-edit phase)

**Warning sign:** Few-shot `├──` count in the rules file drops below 6 (test at
`tests/hook.test.js:600`). Node labels shrink to single letters.
**Why it fails:** `[A] → [B]` saves tokens but communicates nothing. The diagram becomes
decoration, not information.
**Prevention:** Preserve full node labels in `<examples>` blocks. The test at line 600
(≥6 `├──`) is a mechanical proxy for label completeness — treat it as a hard gate.

---

### R3: Word-budget rule conflicts with ASCII token cost (rules-edit phase)

**Warning sign:** Treatment arm passes a word-count check but diagram rate drops versus
control.
**Why it fails:** Frame blocks are token-heavy. A total-words budget forces the model to
trade the diagram for shorter prose.
**Prevention:** Express budget as "prose words, excluding code-fenced blocks" or exclude
`<intensity>` content from counting. Verify by measuring diagram rate separately from
word count in the harness.

---

### R4: New brevity rule silently drops a `<contract>` keyword (rules-edit phase)

**Warning sign:** `npm test` fails on "contract missing word" (`tests/hook.test.js:577–584`).
**Why it fails:** Compacting the `<contract>` section to free 333 bytes will break the
test if any of `classify`, `channel`, `amplify`, or `suppress` is removed. The same risk
applies to the suppression classes: `definition`, `recommendation`, `question`, `greeting`
(lines 593–598).
**Prevention:** `npm test` is the complete oracle for compaction safety. Run it, read all
failures, never ship with a red assertion. The byte-ceiling test (≤4480, line 551) does
not catch content-shape violations — byte count can pass while contract words are lost.

---

### G1: Winning on 50-prompt corpus, regressing on v0.4.0 harness (release-gate phase)

**Warning sign:** 50-prompt A/B score improves; v0.4.0 15-prompt harness score drops.
**Why it fails:** The 15-prompt v0.4.0 corpus covers a different shape distribution. A rule
tuned on 50 prompts can degrade behavior on shapes it never saw.
**Prevention:** Run both corpora before release. Treat the v0.4.0 15-prompt harness as the
regression gate, not a deprecated artifact.

---

### G2: Verbosity metric improves, readability drops (release-gate phase)

**Warning sign:** Token count falls 15%; spot-check of 10 treatment-arm responses shows
diagrams with terse unlabeled nodes.
**Prevention:** Supplement the metric with a readability spot-check — at minimum, manually
review 5–10 "after" samples from the treatment arm for label completeness before declaring
a win. A diagram that saves tokens but confuses the reader is a regression, not a win.

---

### B1: Compaction passes byte gate but breaks structural invariants (rules-edit phase)

The byte-ceiling assertion at `tests/hook.test.js:551` (≤4480 bytes) is a necessary but not
sufficient gate. Compaction that stays under the ceiling can still silently break:

- `lite`/`full`/`ultra` sections become empty or identical (lines 624–627)
- SDLC patterns block loses the "one-of" / "select ONE" / "mutex" marker (line 586–590)
- suppression guidance drops one of the four required class names (lines 593–598)
- few-shot density falls below ≥6 `├──` or ≥6 `→` (lines 600–607)

**Warning sign:** byte count passes; `npm test` red on any content-shape assertion.
**Prevention:** `npm test` after every edit to the rules file. The full 8-assertion suite
at lines 541–629 is the compaction oracle — not just the byte count.
