> **DRAFT — pending review**

## Why

The `establish-feynman-openspec-baseline` change identified `rules-injection` as a required
follow-up capability spec (task 2.1). The SessionStart hook lifecycle that delivers diagram rules to
the assistant at session start is shipped and in use, but carries no recorded OpenSpec contract.
This change documents that lifecycle as a durable spec so future changes to
`hooks/feynman-session-start.ts` or `hooks/feynman-activate.ts` have a baseline to diff against.

## What Changes

- Add the `rules-injection` capability spec: the full SessionStart hook lifecycle — session_id
  path-traversal guard, flag-file check, state.json read (enabled flag + Intensity), and matched
  rule injection. Documents the disabled fast-exit path and the output format difference between
  SessionStart (plain text stdout) and the legacy UserPromptSubmit path (JSON wrapper with
  `hookSpecificOutput`), including the no-trailing-newline constraint.
- No behavior change. This is documentation of already-shipped behavior as an OpenSpec contract;
  neither hook file is modified.

## Non-goals

- No modification to `hooks/feynman-session-start.ts` or `hooks/feynman-activate.ts`.
- Not specifying the `output_style` suffix appended in `feynman-activate.ts` Step 5.5 — that is
  orthogonal to the core injection lifecycle and may be its own spec.
- Not specifying the malformed-rules fallback (`MALFORMED_FALLBACK`) in detail — covered briefly
  under resilience but not formally contracted here.
- Not re-litigating the SessionStart-over-UserPromptSubmit decision — that is tracked as ADR 3.3
  in the baseline change.

## Capabilities

### Added Capabilities

- `rules-injection`: the SessionStart hook lifecycle — path-traversal guard → flag-file → state
  (enabled/Intensity) → inject matched rules; disabled state injects nothing; plain text for
  SessionStart, JSON wrapper for legacy UserPromptSubmit, no trailing newline.

## Impact

- New: `openspec/specs/rules-injection/` (on archive).
- Source of truth grounding: `hooks/feynman-session-start.ts`, `hooks/feynman-activate.ts`.
- No code changes; no test changes.
