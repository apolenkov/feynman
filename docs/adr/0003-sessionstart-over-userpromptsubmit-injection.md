---
status: accepted
---

# SessionStart over UserPromptSubmit for rule injection

Rule injection — loading `rules/feynman-activate.md` into the model context —
happens once at `SessionStart`, not on every turn via `UserPromptSubmit`.
`UserPromptSubmit` is retained as a legacy path but is not the primary
injection site.

## Context

The original implementation used `UserPromptSubmit` exclusively: on every
prompt the hook read `state.json`, extracted the matching intensity block, and
wrote rules into `additionalContext`. This worked but accumulated several
painful constraints driven by Claude Code bugs:

- **#13912** — `UserPromptSubmit` requires JSON-wrapped output
  (`hookSpecificOutput.additionalContext`); plain text stdout triggers a red
  "hook error" banner in the UI. `SessionStart` accepts plain stdout with no
  wrapper.
- **#17804** — Imperative phrasing in repeatedly-injected context triggers
  Claude's prompt-injection defense and may be filtered or reinterpreted.
  Per-turn injection amplifies exposure to this filter; a single session-start
  injection does not.
- **#8810** — Tilde-expansion for `~/.claude` is unreliable; `os.homedir()`
  must be used. Both hooks carry this fix, but per-turn injection means the
  path resolution runs on every prompt, multiplying the surface area for
  regressions.
- **#35713** — A flag file (`~/.claude/.feynman-active`) is required as a
  lightweight enabled/disabled signal because reading `state.json` on every
  prompt is an extra I/O round-trip that could race with `feynman enable/disable`
  writes.
- **#10225** — `hooks` is not a recognised key in `plugin.json`; hooks must be
  registered in `settings.json`. Per-turn hooks installed via `plugin.json`
  silently do nothing, making UserPromptSubmit injection invisible in certain
  install paths.

The cumulative effect: a `UserPromptSubmit` hook that works correctly requires
JSON wrapping, flag-file gating, homedir resolution, and correct install-target
awareness — four independent failure modes on every single prompt.

`SessionStart` sidesteps most of this: it fires once per session, accepts plain
stdout, needs no JSON wrapper, and is not subject to the prompt-injection
defense because the rules arrive before the conversation begins.

## Decision

`hooks/feynman-session-start.ts` is the primary injection hook. It runs at
`SessionStart`, reads `state.json` (or bootstraps it on first run), extracts the
intensity block, and writes the rules text to stdout. No JSON wrapper.
No per-prompt I/O.

`hooks/feynman-activate.ts` is kept as the `UserPromptSubmit` hook to maintain
backward compatibility with installs that predate `SessionStart` support and to
provide the injection counter (`state.injections`) that tracks lifetime usage.
It carries all the JSON-wrapping and flag-file logic that `SessionStart` does
not need.

## Consequences

- Fresh sessions receive rules in context immediately, before the first user
  prompt arrives.
- The `UserPromptSubmit` hook retains its JSON output format and flag-file check,
  but is not load-bearing for injection correctness in a current install.
- Any future refactor that removes `UserPromptSubmit` must preserve the
  `injections` counter or migrate it elsewhere.
- Documentation and specs describing the hook lifecycle must mention both hooks
  and clarify which is primary (see `docs/architecture.md`).
- The `FEYNMAN_HOME` environment variable allows both hooks to serve Claude Code
  (`~/.claude`) and Codex (`~/.codex`) from the same binary without path
  hardcoding.
