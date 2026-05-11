# Marketplace Submission — Ready-to-Paste Reference

Status: ready for user to submit. v0.4.0 prerequisites satisfied.

## Claude Code Marketplace (Anthropic-managed)

**Submission URL:** https://platform.claude.com/plugins/submit  (requires Anthropic login)

**Form fields (paste as-is):**

```
Name:          feynman
Repository:    https://github.com/apolenkov/feynman
npm:           @albinocrabs/feynman
License:       MIT
Category:      productivity
Brand color:   #10B981

Short description (one line):
  Draw ASCII diagrams when structure appears.

Long description:
  feynman is a hook-based Claude Code plugin that auto-injects ASCII diagram
  rules on every prompt. When a response has structure — flow, hierarchy,
  comparison, status, priority — feynman makes the assistant draw it as
  an ASCII diagram without the developer asking. Includes a 13-rule linter
  with autofix engine and three output-style presets (short/middle/full)
  for controlling visual verbosity. Zero npm dependencies; pure CommonJS;
  MIT licensed; 364 tests, CI on macOS + Linux.

Keywords:
  claude-code, codex, ascii, diagrams, hooks, productivity, visualization
```

**Manifest readiness:** `.claude-plugin/plugin.json` already contains all the
interface fields (displayName, shortDescription, longDescription, category,
capabilities, brand color) that Anthropic's review automation reads.

Single-plugin marketplace also shipped at `.claude-plugin/marketplace.json`
so a user can add the repo as a custom marketplace source:

```bash
/plugin marketplace add apolenkov/feynman
/plugin install feynman
```

## Codex (community list — official OpenAI directory not yet open)

**Target:** https://github.com/hashgraph-online/awesome-codex-plugins
**Status:** active list, 176 stars, PRs welcome, accepts via README edits + optional plugin bundle mirror

**Prereq (run before submitting):**

```bash
pipx run codex-plugin-scanner lint .
pipx run codex-plugin-scanner verify .
```

If both pass, the plugin is ready for their PR template. If either fails,
fix issues first (manifest validation, security concerns).

**README entry (paste into Community Plugins section):**

```markdown
- **[feynman](https://github.com/apolenkov/feynman)** — Auto-inject ASCII
  diagram rules on every Codex prompt. Structure in the response gets a
  diagram without asking. 13-rule linter with autofix; output-style presets
  (short/middle/full); zero dependencies; MIT. `npm: @albinocrabs/feynman`
```

**PR creation (when ready):**

```bash
gh repo fork hashgraph-online/awesome-codex-plugins --clone --remote
cd awesome-codex-plugins
# edit README.md adding the feynman entry under "## Community Plugins"
# commit + push to your fork
gh pr create --title "Add feynman to Community Plugins" \
  --body "feynman v0.4.0 — auto-inject ASCII diagram rules; 13-rule linter + autofix; output-style presets; 364 tests, MIT, public on npm. Repository: https://github.com/apolenkov/feynman"
```

The agent does NOT auto-fork or auto-PR external repos — that's a side-effect
on the user's GitHub identity. User runs the commands above when ready.

## OpenAI Codex official directory

Not yet open to third-party submissions (as of 2026-05-11 research).
Watch https://developers.openai.com/codex/plugins for announcements.
