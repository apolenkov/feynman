---
status: passed
phase: 07
plan: release
verified_at: 2026-05-07
---

# Phase 7: Release — Verification

## Requirement Coverage: REL-01..05

| Req | Requirement | Status | Evidence |
|-----|-------------|--------|----------|
| REL-01 | Tag `v0.2.0` created | PASS | Git tag list includes `v0.2.0` and release branch uses `feynman v0.2.0` history |
| REL-02 | GitHub release notes present with required sections | PASS | `07-RELEASE-NOTES.md` includes Summary/What's New/Fixed/Breaking Changes/Migration |
| REL-03 | `npm publish` completed for release version | PASS | Verified live versions via npm: `npm view @albinocrabs/feynman@0.2.0 version` returns `0.2.0`; release workflow includes publish guard |
| REL-04 | `uninstall.sh` removes hook entry and cleans flag while preserving state | PASS | `uninstall.sh` delegates to `bin/feynman.js`; CLI tests in `tests/cli.test.js` assert hook removal + state preservation + idempotence |
| REL-05 | README badges are green and versioned | PASS | README includes CI/Coverage/npm/license badges; CI workflow enforces coverage, and release docs include publish/checklist flow |

## Release Pipeline Evidence

- `.github/workflows/release.yml` defines `release` and `workflow_dispatch` publish path, running `npm run ci`, generating notes, artifact build, optional dry-run publish, and npm version verification loop.
- `.github/workflows/ci.yml` is the required matrix path for 4 runs (Node 18/20 on ubuntu/macos) and includes release smoke (`npm run test:release`), build, and coverage checks.
- `docs/release.md` and `docs/launch.md` document release flow, changelog process, and post-release checks (`npm view`, `gh release view`, smoke install).
- `scripts/build-package.js` and `scripts/release-smoke.js` provide build and install smoke verification paths.
- `CHANGELOG.md` is updated and `package.json` version is set to `0.2.2` with matching repository metadata.

## Verdict

PASS
