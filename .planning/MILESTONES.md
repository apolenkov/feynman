# Milestones

## v0.3.0 Prompt Architecture (Shipped: 2026-05-10)

**Phases completed:** 10 phases, 11 plans, 12 tasks

**Key accomplishments:**

- ASCII diagram injection rules in three intensity variants (lite/full/ultra) with declarative phrasing, explicit negative conditions, and five diagram type definitions (flow, tree, comparison, frame block, priority scale)
- Zero-dependency CJS UserPromptSubmit hook that checks flag file, bootstraps state on first run, extracts per-intensity rules variant, and injects it as hookSpecificOutput.additionalContext — with all three confirmed Claude Code bug workarounds applied (#13912, #35713, #8810)
- Claude Code plugin identity manifest (plugin.json) and README skeleton with before/after ASCII diagram table, install placeholder, and manual settings.json registration instructions
- One-liner:
- One-liner:
- One-liner:
- Part 1 — CLI `--fix` flag
- Dual-format `<intensity name="...">` + HTML-comment regex extractor added to feynman-activate.js via TDD, all 41 tests green
- rules/feynman-activate.md rewritten as 4410-byte XML contract with amplify/channel/suppress economy across lite/full/ultra intensities
- 3-sentence compaction-survivor subsection added to README explaining that UserPromptSubmit re-injects rules on every turn so they survive Claude Code's automatic context compaction, unlike SessionStart which fires once and is lost
- 60 eval outputs (20 × 3 arms) + 08-VERIFICATION.md confirming all 14 SPEC acceptance criteria via command-output evidence; WIN=17 NEUTRAL=3 HURT=0 vs old rules

---

## v0.2.0 v0.2.0 (Shipped: 2026-05-07)

**Phases completed:** 8 phases, 3 plans, 4 tasks

**Key accomplishments:**

- ASCII diagram injection rules in three intensity variants (lite/full/ultra) with declarative phrasing, explicit negative conditions, and five diagram type definitions (flow, tree, comparison, frame block, priority scale)
- Zero-dependency CJS UserPromptSubmit hook that checks flag file, bootstraps state on first run, extracts per-intensity rules variant, and injects it as hookSpecificOutput.additionalContext — with all three confirmed Claude Code bug workarounds applied (#13912, #35713, #8810)
- Claude Code plugin identity manifest (plugin.json) and README skeleton with before/after ASCII diagram table, install placeholder, and manual settings.json registration instructions
- Unified `bin/feynman.js` CLI with install/uninstall/doctor/lint/version subcommands; bash wrappers refactored as thin Node delegates; npm artifact verified at 21.4 kB.
- Designed the future lint-failure feedback loop on paper without adding runtime behavior.
- Public documentation is now release-ready: concise README, six domain examples, architecture and lint-rule references, visual research notes, contribution guide, and GitHub templates.

---

## v0.2.0 v0.2.0 (Shipped: 2026-05-07)

**Phases completed:** 8 phases, 3 plans, 4 tasks

**Key accomplishments:**

- ASCII diagram injection rules in three intensity variants (lite/full/ultra) with declarative phrasing, explicit negative conditions, and five diagram type definitions (flow, tree, comparison, frame block, priority scale)
- Zero-dependency CJS UserPromptSubmit hook that checks flag file, bootstraps state on first run, extracts per-intensity rules variant, and injects it as hookSpecificOutput.additionalContext — with all three confirmed Claude Code bug workarounds applied (#13912, #35713, #8810)
- Claude Code plugin identity manifest (plugin.json) and README skeleton with before/after ASCII diagram table, install placeholder, and manual settings.json registration instructions
- Unified `bin/feynman.js` CLI with install/uninstall/doctor/lint/version subcommands; bash wrappers refactored as thin Node delegates; npm artifact verified at 21.4 kB.
- Designed the future lint-failure feedback loop on paper without adding runtime behavior.
- Public documentation is now release-ready: concise README, six domain examples, architecture and lint-rule references, visual research notes, contribution guide, and GitHub templates.

---
