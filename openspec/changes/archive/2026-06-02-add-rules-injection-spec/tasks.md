## 1. Capability spec (this change)

- [x] 1.1 Author `specs/rules-injection/spec.md` grounded in `hooks/feynman-session-start.ts` and
      `hooks/feynman-activate.ts`: path-traversal guard, flag-file lifecycle (incl. unlink on
      disable/corrupt), state.json read, Intensity-matched injection, disabled fast-exit,
      MALFORMED_FALLBACK + malformed_rules, output_style suffix, output format difference.
- [x] 1.2 `openspec validate add-rules-injection-spec --strict` passes.

## 2. ADR follow-up

- [x] 2.1 Author ADR: SessionStart over UserPromptSubmit for rule injection — per-turn injection
      redundant; bug-driven trade-offs #8810/#13912/#35713/#10225 (tracked in baseline tasks.md §3.3).
      Done: `docs/adr/0003-sessionstart-over-userpromptsubmit-injection.md`.

## 3. Gate

- [x] 3.1 `npm run typecheck`, `npm run eslint`, `npm test` green; one commit.
