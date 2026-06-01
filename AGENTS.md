# AGENTS.md

Universal agent rules for feynman. All AI tools read this file.

> Thin by design. Engineering standards are **enforced by tooling**, not duplicated here.
> Before committing, run `npm run typecheck`, `npm run eslint`, and `npm test`.
> Types = `tsconfig.json`; code lint = **ESLint** (`eslint .`). Full project memory: `CLAUDE.md`.
>
> **Hard contract:** zero runtime dependencies, CommonJS-only, no build step for the hook —
> preserve it. Claude Code and Codex are both first-class targets.
>
> **Don't confuse the two linters:** `npm run lint` is feynman's **own product** diagram linter
> (`bin/feynman-lint`), not the code linter. The code linter is `npm run eslint`.

Read and follow:

@CLAUDE.md

The `## Agent skills` block (issue tracker, triage labels, domain docs) lives in `CLAUDE.md`.
