## 1. Core capability spec (this change)

- [x] 1.1 Write `/CONTEXT.md` domain glossary (Structure, Trigger, Visual, Intensity).
- [x] 1.2 Author `specs/diagram-rules/spec.md` from `rules/feynman-activate.md` (Intensity tiers,
      Structure→Visual Triggers, Contract: classify → channel/amplify/suppress, mutex, smallest-first).
- [ ] 1.3 `openspec validate establish-feynman-openspec-baseline --strict` passes.

## 2. Remaining baseline capabilities (follow-up specs)

- [ ] 2.1 `rules-injection` — SessionStart lifecycle: session_id path-traversal guard → flag-file →
      `state.json` (enabled/intensity) → inject matched rules; disabled state injects nothing; plain
      text for SessionStart, JSON wrapper for legacy UserPromptSubmit, no trailing newline. Ground in
      `hooks/feynman-session-start.ts`, `hooks/feynman-activate.ts`.
- [ ] 2.2 `diagram-lint` — the product linter L01–L14 (box closure, tree chars, arrow style, column
      widths, flow integrity, priority scale, …). Ground in `lib/lint/rules.ts`, `bin/feynman-lint.ts`.
- [ ] 2.3 `plugin-install` — `feynman install|doctor|uninstall` for targets `claude|codex|both` plus
      IDE compat (`.clinerules/`, `.cursor/rules/*.mdc`); zero-dep CommonJS, settings.json merge via
      `node -e`. Ground in `bin/feynman.ts`, `install.sh`.

## 3. Record decisions as ADRs

- [ ] 3.1 ADR: retire GSD `.planning/`, adopt OpenSpec as the planning system (2026-06-01).
- [ ] 3.2 ADR: zero-dependency CommonJS-only hook contract (no build step) and why.
- [ ] 3.3 ADR: SessionStart over UserPromptSubmit for rule injection (per-turn injection redundant;
      bug-driven trade-offs #8810/#13912/#17804/#35713/#10225).

## 4. Gate

- [ ] 4.1 `npm run typecheck`, `npm run eslint`, `npm test` green; one commit per task group.
