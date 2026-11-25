## Why

Dependabot opens a pull request per dependency and per ecosystem on each check, which floods the repository. The owner asked for version updates once a month across all repositories, and one pull request per repository instead of many.

## What Changes

Run Dependabot version updates monthly. Put the npm root, npm `/tools/codex` and github-actions entries into one multi-ecosystem group, so one version pull request covers them. Group security updates per ecosystem with a `*` pattern. Limit open pull requests to 2 for the group and each member.

## Impact

Affects `.github/dependabot.yml` only. No dependency versions change in this change. Security updates keep their own Dependabot limits and are not scheduled.

TASK-922 removed the nightly factory and its `/tools/ocr` tool, so the OCR scenario was dropped.

## Non-goals

- Changing CI workflows, dependency versions or the TypeScript ignore rule.
- Merging any open Dependabot pull request as part of this change.
