# Phase 2: Cleanup + State Schema - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

v0.1 codebase is purged of caveman framing, dead files, duplicate skill, and lying field names; project surfaces describe feynman as a standalone tool; SKIL-03 (disable-model-invocation) is resolved.

**Delivers:**
- README.md, hooks/feynman-activate.js, .planning/PROJECT.md without caveman mentions
- `commands/feynman.toml` deleted (dead — Claude Code uses .md not .toml)
- `skills/feynman-stats/` deleted (duplicates `/feynman status`)
- State field `count` renamed to `injections` everywhere (hook + SKILL.md scripts + docs)
- CLAUDE.md project file cleaned of empty stub sections
- `disable-model-invocation: true` added to skills/feynman/SKILL.md frontmatter
- install.sh updated to drop /feynman-stats reference
- PROJECT.md "Out of Scope" updated to reflect v0.1-vs-v0.2.0 reality

**Does NOT deliver:** linter (Phase 3), tests (Phase 4), NPX (Phase 5), docs (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Caveman removal
- **D-01:** Remove all caveman/Caveman mentions from public surfaces — README.md, hooks/*.js comments, .planning/PROJECT.md sections. Position feynman as standalone work. Public-facing wording must stand on feynman's merits without referencing caveman.
- **D-02:** Internal historical references in already-archived planning docs (`.planning/phases/01-core/*`) are NOT touched — they document v0.1 history.

### Dead file removal
- **D-03:** Delete `commands/feynman.toml` — confirmed dead (Claude Code uses `.md` for slash commands, not `.toml`). Original copy from caveman-style scaffolding.
- **D-04:** Delete `skills/feynman-stats/` directory — `/feynman status` (no args) provides the same view. `/feynman-stats` was implemented but adds no unique value.

### State schema rename
- **D-05:** Rename `state.count` → `state.injections` in:
  - `hooks/feynman-activate.js` (lines 18, 79, 81)
  - `skills/feynman/SKILL.md` (inline node -e scripts)
  - Any documentation referring to the field
- **D-06:** Migration: existing user `state.json` files have `count` field; the new hook reads `state.injections ?? state.count ?? 0` for backward-compat on first run, then writes `injections` going forward.
- **D-07:** Schema field `count` is removed from new writes; the migration line above provides one-time backward-compat.

### Skill auto-invocation
- **D-08:** Add `disable-model-invocation: true` to `skills/feynman/SKILL.md` YAML frontmatter so Claude does not auto-invoke the skill when user says "draw a diagram" in non-command context.

### CLAUDE.md project cleanup
- **D-09:** Remove empty stub sections from CLAUDE.md project file:
  - Empty `### Hook Runtime`, `### Plugin Manifest`, `### Install Mechanism`, `### IDE Compatibility Layer` headers without content
  - Empty `Open Questions` section
- ✅ `CLAUDE.md` `## Project` and `## Constraints` use standalone wording; no caveman framing remains.

### install.sh
- ✅ `install.sh` has no `/feynman-stats` references; wrapper is clean.

### Out of Scope update
- ✅ `PROJECT.md` keeps v0.1 completed scope and v0.2.0 active scope separated and explicit.

### Claude's Discretion
- Exact wording of standalone descriptions for README/CLAUDE.md after caveman removal — keep concise; describe what feynman does, not what it relates to
- File order for cleanup operations — no dependency between CLN-01..08, but recommend mechanical order: deletes first, then renames, then text edits

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — CLN-01..08, SKIL-03 with full spec
- `.planning/PROJECT.md` — current milestone Active list
- `hooks/feynman-activate.js` — current hook with state.count
- `skills/feynman/SKILL.md` — needs disable-model-invocation
- `README.md` — public surface validated as standalone (no caveman references in shipped docs)
- `CLAUDE.md` (project root) — project and constraints sections use standalone wording

</canonical_refs>

<code_context>
## Existing Code Insights

### Files affected (verified by grep earlier)
- README.md (5 caveman mentions)
- hooks/feynman-activate.js (2 comment mentions)
- CLAUDE.md project file (10 mentions)
- commands/feynman.toml (delete entire file)
- skills/feynman-stats/SKILL.md (delete entire dir)

### Established Patterns from Phase 1
- CommonJS only (no ESM)
- os.homedir() never tilde
- HTML comment markers `<!-- intensity -->` for rule sections
- State at `~/.claude/.feynman/state.json`
- Flag at `~/.claude/.feynman-active`

</code_context>

<specifics>
## Specific Ideas

- Use `git rm` for deleted files so removals are tracked properly
- Single commit per CLN-XX requirement preferred for granular history; or one commit "phase 2: cleanup" if more practical
- After all changes: run hook with test stdin to verify it still emits valid JSON

</specifics>

<deferred>
## Deferred Ideas

- IDE compatibility files (.clinerules, .cursor, .windsurf) — already deleted in earlier session; do not recreate
- Linter integration — Phase 3
- Tests — Phase 4

</deferred>

---
*Phase: 2-Cleanup*
*Context gathered: 2026-05-06*
