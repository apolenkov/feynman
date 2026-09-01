# AGENTS.md

Repository instructions for Codex contributors. Keep this file short; canonical
details live in the files below.

## Before committing

Use Node.js 22.18 or newer and run:

```bash
npm ci
npm run ci
```

`npm run lint` is the product diagram linter. `npm run eslint` is the
TypeScript code linter.

## Canonical sources

| Topic | Source |
|---|---|
| Domain terms | [CONTEXT.md](CONTEXT.md) |
| Architecture and ownership | [docs/architecture.md](docs/architecture.md) |
| Decisions | [docs/adr/](docs/adr/) |
| Active requirements | [openspec/specs/](openspec/specs/) |
| Contribution workflow | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Release workflow | [docs/release.md](docs/release.md) |

## Scope

feynman supports Codex only. The native marketplace plugin and npm CLI are the
two delivery paths; the CLI always operates on `~/.codex` and has no target
selection option.

## Commits

Use Conventional Commits (`type(scope): subject`) and keep changes focused.
