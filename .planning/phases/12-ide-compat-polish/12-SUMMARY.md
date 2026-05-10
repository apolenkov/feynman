# Phase 12 Summary: IDE compat polish (cline / cursor / windsurf)

**Completed:** 2026-05-11 (autonomous)
**Status:** ✓ Done
**Requirements satisfied:** IDE-01, IDE-02, IDE-03, IDE-04, IDE-05

## What shipped

Three new install targets for project-local rules files: Cline (`.clinerules/`), Cursor (`.cursor/rules/*.mdc`), Windsurf (`.windsurf/rules/`). `doctor` verifies each. All five targets (claude/codex/cline/cursor/windsurf) documented in README.

## Implementation map

| REQ | File | Change |
|---|---|---|
| IDE-01 | `bin/feynman.js` | `install --target cline` writes `.clinerules/feynman-rules.md` |
| IDE-02 | `bin/feynman.js` | `install --target cursor` writes `.cursor/rules/feynman.mdc` with YAML frontmatter (alwaysApply: true, globs: "**") |
| IDE-03 | `bin/feynman.js` | `install --target windsurf` writes `.windsurf/rules/feynman.md` |
| IDE-04 | `bin/feynman.js` | `doctor --target <ide>` checks rules-file presence + Cursor frontmatter; exit 0 / 1 |
| IDE-05 | `README.md` | "IDE Support" section with 5-target table + install/doctor examples |
| (test) | `tests/cli.test.js` | 8 integration tests covering all 3 IDE installs + idempotency + doctor success/failure + frontmatter corruption detection |

## Key design decisions (no advisor pivots required)

1. **IDE targets are project-local (CWD), not user-global (HOME).** Different from claude/codex. Implemented via separate `installIde()` / `doctorIde()` functions called early in `cmdInstall` / `cmdDoctor`. No risk to existing claude/codex flow.

2. **Rules content sourced from `full` intensity block.** Same `<intensity name="full">` XML extractor as the runtime hook (`hooks/feynman-activate.js`). IDE installs always get the rich rules; the `intensity`/`output_style` runtime axis doesn't apply (IDEs read static files, not the hook).

3. **YAML frontmatter only for Cursor.** Cursor's `.mdc` format requires `alwaysApply: true` + `globs: "**"`. Cline and Windsurf use plain markdown. `renderFrontmatter()` helper emits frontmatter in stable key order.

4. **Idempotent install (overwrite in place).** Simpler than tracking "already installed" state — re-run = updated rules. No uninstall path; user deletes the directory manually if needed.

5. **Doctor validates frontmatter for Cursor only.** For Cline/Windsurf, doctor just checks file presence + content length. Frontmatter regression in Cursor would silently disable the rules from Cursor's perspective, so we test for it explicitly.

## Test totals

- Baseline before Phase 12: 356 (Phase 10 closure)
- After Phase 12: **364 / 364 pass**
- Delta: +8 tests (3 install + 1 idempotency + 3 doctor + 1 negative)
- Zero regressions in claude/codex install/doctor

## Commits

```
01d3b13 docs(12): README adds IDE Support section listing 5 targets (IDE-05)
3600e41 feat(12): IDE compat — install/doctor for cline, cursor, windsurf (IDE-01..04)
```

## Verification

```bash
$ npm test 2>&1 | grep -E "^ℹ"
ℹ tests 364
ℹ pass 364
ℹ fail 0

$ grep -c "isIdeTarget\|ideTargetConfig\|installIde\|doctorIde" bin/feynman.js
12   # functions + call sites

$ grep -c "^## IDE Support" README.md
1
```

## Phase 12 → 13 handoff

Phase 12 closes the IDE-* requirement track. Phase 13 (release v0.4.0) is blocked on:
1. npm token rotation (HUMAN — security debt from earlier session)
2. Anthropic API access for Phase 11 (optional — can ship v0.4.0 without compliance harness; Phase 11 work moves to v0.4.1 or v0.5.0)

The minimum viable v0.4.0 release with Phase 9/10/12 closure:
- 22 v0.4.0 requirements: 14 of 22 satisfied (Phase 9 = 5, Phase 10 = 4, Phase 12 = 5)
- 8 of 22 deferred (Phase 11 EVAL-01..03 + Phase 13 REL-01..05 — REL waits on Phase 11 OR ships partial)
- Strong test base (364 tests, 0 regressions)

Operator decision on v0.4.0 release scope reserved for morning.
