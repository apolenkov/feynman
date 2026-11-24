## Why

Dependabot opens a pull request per dependency and per ecosystem on each check, which floods the repository. The owner asked for version updates once a month across all repositories, and one pull request per repository instead of many.

## What Changes

Run Dependabot version updates monthly. Put the npm root, npm `/tools/codex` and github-actions entries into one multi-ecosystem group, so one version pull request covers them. Group security updates per ecosystem with a `*` pattern. Limit open pull requests to 2 for the group and each member.

## Impact

Affects `.github/dependabot.yml` only. No dependency versions change in this change. Security updates keep their own Dependabot limits and are not scheduled.

## Non-goals

- Changing the pinned night-scan tool entry for `/tools/ocr`. It keeps its own monthly schedule and stays outside the group, because its bumps need policy and lock review together.
- Changing CI workflows, dependency versions or the TypeScript ignore rule.
- Merging any open Dependabot pull request as part of this change.
