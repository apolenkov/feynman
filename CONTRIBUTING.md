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

Security issues must be reported privately as described in
[SECURITY.md](SECURITY.md).
