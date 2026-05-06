# Phase 6: Documentation - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated

<domain>
## Phase Boundary

Documentation that turns feynman into a credible "visitkarte" repo: 6 example sessions across domains, full lint-rule docs, internal architecture, contribution templates, and a polished README. Standalone positioning — no caveman framing.

**Delivers:**
- examples/architecture-review.md — architecture Q→A session with ASCII diagram
- examples/api-flow.md — request/response sequence example
- examples/db-schema.md — entity relationships, table comparison
- examples/algorithm-explain.md — algorithm walkthrough
- examples/deploy-pipeline.md — CI/CD visualization
- examples/code-review.md — priority + comparison diagrams
- docs/visual-patterns.md — Tufte/Few/Bertin principles → ASCII (≤2000 words)
- docs/lint-rules.md — L01-L08 reference (valid + invalid per rule, cross-refs to rules.js)
- docs/architecture.md — hook lifecycle, lint pipeline, state schema
- CONTRIBUTING.md — improved (PR checklist, issue triage, governance)
- .github/ISSUE_TEMPLATE/bug_report.md
- .github/ISSUE_TEMPLATE/feature_request.md
- .github/PULL_REQUEST_TEMPLATE.md
- README.md — rewrite (badges, "Why feynman", install/levels/examples, no caveman)

**Does NOT deliver:** self-improvement design (Phase 6.5), release tagging (Phase 7).

</domain>

<decisions>

### Tone & language
- **D-01:** All docs in **English** (technical surface for OSS contributors). Russian remains for chat replies per global CLAUDE.md.
- **D-02:** Plain, direct prose. No marketing fluff. Sentences ≤25 words. Code blocks for every example.
- **D-03:** Every diagram in docs is itself a feynman-compliant diagram (passes our linter). Run `npx feynman lint docs/*.md examples/*.md` after writing — fix any L01-L08 issues.

### Example structure
- **D-04:** Each `examples/*.md` follows the schema:
  ```markdown
  # <Domain>: <Specific scenario>
  
  ## Question
  > <user's prompt as quote>
  
  ## Without feynman
  <plain prose answer>
  
  ## With feynman
  <ASCII diagram + ≤3 prose lines>
  
  ## Why this works
  <which rule activated, ≤2 sentences>
  ```
- **D-05:** Each example uses ONE primary diagram type matching its domain:
  - architecture-review → ┌─frame─┐ blocks + arrows
  - api-flow → flow boxes + `→` arrows
  - db-schema → side-by-side columns + tree relationships
  - algorithm-explain → flow + tree (state machine)
  - deploy-pipeline → flow with branches
  - code-review → priority scale `▲▼` + comparison columns

