## 1. Core capability spec (this change)

- [x] 1.1 Read and ground `bin/feynman.ts` and `install.sh` — subcommands, targets, filesystem
      artifacts, Node baseline, ADR 0001 zero-deps constraint confirmed.
- [x] 1.2 Author `specs/plugin-install/spec.md` with ADDED Requirements for install, doctor,
      uninstall; the three supported targets (claude/codex/opencode); Intensity default; Node
      baseline gate; zero-runtime-deps.
- [x] 1.3 `openspec validate add-plugin-install-spec --strict` passes.

## 2. Supported target set — decided: three CLI agents only (claude/codex/opencode)

- [x] 2.1 Cover `opencode` target — install writes `~/.config/opencode/.feynman/rules.md` and
      registers the path in `opencode.json` `instructions[]`. Grounded in
      `installOpenCodeTarget`/`uninstallOpenCodeTarget` in `bin/feynman.ts`. Done in this change.
- [x] 2.2 `windsurf` (and `cline`/`cursor`) IDE targets — DECIDED out of scope: deprecated, not
      contracted; spec records them as slated for removal in a follow-up change.
- [x] 2.3 Cover `all` / `*` expansion — `targetNames('all')` returns `['claude','codex','opencode']`.
      Spec scenario added. Done in this change.

## 3. Gate

- [x] 3.1 `npm run typecheck`, `npm run eslint`, `npm test` green; one commit per task group.
