# Phase 4: Quality (Tests + CI) - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated

<domain>
## Phase Boundary

100% test coverage of `hooks/`, `lib/lint/`, `bin/` via node:test. GitHub Actions CI on Linux+macOS. Coverage badge in README.

**Delivers:**
- tests/hook.test.js — UserPromptSubmit hook e2e (5 paths)
- tests/lint.test.js — every L01-L08 rule + golden cases pass
- tests/lint-hook.test.js — Stop-hook tests
- tests/install.test.js — install/uninstall idempotency, settings.json merge
- .github/workflows/ci.yml — matrix Linux+macOS, node:test, c8 coverage
- README badge for CI status + coverage
- package.json with test/coverage scripts (light deps for c8 only)

</domain>

<decisions>

- **D-01:** Use `node:test` (built-in) as test runner — zero deps for tests themselves.
- **D-02:** Use `c8` for coverage (lightweight, only test-time dep).
- **D-03:** Tests live in `tests/*.test.js`. Run via `node --test tests/`.
- **D-04:** Coverage target ≥95% line for `hooks/`, `lib/lint/`, `bin/`.
- **D-05:** CI runs on push + PR to main, matrix `ubuntu-latest` + `macos-latest`, Node 18 + 20.
- **D-06:** Coverage badge — use shields.io with c8 percentage parsed from CI artifact OR codecov. Decision: shields.io static updated by CI (simpler).
- **D-07:** Hook tests use temp dirs via `os.tmpdir()` to avoid polluting `~/.claude/`.
- **D-08:** Install tests stub HOME to temp dir.

</decisions>

<canonical_refs>
- .planning/REQUIREMENTS.md — TEST-01..06
- hooks/feynman-activate.js — target for hook.test.js
- lib/lint/* — target for lint.test.js
- tests/lint-cases.json — golden cases to consume
- install.sh — target for install.test.js (use bash to invoke, check stdout/state)
</canonical_refs>

<code_context>
- node:test API: `describe`, `it`, `before`, `after`, assertions via `node:assert/strict`
- c8 invocation: `c8 --reporter=text --reporter=lcov node --test tests/`
- package.json scripts: `test`, `coverage`, `ci`
</code_context>

<specifics>
- Tests must run in <30s total — use temp dirs, no real I/O outside fixtures
- Each test file isolated — no shared state
- CI must fail loudly on coverage <95%
</specifics>

<deferred>
- Property-based testing — v0.3.0
- Mutation testing — v0.3.0
- Visual regression for ASCII output — v0.3.0
- Windows CI — v0.3.0
</deferred>

---
*Phase: 4-Quality-Tests-CI*
