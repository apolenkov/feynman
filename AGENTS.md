# AGENTS.md

Universal agent rules for feynman — the **single entry point**. All AI tools
(Claude Code, Codex, …) read this file. `CLAUDE.md` is just `@AGENTS.md`.

> **Thin by design.** Engineering standards are enforced by tooling and
> documented in the canonical files below — never duplicated here. If a fact
> lives in two places, one of them is wrong.

## Before committing

Run `npm run typecheck`, `npm run eslint`, and `npm test` — all green.

## Two linters — don't confuse them

- `npm run lint` → feynman's **product** diagram linter (`bin/feynman-lint`, rules L01–L14)
- `npm run eslint` → the **code** linter (`eslint .`)

## Canonical sources — each fact has exactly one home

| Topic | Home |
|-------|------|
| Domain language (Structure, Trigger, Visual, Intensity) — use exactly, no synonyms | `CONTEXT.md` |
| Architecture (hook lifecycle, lint pipeline, state schema) | `docs/architecture.md` |
| Decisions & constraints (toolchain, zero-runtime-deps, Node baseline) | `docs/adr/` (start at [0001](docs/adr/0001-typescript-source-with-packaging-build.md)) |
| Agent ops (issue tracker, triage labels, domain workflow) | `docs/agents/` |
| Planning / specs | `openspec/` |

## Targets

Claude Code and Codex are both first-class. IDE compat: Cline/Windsurf
(`.clinerules/`), Cursor (`.cursor/rules/*.mdc`).

## Commits

Conventional Commits (`type: subject`, imperative).
