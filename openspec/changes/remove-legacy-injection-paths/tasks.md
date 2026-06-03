## 1. Phase 1 — remove the legacy HTML-comment format

- [ ] 1.1 In `lib/feynman-state.ts`, make `readRulesForIntensity` XML-only: delete
  the HTML-comment marker fallback block (the `<!-- selected -->` open/close
  logic) and its comments. A file with no `<intensity>` tags returns `''`.
- [ ] 1.2 Update/remove the format tests: delete the activate-hook "Path 11:
  HTML-comment legacy fallback" suite and the `session-start legacy fallback (H1)`
  test; keep the XML and unbalanced-tag tests. Gate green. Commit.
- [ ] 1.3 Apply the `rules-injection` spec delta for the format: the MODIFIED
  "the rule block matching the active Intensity is injected" requirement (XML-only,
  no legacy scenario). Run `openspec validate --specs --strict`. Gate green. Commit.

## 2. Phase 2 — delete the legacy UserPromptSubmit hook

- [ ] 2.1 Delete `hooks/feynman-activate.ts` (this also removes `MALFORMED_FALLBACK`).
- [ ] 2.2 In `lib/feynman-state.ts`, remove the `malformed_rules` field from the
  `FeynmanState` interface (set/cleared only on the deleted path). Keep the
  `count→injections` migration untouched.
- [ ] 2.3 Repoint the hook path in `bin/cli/targets.ts` and `bin/commands/install.ts`:
  `HOOK_PATH`/`_hookExt` target `feynman-session-start.ts`; `hookCommandFor`
  returns the session-start command directly; remove the
  `.replace(HOOK_PATH, SESSION_HOOK_PATH)` line in `installHookTarget`.
- [ ] 2.4 KEEP `isFeynmanHookCommand` in `bin/cli/settings.ts` matching
  `feynman-activate.ts/.js`; add a test asserting `install`/`uninstall` still
  removes a pre-existing v0.6.x UserPromptSubmit feynman hook. Gate green. Commit.
- [ ] 2.5 Apply the rest of the `rules-injection` spec delta: REMOVED (UserPromptSubmit
  malformed-fallback; UserPromptSubmit output_style; SessionStart/UserPromptSubmit
  output wrapper) and ADDED (SessionStart output_style suffix; SessionStart plain-text
  stdout). Run `openspec validate --specs --strict`. Commit.
- [ ] 2.6 Amend `docs/adr/0003-sessionstart-over-userpromptsubmit-injection.md`
  with a dated note that the legacy UserPromptSubmit hook is now removed (ADR-0005
  amend-style). Commit.

## 3. Reference sweep and final gate

- [ ] 3.1 Grep every reference to `feynman-activate` (the hook, not
  `feynman-activate.md`), `UserPromptSubmit`, `MALFORMED_FALLBACK`, and
  `malformed_rules` across `tests/`, `docs/` (architecture.md, README.md,
  PRIVACY.md, CONTRIBUTING.md, `skills/feynman/SKILL.md`,
  token-economy-planning.md), `scripts/` (build-package.ts, release-smoke.ts,
  feynman-highlight.ts), and `evals/evals.json`; update or remove each. Leave the
  legacy-cleanup matcher (task 2.4) intact.
- [ ] 3.2 `git add` the new/changed files (drift-guard sees only git-tracked
  files — stage before `test:docs`), then run the full gate: `npm run typecheck`,
  `npm run eslint`, `npm test`, `npm run test:docs` — all green. Commit any
  remaining sweep edits.
- [ ] 3.3 Reconcile the superseded commit `8ba73c9` on
  `chore/post-merge-debt-cleanup` per the user's decision (rework to keep only the
  `assertTagPairs` hoist, or confirm it is moot because legacy is now gone).
