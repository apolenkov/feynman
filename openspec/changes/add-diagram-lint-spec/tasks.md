## 1. Capability spec (this change)

- [x] 1.1 Read `lib/lint/rules.ts` and `bin/feynman-lint.ts` as primary grounding source.
- [x] 1.2 Author `specs/diagram-lint/spec.md` — all 15 rules in seven requirement groups,
      each with rule IDs, severity, WHEN/THEN scenarios, and fix guidance.
- [ ] 1.3 `openspec validate add-diagram-lint-spec --strict` passes.

## 2. Follow-on (out of scope for this change)

- [ ] 2.1 Confirm L15 scope: `tasks.md` in `establish-feynman-openspec-baseline` cites
      "L01–L14" but source ships L15_homogeneous_frame; reviewer to decide whether L15
      is in scope or a separate change.
- [ ] 2.2 Consider adding `--explain` output format to the CLI spec once `diagram-lint`
      spec is accepted.

## 3. Gate

- [ ] 3.1 `npm run typecheck`, `npm run eslint`, `npm test` green; one commit per task group.
