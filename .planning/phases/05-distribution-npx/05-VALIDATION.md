---
phase: 05
slug: distribution-npx
status: reconstructed
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
source:
  - 05-SUMMARY.md
  - 05-VERIFICATION.md
---

# Phase 05 — Validation Strategy

This file was reconstructed after execution from existing `SUMMARY` and
`VERIFICATION` artifacts. No new implementation tests were generated.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` + `c8` |
| **Config file** | `package.json` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run coverage && npm pack --dry-run` |
| **Estimated runtime** | ~10 seconds |

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run coverage`
- **Before release verification:** Run `npm pack --dry-run`
- **Max feedback latency:** ~10 seconds

## Per-Requirement Verification Map

| Requirement | Behavior | Test Type | Automated Command | Evidence | Status |
|-------------|----------|-----------|-------------------|----------|--------|
| NPX-01 | Package metadata includes scoped package fields, bin, files, and Node engine | unit/package | `npm test` | `05-VERIFICATION.md`, `tests/package.test.js` | green |
| NPX-02 | Unified CLI exposes install, uninstall, doctor, lint, version | unit/cli | `npm test` | `05-VERIFICATION.md`, `tests/cli.test.js` | green |
| NPX-03 | npm publication works from packaged artifact | release/deferred | `npm pack --dry-run` | Local artifact verified in `05-VERIFICATION.md`; live publish deferred to Phase 7 | green |
| NPX-04 | `install.sh` delegates to `bin/feynman.js install` | unit/shell | `npm test` | `05-VERIFICATION.md`, `tests/install.test.js` | green |
| NPX-05 | README install surface is npx-first with fallback/manual paths | docs | `node bin/feynman-lint.js README.md` | `05-SUMMARY.md`, `05-VERIFICATION.md` | green |
| NPX-06 | `feynman doctor` checks hook/state/rules and prints status frame | unit/cli | `npm test` | `05-VERIFICATION.md`, `tests/cli.test.js` | green |
| NPX-07 | Codex target support writes and checks `~/.codex/hooks.json` | unit/cli | `npm test` | `05-VERIFICATION.md`, `tests/cli.test.js` | green |
| NPX-08 | Claude/Codex plugin metadata is included in the npm artifact | package | `npm test && npm pack --dry-run` | `05-VERIFICATION.md`, `tests/package.test.js` | green |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- `tests/cli.test.js`
- `tests/install.test.js`
- `tests/package.test.js`
- `bin/feynman.js`
- `package.json`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Public npm availability | NPX-03 | Phase 5 intentionally deferred live publication to Phase 7 | Verify during release with `npm view @albinocrabs/feynman version` and fresh install smoke test |

## Validation Sign-Off

- [x] All in-scope behaviors have automated verification or explicit release-phase deferral
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency under 10 seconds for quick suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** reconstructed 2026-05-08
