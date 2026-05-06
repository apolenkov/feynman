# Roadmap: feynman

## Overview

feynman ships as three coherent deliveries: first the core IP (rules + hook + manifest + README skeleton) that makes the plugin work end-to-end; then the skills layer that lets users control it; finally the IDE compatibility files and install scripts that make distribution frictionless. Each phase leaves the project in a fully testable, shippable state.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core** - Rules file + hook script + plugin manifest + README skeleton (the 3+1 files the user asked for first)
- [ ] **Phase 2: Skills** - /feynman toggle + /feynman-stats session counter
- [ ] **Phase 3: Distribution** - IDE compat files + install.sh/ps1 + full README

## Phase Details

### Phase 1: Core
**Goal**: The hook injects ASCII diagram rules on every prompt; the plugin is installable and produces value with no further configuration
**Depends on**: Nothing (first phase)
**Requirements**: RULE-01, RULE-02, RULE-03, RULE-04, HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, DIST-04, DOCS-01, DOCS-02
**Success Criteria** (what must be TRUE):
  1. Every time the user sends a prompt, Claude receives the diagram rules injected via additionalContext — no manual copy-paste required
  2. Responses that have flow/hierarchy/comparison/status-over-5-lines content include an appropriate ASCII diagram
  3. Responses that are single facts, short answers, or pure code blocks do NOT include an unsolicited diagram
  4. User can set intensity to lite, full, or ultra and the hook injects the matching rule variant
  5. README.md skeleton exists with before/after example and install one-liner placeholder
**Plans**: TBD
**UI hint**: no

### Phase 2: Skills
**Goal**: Users can toggle feynman on/off and switch intensity from inside Claude Code using slash commands; session diagram count is visible
**Depends on**: Phase 1
**Requirements**: SKIL-01, SKIL-02, SKIL-03, DOCS-03
**Success Criteria** (what must be TRUE):
  1. User can run /feynman and see the plugin toggle between enabled and disabled; subsequent prompts reflect the change immediately
  2. User can run /feynman lite (or full, ultra) and the hook switches intensity for that session
  3. User can run /feynman-stats and see the count of diagrams injected in the current session
  4. /feynman skill does not auto-invoke when the user asks Claude to "draw a diagram" in a non-command context
**Plans**: TBD

### Phase 3: Distribution
**Goal**: Any user on macOS, Linux, or Windows can install feynman in one command; Cursor and Windsurf users get diagram rules without hooks; README tells the full story
**Depends on**: Phase 2
**Requirements**: COMP-01, COMP-02, DIST-01, DIST-02, DIST-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. Running curl install.sh | bash registers the hook in ~/.claude/settings.json with an absolute expanded path; running it twice is idempotent
  2. Running install.sh --uninstall removes the hook entry cleanly from settings.json
  3. Cursor users who copy .cursor/rules/feynman.mdc get diagram rules applied via alwaysApply: true without any hook
  4. README contains a completed before/after table, intensity levels table, caveman compatibility section, and full install instructions
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core | 0/TBD | Not started | - |
| 2. Skills | 0/TBD | Not started | - |
| 3. Distribution | 0/TBD | Not started | - |
