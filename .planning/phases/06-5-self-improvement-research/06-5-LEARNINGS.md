---
phase: 06.5
phase_name: "Self-Improvement Research"
project: "feynman"
generated: "2026-05-06"
counts:
  decisions: 3
  lessons: 2
  patterns: 3
  surprises: 1
missing_artifacts:
  - "06-5-PLAN.md"
  - "06-5-VERIFICATION.md"
  - "06-5-UAT.md"
---

# Phase 6.5 Learnings: Self-Improvement Research

## Decisions

### Keep Self-Improvement Local-First
Future failure logs stay on the user's machine by default.

**Rationale:** The loop can detect recurring failure patterns without storing or uploading prompt content.
**Source:** `docs/self-improvement.md`

---

### Default the Loop Off
The proposed v0.3.0 config defaults `selfImprovement.enabled` and `logFailures` to false.

**Rationale:** Logging must be opt-in because responses may contain sensitive project context.
**Source:** `docs/self-improvement.md`

---

### Require Human Review Before Rule Changes
Rule-update proposals are advisory markdown files and cannot edit `rules/feynman-activate.md` automatically.

**Rationale:** Automatic rule rewriting risks broad behavior changes and prompt-quality regressions.
**Source:** `06-5-SUMMARY.md`

---

## Lessons

### Metadata Can Be Useful Without Raw Text
Hashes, rule IDs, diagram shape, severity, and structural signatures are enough for aggregate pattern detection.

**Context:** The design avoids raw response text while preserving signal for repeated lint failures.
**Source:** `docs/self-improvement.md`

---

### Hook Failure Paths Must Stay Non-Blocking
Any future logging write error must be silent and must never block Claude prompts.

**Context:** This follows the existing hook fail-safe pattern used throughout feynman.
**Source:** `docs/self-improvement.md`

---

## Patterns

### Proposal-First Rule Changes
Convert repeated lint failures into reviewable proposal documents before touching rules.

**When to use:** When a lint rule produces recurring failures that may indicate a prompt-rule gap.
**Source:** `docs/self-improvement.md`

---

### Explicit Deferred Implementation Boundary
Research docs should state exactly what is not implemented in the current milestone.

**When to use:** When a phase designs a future system but intentionally avoids runtime changes.
**Source:** `06-5-SUMMARY.md`

---

### Local Kill-Switch
Every future self-improvement feature needs an explicit local off switch and fail-closed behavior.

**When to use:** Any feature that writes logs, stores snippets, or derives proposals from user output.
**Source:** `docs/self-improvement.md`

---

## Surprises

### The Design Needed Privacy Rules Before Algorithms
The central complexity was not scoring proposals; it was defining what data is safe to store.

**Impact:** The proposed schema logs metadata and hashes by default, with raw snippets excluded unless an explicit debug mode exists.
**Source:** `docs/self-improvement.md`
