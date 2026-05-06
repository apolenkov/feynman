# Contributing to feynman

Contributions welcome. This guide covers setup, what to work on, and
how to get a PR merged.

---

## Quick Start

```bash
git clone https://github.com/apolenkov/feynman
cd feynman
npm install
npm test
```

Tests use Node's built-in `node:test` runner — no external test framework
needed.

Lint the codebase: `node bin/feynman-lint.js README.md docs/*.md examples/*.md`

---

## What Makes a Good First PR

These are well-scoped and require no architectural decisions:

- **Add a lint-rule test case** — add a row to `tests/lint-cases.json` for
  an edge case that's currently untested.
- **Improve an example** — add or improve a file in `examples/` following
  the schema in `docs/architecture.md` and `06-CONTEXT.md`.
- **Expand `feynman doctor`** — add a new health check to `bin/feynman.js`
  `cmdDoctor()`.
- **Fix a typo or improve prose** — in `README.md`, `docs/`, or `CONTRIBUTING.md`.
- **Add a rule to `rules/feynman-activate.md`** — follow the rules-authoring
  guidelines below.

---

## PR Checklist

Before opening a pull request:

- [ ] `npm test` passes (all existing tests green)
- [ ] New behavior has a test in `tests/` covering the change
- [ ] No new lint warnings: `node bin/feynman-lint.js <changed files>`
- [ ] `README.md` updated if a user-facing feature changed
- [ ] Commit message follows the format: `type(scope): description`
      (types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`)

---

## Rules Authoring Guidelines

The hook injects `rules/feynman-activate.md` into every Claude prompt.
The rules must be declarative facts, not commands.

**Good (declarative):**
> "A response describing a sequence of steps includes an ASCII flow diagram."

**Bad (imperative):**
> "Always draw a flow diagram when you see steps."

Imperative phrasing triggers Claude's prompt-injection defense
([bug #17804](https://github.com/anthropics/claude-code/issues/17804)) and
may be filtered or reinterpreted.

Each intensity variant must stay under 8,000 characters. Measure with:

```bash
node -e "
const f = require('fs').readFileSync('rules/feynman-activate.md', 'utf8');
['lite','full','ultra'].forEach(v => {
  const s = f.indexOf('<!-- ' + v + ' -->');
  const e = f.indexOf('<!-- /' + v + ' -->', s);
  console.log(v, f.slice(s, e + ('<!-- /' + v + ' -->').length).length, 'chars');
});
"
```

---

## Issue Triage

**Labels:**

| label            | when to use                                      |
|------------------|--------------------------------------------------|
| `bug`            | something works differently than documented      |
| `feature`        | new capability request                           |
| `docs`           | documentation gap or error                       |
| `good-first-issue` | well-scoped, no architecture decisions needed  |

**Expected response time:** best-effort, typically within a week for bugs.
Feature requests may be deferred to a milestone.

---

## Governance

- Single maintainer: [apolenkov](https://github.com/apolenkov)
- License: MIT — see `LICENSE`
- Public roadmap: `.planning/ROADMAP.md` (check before proposing big features)
- No DCO or CLA sign-off required — low barrier to contribution is intentional

---

## Testing

```bash
npm test              # run all tests
npm test -- --grep L01  # filter by test name pattern
```

Coverage report: `npm run coverage` (writes to `coverage/`)

Tests are in `tests/` using `node:test` and `node:assert`. Lint golden
cases are in `tests/lint-cases.json`.

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the hook lifecycle,
lint pipeline, and state schema before making changes to `hooks/`,
`lib/lint/`, or `bin/`.
