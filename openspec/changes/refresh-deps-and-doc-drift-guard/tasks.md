## 1. Refresh dev dependencies

- [x] 1.1 Bump `eslint` 10.4.0 → 10.4.1 and `@typescript-eslint/eslint-plugin` /
      `@typescript-eslint/parser` 8.59.x → 8.60.1 in `package.json`; run
      `npm install` to update `package-lock.json`. Confirm `dependencies` stays `{}`.
- [x] 1.2 Run `npm run eslint` and `npm run typecheck` — both green after the bump.

## 2. Fix code tails

- [x] 2.1 `install.sh` **and `uninstall.sh`** (identical twin): change the Node
      baseline check `>= 18` → `>= 22.6` (the `NODE_VER -lt 18` test, the comment,
      and the two user-facing messages in each file), matching `package.json`
      `engines.node` and ADR 0001.
- [x] 2.2 `skills/feynman/SKILL.md`: rewrite the `eval` subcommand so it no longer
      points at the retired GSD (`.planning/notes/`, `/gsd-execute-phase`);
      reference the current eval location (`feynman-rules-workspace/`, now
      gitignored) or state that runs are local-only.
- [x] 2.3 Reword the bare `no build step` phrase in the three runtime code
      comments (`bin/feynman-lint.ts`, `hooks/feynman-activate.ts`,
      `hooks/feynman-lint.ts`): `strip-types` already conveys "no transpile at
      runtime", and bare `no build step` is now stale (a packaging build exists
      per ADR 0001). This keeps all five phrases forbidden everywhere off the
      decision records.

## 3. Doc-drift guard (capability `doc-drift-guard`)

- [x] 3.1 In `scripts/check-docs.ts`, add named constants: `FORBIDDEN_PHRASES`
      (`CommonJS-only`, `CommonJS only`, `Node >= 18`, `Node.js >= 18`,
      `no build step`) and `DRIFT_EXCLUDED_PATHS` (`docs/adr/`, `CHANGELOG.md`,
      `openspec/changes/`, and `scripts/check-docs.ts` itself — the script holds
      the phrases as constants and would otherwise flag itself).
- [x] 3.2 Scan tracked text surfaces for `FORBIDDEN_PHRASES`, skipping
      `DRIFT_EXCLUDED_PATHS`; on a hit, print the file + phrase and exit non-zero.
- [x] 3.3 Verify against all three spec scenarios: (a) inject `Node >= 18` into a
      live file → gate fails; (b) the phrase in `docs/adr/0001` / `CHANGELOG.md` →
      gate passes; (c) clean tree → gate passes.

## 4. Gate

- [x] 4.1 `npm run typecheck`, `npm run eslint`, `npm test`, `npm run test:docs`
      all green; commit per task group (Conventional Commits).
