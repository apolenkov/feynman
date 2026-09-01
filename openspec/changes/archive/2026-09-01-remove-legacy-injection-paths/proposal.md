## Why

The rules-injection subsystem still carries two dead legacy paths that no shipped
artifact uses. The rules file `rules/feynman-activate.md` is pure XML
(`<intensity name="…">`), yet `readRulesForIntensity` keeps an HTML-comment
fallback (`<!-- full -->…<!-- /full -->`) for a format no longer produced. And
`hooks/feynman-activate.ts` — the UserPromptSubmit hook — is already vestigial:
`install` registers only a SessionStart entry (it rewrites the activate path to
`feynman-session-start.ts`), and `hooks/hooks.json` registers SessionStart only.
The hook file survives as a `.replace()` source token and a `.ts`/`.js` probe.

Carrying two formats and two injection paths that can never both run is dead
weight: it forces every reader (and every future change) to reason about a
UserPromptSubmit path and a legacy format that production never exercises, and it
keeps spec requirements documenting behavior no live code path produces.

## What Changes

- Remove the legacy HTML-comment rules format. `readRulesForIntensity` becomes
  XML-only; a file with no `<intensity>` tags yields no block.
- **BREAKING (vestigial):** delete the legacy UserPromptSubmit hook
  `hooks/feynman-activate.ts`. Only the SessionStart hook
  (`hooks/feynman-session-start.ts`) remains. No live install path used it, so no
  current install changes behavior.
- Remove `MALFORMED_FALLBACK` and the `FeynmanState.malformed_rules` field — both
  live only on the deleted UserPromptSubmit path.
- Repoint `HOOK_PATH` / `_hookExt` in `bin/cli/targets.ts` and
  `bin/commands/install.ts` to `feynman-session-start.ts` and drop the
  `.replace(HOOK_PATH, SESSION_HOOK_PATH)` indirection.
- **Keep** `isFeynmanHookCommand` matching `feynman-activate.ts/.js`: deleting the
  file must not break cleanup of users' pre-existing v0.6.x UserPromptSubmit
  installs on `install`/`uninstall`.
- Amend ADR-0003 to record that the legacy UserPromptSubmit hook is now removed.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `rules-injection`: remove the requirements and scenarios describing the legacy
  HTML-comment format and the UserPromptSubmit hook path; the surviving
  requirements describe a single SessionStart, XML-only injection path.

## Impact

- **Deleted:** `hooks/feynman-activate.ts`.
- **Code:** `lib/feynman-state.ts` (XML-only extraction, drop `malformed_rules`),
  `bin/cli/targets.ts` + `bin/commands/install.ts` (repoint hook path),
  `bin/cli/settings.ts` (keep the legacy cleanup matcher, with a test).
- **Spec:** `openspec/specs/rules-injection/spec.md` (delta).
- **Docs:** ADR-0003 amendment; mechanical reference sweep across
  `docs/architecture.md`, README, PRIVACY, CONTRIBUTING, `skills/feynman/SKILL.md`,
  and the build/release scripts is delegated to the implementing session.
- **Tests:** the UserPromptSubmit/activate and legacy-format suites in `tests/`
  are removed or retargeted; a backward-compatible-cleanup test is added.
- **Supersedes** commit `8ba73c9` on the unmerged branch
  `chore/post-merge-debt-cleanup`, which aligned SessionStart *to* the legacy
  format — exactly what this change removes (see design.md).

## Non-goals

- No change to the XML `<intensity>` format, the SessionStart hook's behavior, the
  `output_style` suffix on SessionStart, the state store (ADR-0004/0005), or the
  lint engine.
- Not renaming the rules file `rules/feynman-activate.md` (it is the rules
  markdown, not the deleted hook) — out of scope.
- No new capability and no behavior change to any live install path.
