## 1. Capability spec (this change)

- [ ] 1.1 Author `specs/rules-injection/spec.md` grounded in `hooks/feynman-session-start.ts` and
      `hooks/feynman-activate.ts`: path-traversal guard, flag-file lifecycle, state.json read,
      Intensity-matched injection, disabled fast-exit, output format difference.
- [ ] 1.2 `openspec validate add-rules-injection-spec --strict` passes.

## 2. ADR follow-up

- [ ] 2.1 Author ADR: SessionStart over UserPromptSubmit for rule injection — per-turn injection
      redundant; bug-driven trade-offs #8810/#13912/#35713/#10225 (tracked in baseline tasks.md §3.3).
      This change may unblock that ADR by giving it a canonical spec to reference.

## 3. Gate

- [ ] 3.1 `npm run typecheck`, `npm run eslint`, `npm test` green; one commit.
