## Context

`rules-injection` has two injection hooks and two rules formats, but production
exercises exactly one of each:

- **Format.** The shipped `rules/feynman-activate.md` is pure XML
  (`<intensity name="…">` ×3, zero `<!-- -->` markers). `readRulesForIntensity`
  still carries an HTML-comment fallback for a format nothing emits.
- **Hook.** `hooks/feynman-activate.ts` is the UserPromptSubmit hook. It is
  already vestigial: `bin/commands/install.ts` builds the installed command as
  `hookCommandFor(target).replace(HOOK_PATH, SESSION_HOOK_PATH)` — swapping the
  activate path for `feynman-session-start.ts` — and registers a `SessionStart`
  entry only. `hooks/hooks.json` registers `SessionStart` only. The activate file
  survives solely as the `.replace()` source token and the `.ts`/`.js` probe.

This change deletes both. End state: one SessionStart hook, XML-only extraction.

Discovered while mapping the delta (recorded so the implementing session does not
re-derive it): the requirement "UserPromptSubmit appends an output_style suffix"
states "The SessionStart path SHALL NOT append any suffix", but the SessionStart
hook code, the A04 tests, and the M1 `applyOutputStyle` consolidation all show
SessionStart **does** append. That spec line is stale drift, independent of
legacy. Removing the UserPromptSubmit-centric requirement is the natural moment to
re-home the behavior on SessionStart and correct the drift.

## Goals / Non-Goals

**Goals:**
- Single injection path (SessionStart) and single format (XML) in code and spec.
- Old v0.6.x UserPromptSubmit installs still get cleaned up by `install`/
  `uninstall` even though the hook file is gone.
- The spec ends self-consistent: every surviving requirement describes the
  SessionStart, XML-only reality — including output_style on SessionStart.

**Non-Goals:**
- No change to the XML format, SessionStart injection logic, the state store
  (ADR-0004/0005), or the lint engine.
- Not renaming `rules/feynman-activate.md` (it is the rules markdown, not the
  deleted hook).
- No deprecation window for the HTML-comment format — nothing shipped uses it.

## Decisions

**1. Delete `hooks/feynman-activate.ts` outright (not deprecate).**
It is unreachable from every live install path, so there is nothing to deprecate.
`MALFORMED_FALLBACK` is defined inside it and dies with it. *Alternative —
keep-but-warn:* rejected; a hook no install registers cannot warn.

**2. `readRulesForIntensity` becomes XML-only.**
Drop the HTML-comment marker block and its comments; a file with no `<intensity>`
tags returns `''`. *Alternative — keep the fallback "just in case":* rejected; it
documents and tests a format the project never produces.

**3. Remove `FeynmanState.malformed_rules`.** Only the deleted UserPromptSubmit
path set or cleared it. Keep the `count→injections` migration (unrelated legacy).

**4. Repoint the hook path; drop the `.replace()` indirection.**
`HOOK_PATH`/`_hookExt` in `bin/cli/targets.ts` and `bin/commands/install.ts`
target `feynman-session-start.ts`; `hookCommandFor` returns the session-start
command directly and the `.replace(HOOK_PATH, SESSION_HOOK_PATH)` line in
`installHookTarget` is removed. *Alternative — leave the probe pointing at the
deleted file:* rejected; `_hookExt` would mis-detect packaging once the file is
gone.

**5. KEEP `isFeynmanHookCommand` matching `feynman-activate.ts/.js`.**
Deleting the file must not lose the ability to clean up users who installed the
v0.6.x UserPromptSubmit hook. `install` (migration) and `uninstall` still scan
`SessionStart`/`UserPromptSubmit`/`Stop` and remove any feynman command,
including the legacy activate path. A test pins this backward-compatible cleanup
so a future "tidy the matcher" edit cannot silently break it. *Alternative —
strip the matcher with the file:* rejected; it would strand old installs.

**6. Amend ADR-0003.** ADR-0003 chose SessionStart over UserPromptSubmit; this
change is its conclusion. Add a dated amendment note (the style ADR-0005 used to
amend ADR-0004), not a silent deletion.

**7. Two-phase tasks for clean apply commits.** Phase 1 removes the format
(extraction + spec + tests); phase 2 removes the hook (file, path rewire, state
field, cleanup-matcher test, ADR, spec). Each commit keeps the gate green.

## Risks / Trade-offs

- **A test or doc references the deleted hook and breaks the gate** → Mitigation:
  the implementing session greps every `feynman-activate` / `UserPromptSubmit` /
  `MALFORMED_FALLBACK` / `malformed_rules` reference across `tests/`, `docs/`, and
  `scripts/` and updates each; the full gate after every commit catches a miss.
- **Stranding old v0.6.x installs** → Mitigation: Decision 5 keeps the cleanup
  matcher plus a regression test.
- **`output_style`-on-SessionStart drift fix scope-creeps** → Mitigation: it is
  confined to re-homing one existing requirement onto the path that already runs
  it; no code behavior changes (SessionStart already appends).

## Migration Plan

No user migration: no live install used the deleted paths. Old UserPromptSubmit
installs are cleaned up automatically on the next `install`/`uninstall` (Decision
5). Rollback is `git revert` of the apply commits.

## Open Questions

- **Supersedes commit `8ba73c9`** on the unmerged branch
  `chore/post-merge-debt-cleanup` ("fix(hooks): inject legacy HTML-comment rules
  on session-start"). That commit aligned SessionStart *to* the legacy format —
  which this change removes. Before that branch merges, its H1 commit should be
  reworked to keep only the shared `assertTagPairs` hoist (still valid) and drop
  the legacy-injection half. Whether to rework-then-merge or hold the branch until
  this change lands is a decision left to the user.
