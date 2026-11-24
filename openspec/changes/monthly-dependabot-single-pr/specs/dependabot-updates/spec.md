## ADDED Requirements

### Requirement: Monthly dependency version updates

Dependabot version updates SHALL run monthly for every configured package ecosystem and for every multi-ecosystem group.

#### Scenario: Schedule declared for each entry

- **WHEN** `.github/dependabot.yml` is parsed
- **THEN** every update entry and the multi-ecosystem group declare `schedule.interval: monthly`

### Requirement: One version pull request per repository

Version updates for the members of the shared multi-ecosystem group SHALL be raised in one pull request per scheduled run.

#### Scenario: Several members have updates in the same run

- **WHEN** a scheduled run finds version updates for the npm root, npm `/tools/codex` and github-actions members
- **THEN** Dependabot opens one pull request for the group

### Requirement: Bounded open pull requests

Each version update entry and the multi-ecosystem group SHALL allow at most 2 open version pull requests.

#### Scenario: Limit value checked

- **WHEN** `.github/dependabot.yml` is validated
- **THEN** every `open-pull-requests-limit` value is 2 or less

### Requirement: Pinned tool outside the group

The `/tools/ocr` entry SHALL NOT be a member of the shared multi-ecosystem group, so that its bumps keep their own review.

#### Scenario: Pinned tool has a new version

- **WHEN** Dependabot finds a new version of the pinned night-scan tool
- **THEN** it opens its own pull request and does not add the bump to the group pull request
