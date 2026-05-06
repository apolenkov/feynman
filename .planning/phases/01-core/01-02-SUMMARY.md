---
phase: 01-core
plan: 02
subsystem: hook
tags: [claude-code, userpromptsubmit, hook, node, cjs, zero-deps]

# Dependency graph
requires:
  - phase: 01-core/01-01
    provides: "rules/feynman-activate.md with <!-- lite/full/ultra --> marker format"
provides:
  - "hooks/feynman-activate.js — UserPromptSubmit hook; reads state, selects intensity variant, injects rules as additionalContext"
  - "Flag file check (bug #35713 workaround): exits 0 silently when ~/.claude/.feynman-active absent"
  - "First-run bootstrap: creates FEYNMAN_DIR, default state.json, and flag file on ENOENT"
  - "Session_id path-traversal guard (ASVS V5 input validation)"
  - "Correct JSON stdout format (bug #13912 workaround): hookSpecificOutput.additionalContext"
  - "Session injection counter: state.count incremented on every rules injection (HOOK-05)"
affects: ["01-03 (README references hook registration pattern)", "02-01 (/feynman skill reads state.json written by this hook)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "stdin accumulator: process.stdin.on('data') + on('end') — exact caveman-mode-tracker.js pattern"
    - "Silent fail: all error paths call process.exit(0); never surface errors in Claude Code UI"
    - "Flag file gate: ~/.claude/.feynman-active checked before any state read (mirrors ~/.claude/.caveman-active)"
    - "ENOENT bootstrap: first-run detection via catch block, creates dir + state + flag atomically"
    - "Intensity allowlist: ['lite','full','ultra']; any other value falls back to 'full' (T-02-02 mitigation)"

key-files:
  created:
    - "hooks/feynman-activate.js"
  modified: []

key-decisions:
  - "Removed idempotency guard (/tmp/feynman-{session_id}.injected): UserPromptSubmit fires once per prompt by design; guard is not needed and open question was resolved in RESEARCH.md as unnecessary for Phase 1"
  - "First-run creates flag file immediately: avoids chicken-and-egg where hook always exits 0 on first install (open question resolved from RESEARCH.md)"
  - "Intensity allowlist validation: state.intensity value sanitized against ['lite','full','ultra'] before use in marker construction (T-02-02 mitigated)"
  - "Counter write failure is non-fatal: rules are still injected even if state.json write fails (e.g. disk full)"

patterns-established:
  - "Pattern 1: CJS hook structure — shebang + 'use strict' + require built-ins + stdin accumulator + process.exit(0) on all error paths"
  - "Pattern 2: Path constants block — HOME, FEYNMAN_DIR, STATE_PATH, FLAG_PATH, RULES_PATH — canonical names for Phase 2 skills to import"
  - "Pattern 3: extractVariant inline — indexOf-based marker parsing without regex; robust to any content between markers"

requirements-completed: [HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05]

# Metrics
duration: 5min
completed: 2026-05-06
---

# Phase 01 Plan 02: feynman-activate.js hook Summary

**Zero-dependency CJS UserPromptSubmit hook that checks flag file, bootstraps state on first run, extracts per-intensity rules variant, and injects it as hookSpecificOutput.additionalContext — with all three confirmed Claude Code bug workarounds applied (#13912, #35713, #8810)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-06T12:45:00Z
- **Completed:** 2026-05-06T12:50:00Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Implemented `hooks/feynman-activate.js` as a 95-line zero-dependency CJS Node.js script
- All three confirmed bug workarounds present: #13912 (JSON-only stdout), #35713 (flag file check first), #8810 (os.homedir() for all paths)
- First-run bootstrap: creates `~/.claude/.feynman/` dir, default `state.json`, and `~/.claude/.feynman-active` flag in a single ENOENT catch — hook self-activates on first install
- Session_id path-traversal guard: rejects any `session_id` containing `/`, `\`, or `..` (ASVS V5 — verified from gsd-context-monitor.js)
- Intensity variant extraction via indexOf-based `<!-- lite -->` / `<!-- /lite -->` markers — no regex, no eval
- State counter incremented on every injection; write failure is non-fatal (rules still injected)
- All 10 automated checks passed; all 16 acceptance-criteria grep gates satisfied

## Task Commits

1. **Task 1: Implement hooks/feynman-activate.js** - `22b487e` (feat)

## Files Created/Modified

- `hooks/feynman-activate.js` — UserPromptSubmit hook: flag-check → state-read/bootstrap → enabled-check → rules-read/variant-select → counter-increment → JSON-stdout

## Decisions Made

- Skipped idempotency guard (`/tmp/feynman-{session_id}.injected`): the plan template included it as a stub comment, but RESEARCH.md open question 1 concludes it is unnecessary — `hookSpecificOutput` JSON is atomic per invocation and duplication across prompt turns is the desired behavior (rules re-injected every prompt, which is the whole point).
- First-run flow creates the flag file: without this, the hook would always exit 0 on first install because the flag file does not exist yet. Creating the flag during state.json bootstrap activates feynman immediately after install without requiring install.sh.
- Intensity allowlist `['lite','full','ultra']` before marker construction: any unexpected value in state.json (e.g. attacker-crafted) falls back to `'full'` rather than attempting to construct an invalid marker string (T-02-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed console.log mention from comment**
- **Found during:** Task 1 verification
- **Issue:** Initial comment included `console.log` text which caused the automated verify script (`/console\.log/.test(src)`) to fail
- **Fix:** Rephrased comment to avoid the string `console.log`
- **Files modified:** hooks/feynman-activate.js
- **Verification:** Automated check re-ran, ALL CHECKS PASSED
- **Committed in:** 22b487e (part of task commit)

**2. [Rule 1 - Bug] Reduced process.stdout.write to exactly 1 occurrence**
- **Found during:** Task 1 acceptance criteria check
- **Issue:** Initial draft had `process.stdout.write` in both a comment and in code — acceptance criteria requires exactly 1 occurrence via grep
- **Fix:** Rephrased comment to say "Plain text stdout triggers..." without repeating the method name
- **Files modified:** hooks/feynman-activate.js
- **Verification:** `grep -c "process.stdout.write"` outputs `1`
- **Committed in:** 22b487e (part of task commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — minor comment phrasing to satisfy grep-based acceptance criteria)
**Impact on plan:** No logic changes; comment-only rewording. Zero scope creep.

## Issues Encountered

The `<verify>` script in the plan uses shell-escaped regex inside `node -e "..."` to check session_id sanitization (`'[/\\\\]|\\.\\.'`). The backslash escaping levels differ between shell and Node.js string parsing, causing the check to fail even when the correct regex (`/[/\\]|\.\./`) is present in the source. Resolved by writing the check to a temp file (`verify-hook.js`) which avoids shell escape issues.

## User Setup Required

None — the hook does not require external services. However, after cloning, users must manually register the hook in `~/.claude/settings.json` (Phase 3 install.sh will automate this):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/absolute/path/to/feynman/hooks/feynman-activate.js\"",
            "timeout": 5,
            "statusMessage": "Injecting diagram rules..."
          }
        ]
      }
    ]
  }
}
```

Path must be absolute (not `~/...`) per bug #8810. Phase 3 install.sh will write this automatically.

## Known Stubs

None — hook is fully functional. The idempotency guard stub (commented out in plan template) was deliberately omitted per RESEARCH.md resolution.

## Threat Flags

No new threat surface beyond what was analyzed in plan's threat model (T-02-01 through T-02-07). Hook introduces:
- One stdin read (sanitized)
- Two file reads (state.json, rules file — both gracefully handled on ENOENT/corrupt)
- One or two file writes (state.json counter; flag file on first run only)
- One stdout write (JSON only, no plain text)

All within the trust boundaries documented in the threat model.

## Next Phase Readiness

- `hooks/feynman-activate.js` is complete and ready for registration
- `state.json` schema (`{ enabled, intensity, count }`) is locked — Phase 2 skills must read/write using these exact field names
- `FLAG_PATH = ~/.claude/.feynman-active` is the canonical enable/disable signal — Phase 2 `/feynman` toggle skill must write/delete this file
- Calibration of rule trigger frequency (assumption A2 from RESEARCH.md) requires empirical testing after hook registration in settings.json

---
*Phase: 01-core*
*Completed: 2026-05-06*
