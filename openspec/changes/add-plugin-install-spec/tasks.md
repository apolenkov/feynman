## 1. Core capability spec (this change)

- [x] 1.1 Read and ground `bin/feynman.ts` and `install.sh` — subcommands, targets, filesystem
      artifacts, Node baseline, ADR 0001 zero-deps constraint confirmed.
- [ ] 1.2 Author `specs/plugin-install/spec.md` with ADDED Requirements for install, doctor,
      uninstall; IDE compat; Intensity default; Node baseline gate; zero-runtime-deps.
- [ ] 1.3 `openspec validate add-plugin-install-spec --strict` passes.

## 2. Out-of-scope targets (follow-up specs)

- [ ] 2.1 Extend `plugin-install` spec to cover `opencode` target — install writes
      `~/.config/opencode/.feynman/rules.md` and registers the path in `opencode.json`
      `instructions[]`. Ground in `installOpenCodeTarget`/`uninstallOpenCodeTarget` in
      `bin/feynman.ts`.
- [ ] 2.2 Extend spec to cover `windsurf` IDE target — install writes
      `.windsurf/rules/feynman.md` with no frontmatter. Ground in `ideTargetConfig` in
      `bin/feynman.ts`.
- [ ] 2.3 Extend spec to cover `all` / `*` expansion target — `targetNames('all')` returns
      `['claude', 'codex', 'opencode']`. Ground in `targetNames()`.

## 3. Gate

- [ ] 3.1 `npm run typecheck`, `npm run eslint`, `npm test` green; one commit per task group.
