## Context

ADR 0001 superseded the "CommonJS-only / Node >= 18 / no build step" contract.
The documentation was consolidated to a single source of truth, but the same
wording legitimately *still appears* in two kinds of places:

- **Decision records** — ADR 0001 itself ("supersedes the earlier …"), the
  `openspec/changes/*` proposals that quote-and-supersede it, and CHANGELOG
  history. Here the phrase is correct and must stay.
- **Live surfaces** — `AGENTS.md`, `README.md`, `docs/architecture.md`,
  `install.sh`, `package.json`, `openspec/config.yaml`. Here the phrase is a bug.

A naive substring scan would flag the decision records too. The guard must tell
the two apart.

## Goals / Non-Goals

**Goals:**
- Fail CI when a superseded contract phrase appears on a **live** surface.
- Reuse the existing `scripts/check-docs.ts` (already in `npm run test:docs` → CI),
  not a new script or dependency.

**Non-Goals:**
- Not a general-purpose semantic drift detector — it catches the known stale
  phrasings, not every possible wording.
- Not blocking the phrases inside decision records (ADR / CHANGELOG / changes).

## Decisions

- **Detection = phrase allowlist + path denylist.** Scan tracked text files for a
  fixed set of forbidden phrases (`CommonJS-only`, `CommonJS only`, `Node >= 18`,
  `Node.js >= 18`, `no build step`); skip the decision-record paths
  (`docs/adr/**`, `CHANGELOG.md`, `openspec/changes/**`). Alternative considered:
  AST/semantic analysis — rejected as overkill for a tripwire over flat phrases.
- **Home = `scripts/check-docs.ts`.** The script already walks docs and runs in
  CI; adding one assertion block keeps zero new dependencies and one gate.
  Alternative: a standalone `check-no-stale-contract.ts` — rejected, more wiring
  for no benefit.
- **Forbidden-phrase list lives next to the check**, as a named constant, so the
  set is auditable and editable in one place (no magic strings inline).

## Risks / Trade-offs

- [Reworded drift evades the tripwire] → Accepted: the guard pins the *specific*
  phrasings that caused this incident; it is a regression catch, not a proof.
- [A future legitimate live mention] → Mitigation: the path denylist is the
  escape hatch; a genuinely-historical mention belongs in a decision record,
  which is already excluded.
- [Phrase appears in `node_modules`/build output] → Mitigation: scan only
  tracked source surfaces, mirroring the script's existing file walk.