### Lint rules reference (DOCS2-08)
- **D-06:** `docs/lint-rules.md` structure per rule:
  ```markdown
  ## L0X: <name> (severity: error|warn)
  
  **What:** <one sentence>
  **Why:** <one sentence on the failure mode this catches>
  **Source:** [`lib/lint/rules.js#L<line>`](../lib/lint/rules.js)
  
  ### Valid
  ```<lang>
  <example that passes>
  ```
  
  ### Invalid
  ```<lang>
  <example that fails>
  ```
  
  Output:
  ```
  file:line:col: L0X <message>
  ```
  ```
- **D-07:** Cross-reference `lib/lint/rules.js` line numbers — verify by grepping during write.

### Visual patterns research (DOCS2-07)
- **D-08:** `docs/visual-patterns.md` cites:
  - Tufte — data-ink ratio, small multiples
  - Few — pre-attentive attributes, dashboard structure
  - Bertin — visual variables (position, size, value, texture, color, orientation, shape)
  - Optional: Cole Nussbaumer Knaflic — annotation, focus
- **D-09:** Mapping section: each principle → which feynman rule embodies it. Example: "Bertin's *position* variable maps to L05 flow integrity — boxes positioned along an axis carry sequence."
- **D-10:** Word count cap: 2000 words. Use ASCII diagrams to illustrate, not prose.
- **D-11:** Bibliography section with full citations (book/article/year/publisher).

### Architecture doc (DOCS2-09)
- **D-12:** `docs/architecture.md` covers three layers:
  1. Hook lifecycle (UserPromptSubmit fire → state read → rule injection → stdout JSON)
  2. Lint pipeline (parser → AST → rules → reporter → CLI/Stop-hook surfaces)
  3. State schema (`~/.claude/.feynman/state.json` fields, `.feynman-active` flag)
- **D-13:** Each layer gets an ASCII diagram. Use the actual file paths from the repo.

### CONTRIBUTING.md (DOCS2-10)
- **D-14:** Sections:
  - "Quick start" — fork → clone → `npm install` → `npm test`
  - "What's a good first PR" — bullet list of beginner-friendly issue types
  - "PR checklist" — tests added? lint passes? coverage maintained? README updated?
  - "Issue triage" — labels (bug, feature, docs, good-first-issue), expected response time
  - "Governance" — single maintainer (apolenkov), MIT license, public roadmap in `.planning/ROADMAP.md`
- **D-15:** Reference DCO or sign-off if needed: NO sign-off requirement (keep barrier low).

### GitHub templates (DOCS2-11..12)
- **D-16:** `bug_report.md` frontmatter:
  ```yaml
  ---
  name: Bug report
  about: Report a problem with feynman
  labels: bug
  ---
  ```
  Body: Reproduction / Expected / Actual / Environment (`feynman --version`, Node version, OS, Claude Code version).
- **D-17:** `feature_request.md` frontmatter labels: `feature`. Body: Use case / Proposed behavior / Alternatives considered / Would you contribute the PR?
- **D-18:** `PULL_REQUEST_TEMPLATE.md` body: Summary / Type (bug/feature/docs/chore) / Linked issue / Tests added / Coverage maintained / Lint clean checklist.

### README rewrite (DOCS2-13)
- **D-19:** Structure (top → bottom):
  1. Brand emoji + `<h1>feynman</h1>` + tagline
  2. Badges row: CI, coverage, npm version, license, stars, last commit
  3. Nav: `Why • Examples • Install • Levels • Lint • Contributing`
  4. **Why feynman** — 3 sentences, standalone value (NO caveman ref)
  5. **Before / After** table (existing 3 rows preserved + maybe expand to 4)
  6. **Install** — `npx feynman install` primary, bash fallback, manual <details>
  7. **Intensity Levels** — existing table + `/feynman` toggle commands
  8. **Lint** — one line: "feynman includes a linter for ASCII diagrams; see [docs/lint-rules.md](docs/lint-rules.md)"
  9. **Examples** — link list to all 6 examples/*.md files
  10. **How it works** — existing diagram (preserved)
  11. **Contributing** — link to CONTRIBUTING.md
  12. **License** — MIT
- **D-20:** Word count target ≤500 prose words (excluding code blocks + tables). README must read in 90 seconds.
- **D-21:** Standalone positioning — no mention of caveman or related tools. Project stands on its own merits.
- **D-22:** Screenshot/GIF placeholders DEFERRED — note in TODO comment, not blocking.

### Lint compliance for own docs
- **D-23:** All ASCII diagrams in examples/ + docs/ pass `npx feynman lint`. If a diagram intentionally violates a rule (for invalid example), wrap it in HTML comment marker `<!-- lint-skip -->` OR document inside a code fence with language `text` to avoid scanning. Decision: use language `text` on intentionally-broken examples — parser detects fences but only ASCII-art content; document this in lint-rules.md.

### Claude's Discretion
- Exact wording of the "Why feynman" paragraph — keep concise, value-focused
- How many before/after rows in README (3 minimum, 4-5 OK)
- Whether to include funding section (sponsors button on GitHub) — skip for v0.2.0
- Exact citation style in visual-patterns.md (Chicago, APA, plain text — pick consistent)

</decisions>

<canonical_refs>
- .planning/REQUIREMENTS.md — DOCS2-01..13 + RES-02
- lib/lint/rules.js — line refs for docs/lint-rules.md
- hooks/feynman-activate.js — for docs/architecture.md hook lifecycle
- bin/feynman.js — for docs/architecture.md install + doctor flows
- README.md — current state (Phase 4 added CI+coverage badges, Phase 5 added npm badge + npx install)
- rules/feynman-activate.md — source of truth for the rules content
- tests/fixtures/*.md — concrete diagram examples to reuse
</canonical_refs>

<code_context>
- Existing docs: README.md only. No docs/ or examples/ dir yet.
- CONTRIBUTING.md may be missing — check during execution; if missing, create from scratch.
- `.github/` already has workflows/ci.yml (Phase 4); add ISSUE_TEMPLATE/ + PULL_REQUEST_TEMPLATE.md alongside.
- Existing fixture files in tests/fixtures/ are good source material for examples (don't duplicate verbatim — adapt).
</code_context>

<specifics>
- All diagrams pass `npx feynman lint` (run as final verification before commit)
- README total length 90-second read — count words excluding code blocks
- docs/visual-patterns.md ≤2000 words (hard cap, use diagrams)
- Each example file ≤300 lines (concise sessions, not novels)
- Cross-references between docs use relative links (../lib/lint/rules.js style)
- All file paths in docs match actual repo state (no fictional paths)
</specifics>

<deferred>
- Screenshots / animated GIF in README — v0.3.0 (placeholders OK)
- Russian translation of docs — v0.3.0
- Additional examples (frontend, ML, math) — v0.3.0
- Diagram-style preferences guide (when to use which type) — Phase 6.5/v0.3.0
- Sponsors / funding page — v0.3.0
</deferred>

---
*Phase: 6-Documentation*
*Context gathered: 2026-05-06*
