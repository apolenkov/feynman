# Requirements: feynman

**Defined:** 2026-05-06
**Core Value:** Every response with structure gets an ASCII diagram without the developer asking

## v1 Requirements

### Hook

- [ ] **HOOK-01**: Hook outputs JSON `{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: "..."}}` — not plain stdout (confirmed bug #13912)
- [ ] **HOOK-02**: Hook registered in `~/.claude/settings.json` with absolute expanded path — not via plugin.json (confirmed bug #10225, #8810)
- [ ] **HOOK-03**: Hook reads `state.json`; exits silently (code 0) when disabled
- [ ] **HOOK-04**: Hook selects rule variant based on intensity level (lite / full / ultra)
- [ ] **HOOK-05**: Hook increments session diagram counter in state.json

### Rules

- [ ] **RULE-01**: `rules/feynman-activate.md` defines WHEN to draw — flow → ASCII boxes+arrows; hierarchy → tree; comparison → side-by-side columns; status >5 lines → ┌─frame─┐ blocks; priority chain → ▲▼ scales
- [ ] **RULE-02**: Rules define explicit WHEN NOT to draw — single facts, code blocks, short answers (<5 lines without structure)
- [ ] **RULE-03**: Three intensity variants in rules file: `lite` (flow+trees only), `full` (all types, default), `ultra` (force diagram even for short answers)
- [ ] **RULE-04**: Rules phrased as declarative facts ("responses with flows include..."), not commands; each variant under 8,000 chars

### Skills

- [ ] **SKIL-01**: `skills/feynman/SKILL.md` implements `/feynman` command to toggle on/off and switch intensity level; writes `state.json`
- [ ] **SKIL-02**: `skills/feynman-stats/SKILL.md` implements `/feynman-stats` command showing session diagram count (reads session-keyed temp file)
- [ ] **SKIL-03**: `/feynman` skill has `disable-model-invocation: true` to prevent auto-invocation on "draw a diagram" queries

### IDE Compatibility

- [ ] **COMP-01**: `.clinerules/feynman.md` — static copy of full rules for Cline / Windsurf
- [ ] **COMP-02**: `.cursor/rules/feynman.mdc` — copy of full rules with YAML frontmatter (`alwaysApply: true`) for Cursor

### Distribution

- [ ] **DIST-01**: `install.sh` idempotently upserts hook entry into `~/.claude/settings.json` using `node -e` inline (no `jq`); expands tilde to absolute path at install time
- [ ] **DIST-02**: `install.sh` includes uninstall flag (`--uninstall`) to clean up settings.json entry
- [ ] **DIST-03**: `install.ps1` Windows equivalent of install.sh
- [ ] **DIST-04**: `.claude-plugin/plugin.json` manifest with `name`, `version` (semver), `description`

### Documentation

- [ ] **DOCS-01**: `README.md` before/after table — same answer without feynman (prose) vs with feynman (ASCII diagram)
- [ ] **DOCS-02**: `README.md` one-liner install section
- [ ] **DOCS-03**: `README.md` intensity levels table (lite / full / ultra)
- [ ] **DOCS-04**: `README.md` "works great with caveman" section — explains complementary roles

## v2 Requirements

### Distribution

- **DIST-V2-01**: `/plugin install feynman` via Claude Code Marketplace — undocumented submission process as of 2026-05-06; defer until Anthropic opens registry
- **DIST-V2-02**: `install.sh --with-init` flag writing all IDE rule files (`.windsurf/rules/`, `.cursor/rules/`)

### Stats

- **STAT-V2-01**: `/feynman-stats` with per-diagram-type breakdown (not just total count)
- **STAT-V2-02**: Cross-session aggregation in persistent stats file

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom diagram renderers (Mermaid, graphviz) | ASCII-only; zero deps is the design |
| Per-project diagram style config | Global rules are the product; per-project config adds complexity without value |
| Web UI / dashboard | CLI/hook plugin only |
| Real-time diagram preview | Not a hook capability; separate tool category |
| Diagram count analytics / telemetry | Privacy; user opt-in would be required; skip for open-source plugin |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RULE-01 | Phase 1 | Pending |
| RULE-02 | Phase 1 | Pending |
| RULE-03 | Phase 1 | Pending |
| RULE-04 | Phase 1 | Pending |
| HOOK-01 | Phase 1 | Pending |
| HOOK-02 | Phase 1 | Pending |
| HOOK-03 | Phase 1 | Pending |
| HOOK-04 | Phase 1 | Pending |
| HOOK-05 | Phase 1 | Pending |
| DIST-04 | Phase 1 | Pending |
| DOCS-01 | Phase 1 | Pending |
| DOCS-02 | Phase 1 | Pending |
| SKIL-01 | Phase 2 | Pending |
| SKIL-02 | Phase 2 | Pending |
| SKIL-03 | Phase 2 | Pending |
| DOCS-03 | Phase 2 | Pending |
| COMP-01 | Phase 3 | Pending |
| COMP-02 | Phase 3 | Pending |
| DIST-01 | Phase 3 | Pending |
| DIST-02 | Phase 3 | Pending |
| DIST-03 | Phase 3 | Pending |
| DOCS-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-06*
*Last updated: 2026-05-06 after initial definition*
