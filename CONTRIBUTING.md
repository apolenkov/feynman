# Contributing to feynman

feynman is a focused Codex plugin. Small, test-backed pull requests are
welcome.

## Setup

```bash
git clone https://github.com/apolenkov/feynman.git
cd feynman
npm ci
npm run ci
```

Use Node.js 22.18 or newer. Tests use Node's built-in `node:test` runner.
Lint changed documentation with `npm run lint -- <files>`.

`npm run eslint` analyzes TypeScript types in application code, automation and
tests and accepts no warnings. Parse external JSON as `unknown` and validate
the fields used by production code. Test assertions may inspect parsed fixtures
as records of unknown values. Test registration from `node:test` is owned by the
runner; its exact declarations are allowed by the floating-Promise rule. Other
asynchronous helpers must be awaited or handle rejection.

Template interpolation permits numbers for diagnostic counts, but rejects
implicit conversion of nullable values, booleans and arbitrary objects.
Non-null assertions are forbidden in the CLI, hooks, automation and state core;
parser index assertions must follow a checked bound. Local algorithm buffers
may mutate; exported defaults and registries are frozen and core inputs are
readonly. The import graph is checked for cycles as well as ownership violations.

Run `npm run format` to apply the pinned Prettier version to TypeScript, module
configuration, JSON and YAML. `npm run format:check` verifies the same scope in
local CI and GitHub Actions. Markdown diagrams and intentional lint fixtures
retain their exact spacing and are checked by the product linter instead.
Embedded-language formatting is disabled so template-string content is not
rewritten. Archived change records are historical and excluded from formatting.

## Where changes belong

- `rules/` — the Codex-facing Contract and Intensity blocks.
- `bin/commands/` — CLI use cases.
- `bin/adapters/` — Codex configuration, hook construction, and filesystem boundaries.
- `bin/cli/` — CLI presentation only.
- `hooks/` — Codex event adapter.
- `lib/state/` — state model and pure rule parsing; no filesystem access.
- `lib/lint/` — parser, diagnostics, and reporter.
- `plugins/feynman/` — native Codex marketplace metadata and skill.
- `tests/` — behavior and structural tests.
- `docs/`, `CONTEXT.md`, `openspec/specs/` — architecture and requirements.

Keep dependencies pointing inward as described in
[`docs/architecture.md`](docs/architecture.md). Do not add compatibility
adapters for other assistants or IDEs.

## Pull request checklist

- [ ] `npm run ci` passes.
- [ ] Changed behavior has a focused test.
- [ ] Changed documentation passes `npm run test:docs` and product lint.
- [ ] User-facing behavior is reflected in `README.md`.
- [ ] Commit uses Conventional Commits.
- [ ] The PR explains ownership or boundary changes when architecture is involved.

## Rules authoring

The `SessionStart` hook injects `rules/feynman-contract.md` on Codex session
events (`startup`, `resume`, `compact`, `clear`). Keep the Contract declarative,
precise, and within the per-Intensity size budget. Use the terms in
[CONTEXT.md](CONTEXT.md).

## Testing and release

Run `npm test` for the fast suite and `npm run ci` for the complete gate,
including build, docs, packaging, and coverage. Release ownership and the
GitHub-to-npm flow are documented in [docs/release.md](docs/release.md).
The gate compares two clean tarballs; do not edit source or install dependencies
while it runs. Coverage scope and missing files are reported explicitly;
see [docs/coverage.md](docs/coverage.md). Live explanation evaluation is separate
from CI and is described in [evals/README.md](evals/README.md).

Security issues must be reported privately as described in
[SECURITY.md](SECURITY.md).
