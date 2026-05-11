---
phase: 14-corpus-harness-setup
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - eval/v0.5.0-compliance/rules-v02.md
  - eval/v0.5.0-compliance/rules-v03.md
  - eval/v0.5.0-compliance/rules-v03-ladder.md
  - eval/v0.5.0-compliance/prompts.json
  - eval/v0.5.0-compliance/aggregate.js
  - eval/v0.5.0-compliance/results-v02-smoke-1.json
  - eval/v0.5.0-compliance/results-v02-smoke-2.json
autonomous: true
requirements:
  - CORP-01
  - CORP-02
  - CORP-03
  - CORP-04

must_haves:
  truths:
    - "eval/v0.5.0-compliance/ directory exists with 3 rule snapshots"
    - "prompts.json contains exactly 50 prompts with boundary/phrasing/domain fields"
    - "Class distribution matches: sequence×6, hierarchy×6, comparison×6, status×6, priority×4, branching×4, state-machine×4, mapping×4, none×10"
    - "All 15 v0.4.0 prompts are preserved (IDs unchanged) with new fields backfilled"
    - "aggregate.js exits 0 with 'no result files yet' when no results exist"
    - "Two smoke-run result files exist: results-v02-smoke-1.json and results-v02-smoke-2.json"
  artifacts:
    - path: "eval/v0.5.0-compliance/prompts.json"
      provides: "50-prompt balanced corpus"
      contains: "boundary, phrasing, domain fields on every entry"
    - path: "eval/v0.5.0-compliance/aggregate.js"
      provides: "7-arm numeric aggregator"
      contains: "CommonJS, zero deps, handles empty results"
    - path: "eval/v0.5.0-compliance/results-v02-smoke-1.json"
      provides: "Baseline run 1 for variance floor"
    - path: "eval/v0.5.0-compliance/results-v02-smoke-2.json"
      provides: "Baseline run 2 for variance floor"
  key_links:
    - from: "aggregate.js"
      to: "results-*.json"
      via: "glob pattern in same directory"
      pattern: "results-.*\\.json"
    - from: "smoke-run subagent"
      to: "eval/v0.5.0-compliance/rules-v02.md"
      via: "inline rules injection in subagent prompt"
---

<objective>
Build the evaluation infrastructure for the v0.5.0 7-arm measurement: a balanced 50-prompt corpus, rule snapshots, an aggregator script, and two smoke-run baselines to establish the variance floor.

Purpose: All downstream phases (15–18) depend on this corpus and harness being in place. The smoke-run establishes how much run-to-run variance exists for v0.2.x rules before any candidate rules are tested.

Output:
- eval/v0.5.0-compliance/ directory with rule snapshots, prompts.json, aggregate.js, and 2 smoke-run result JSONs
</objective>

<execution_context>
@/Users/ap/work/feynman/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ap/work/feynman/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/ap/work/feynman/.planning/ROADMAP.md
@/Users/ap/work/feynman/.planning/REQUIREMENTS.md

<interfaces>
<!-- Actual result JSON schema from eval/v0.4.0-compliance/results-v02.json -->
<!-- Use these exact field names in aggregate.js — do NOT use the brief's aliases -->
```json
{
  "arm": "v0.2.x",
  "rules_path": "eval/v0.4.0-compliance/rules-v02.md",
  "total_prompts": 15,
  "per_prompt": [
    {
      "id": "seq-01",
      "class": "sequence",
      "response_chars": 403,
      "response_has_diagram": true,
      "issue_count": 0,
      "issues_by_rule": {},
      "passed": true,
      "response_excerpt": "..."
    }
  ],
  "per_class": {
    "sequence": {"count": 2, "diagrams": 2, "clean": 2}
  },
  "per_rule_hits": {"L01": 0},
  "qualitative_summary": "...",
  "tokens_spent_estimate": "..."
}
```

<!-- Field name mapping (brief alias → actual field) -->
<!-- "lint_pass"   → "passed"            -->
<!-- "has_diagram" → "response_has_diagram" -->

<!-- Existing 15 prompt IDs to preserve (from eval/v0.4.0-compliance/prompts.json) -->
<!-- seq-01, seq-02, hier-01, hier-02, cmp-01, cmp-02, status-small, status-large, -->
<!-- prio-01, branch-01, state-01, map-01, single-01, single-02, rec-01          -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create directory and copy rule snapshots</name>
  <files>
    eval/v0.5.0-compliance/rules-v02.md
    eval/v0.5.0-compliance/rules-v03.md
    eval/v0.5.0-compliance/rules-v03-ladder.md
  </files>
  <action>
Create the directory `eval/v0.5.0-compliance/` and copy the three rule files from the v0.4.0 directory as immutable snapshots for this evaluation cycle:

```bash
mkdir -p eval/v0.5.0-compliance
cp eval/v0.4.0-compliance/rules-v02.md     eval/v0.5.0-compliance/rules-v02.md
cp eval/v0.4.0-compliance/rules-v03.md     eval/v0.5.0-compliance/rules-v03.md
cp eval/v0.4.0-compliance/rules-v03-ladder.md eval/v0.5.0-compliance/rules-v03-ladder.md
```

Do NOT modify the copied files. They are point-in-time snapshots.
Expected sizes after copy: rules-v02.md = 10450 bytes, rules-v03.md = 4480 bytes, rules-v03-ladder.md = 4443 bytes.
  </action>
  <verify>
    <automated>
ls -la eval/v0.5.0-compliance/rules-v02.md eval/v0.5.0-compliance/rules-v03.md eval/v0.5.0-compliance/rules-v03-ladder.md
# Confirm sizes match originals:
diff eval/v0.4.0-compliance/rules-v02.md eval/v0.5.0-compliance/rules-v02.md && echo "v02 OK"
diff eval/v0.4.0-compliance/rules-v03.md eval/v0.5.0-compliance/rules-v03.md && echo "v03 OK"
diff eval/v0.4.0-compliance/rules-v03-ladder.md eval/v0.5.0-compliance/rules-v03-ladder.md && echo "ladder OK"
    </automated>
  </verify>
  <done>Three rule files exist in eval/v0.5.0-compliance/ with byte-for-byte identical content to their v0.4.0 originals.</done>
</task>

<task type="auto">
  <name>Task 2: Write 50-prompt corpus</name>
  <files>
    eval/v0.5.0-compliance/prompts.json
  </files>
  <action>
Write `eval/v0.5.0-compliance/prompts.json` with 50 prompts. The file must be valid JSON — a single array of prompt objects, each with fields: `id`, `class`, `prompt`, `boundary`, `phrasing`, `domain`.

**Field rules:**
- `boundary` (boolean): true for exactly 1 prompt per class (9 total across 9 classes). The boundary prompt is a borderline/edge-case scenario for that class — e.g., a sequence with only 2 steps (near the threshold of "too simple to diagram"), or a `none` prompt that mentions a data flow but is really asking a concept question. The remaining prompts all get `boundary: false`.
- `phrasing`: one of `"direct"` (asks for a diagram/structure explicitly), `"open"` (general task description, structure implied), `"implicit"` (no structural language, but the content has structure).
- `domain`: one of `"devops"`, `"architecture"`, `"api"`, `"database"`, `"frontend"`, `"testing"`, `"general"`, `"concepts"`.

**Preservation rule (CORP-02):** The existing 15 prompts from v0.4.0 keep their original `id`, `class`, and `prompt` text unchanged. Add `boundary: false`, `phrasing`, and `domain` to them. Do NOT rename their IDs.

**Boundary designation:** Assign `boundary: true` entirely within the 35 new prompts (one per class). The existing 15 all get `boundary: false`.

**New prompts to write (35 total):**

sequence (need 4 new, IDs seq-03 through seq-06, one of which is boundary):
- seq-03: deployment rollback steps (open, devops, boundary:false)
- seq-04: database migration steps: backup → apply → verify → rollback if fail (direct, database, boundary:false)
- seq-05: OAuth2 authorization code flow: redirect → code → token exchange → resource access (direct, api, boundary:false)
- seq-06 BOUNDARY: two-step process — user submits form, server saves it (implicit, general, boundary:true) — borderline: only 2 steps, near the "single fact" threshold

hierarchy (need 4 new, IDs hier-03 through hier-06, one boundary):
- hier-03: Kubernetes cluster: nodes → pods → containers (direct, devops, boundary:false)
- hier-04: frontend component tree for a dashboard: App → Layout → [Sidebar, Main → [Chart, Table]] (direct, frontend, boundary:false)
- hier-05: PostgreSQL permission model: cluster → database → schema → table → column (open, database, boundary:false)
- hier-06 BOUNDARY: two-level structure — just a package with two modules inside (implicit, general, boundary:true)

comparison (need 4 new, IDs cmp-03 through cmp-06, one boundary):
- cmp-03: REST vs gRPC — latency, streaming, browser support (direct, api, boundary:false)
- cmp-04: unit tests vs integration tests vs e2e tests — speed, isolation, coverage (direct, testing, boundary:false)
- cmp-05: blue-green vs canary deployment — risk, rollback speed, traffic split (direct, devops, boundary:false)
- cmp-06 BOUNDARY: compare two things with only 1 criterion — which is faster: Redis or memcached for cache invalidation? (implicit, architecture, boundary:true)

status (need 4 new, IDs status-03 through status-06, one boundary):
- status-03: migration status across 8 services: auth, billing, users, orders, inventory, notifications, search, analytics (direct, devops, boundary:false)
- status-04: CI/CD pipeline stages status: lint, unit, integration, e2e, build, deploy-staging, deploy-prod (direct, devops, boundary:false)
- status-05: feature flag rollout: 5 flags with percentage (25%, 50%, 100%, disabled, monitoring) (open, general, boundary:false)
- status-06 BOUNDARY: status of 3 tasks (exactly at the 4-item borderline: below the frame threshold, above a single item) (implicit, general, boundary:true)

priority (need 3 new, IDs prio-02 through prio-04, one boundary):
- prio-02: rank 6 tech debt items from P0 to P3 (direct, architecture, boundary:false)
- prio-03: triage 4 user stories by business value and risk (open, general, boundary:false)
- prio-04 BOUNDARY: 2-item priority — just "which should we fix first: the memory leak or the slow query?" (implicit, general, boundary:true)

branching (need 3 new, IDs branch-02 through branch-04, one boundary):
- branch-02: webhook retry logic — first attempt fails → retry with backoff → if 3 retries fail → dead letter queue (direct, api, boundary:false)
- branch-03: feature flag branching — flag enabled? → new UX path; disabled? → old UX path; error reading flag → fallback to old (direct, frontend, boundary:false)
- branch-04 BOUNDARY: simple if/else — if the user is admin, show the button; otherwise hide it (implicit, general, boundary:true)

state-machine (need 3 new, IDs state-02 through state-04, one boundary):
- state-02: order lifecycle — placed → payment_pending → paid → fulfilling → shipped → delivered; cancelled from any pre-shipped state (direct, general, boundary:false)
- state-03: connection state — disconnected → connecting → connected → reconnecting → failed (open, architecture, boundary:false)
- state-04 BOUNDARY: two-state toggle — feature is on or off, toggled by user action (implicit, general, boundary:true)

mapping (need 3 new, IDs map-02 through map-04, one boundary):
- map-02: before/after for moving from callback hell to async/await in 4 key patterns (direct, api, boundary:false)
- map-03: before/after for Kubernetes migration — on-prem terms vs K8s equivalents: VM→Pod, machine→Node, config file→ConfigMap, restart script→liveness probe (direct, devops, boundary:false)
- map-04 BOUNDARY: map a single pair — old name vs new name for one renamed API endpoint (implicit, general, boundary:true)

none (need 7 new, IDs none-01 through none-07 for clarity, but use single-03 through single-07 and rec-02, rec-03 to match the naming pattern; one boundary):
- single-03: what does "eventual consistency" mean? (direct, concepts, boundary:false)
- single-04: what is a race condition? (direct, concepts, boundary:false)
- single-05: what is the difference between authentication and authorization? (open, concepts, boundary:false)
- single-06: what does 429 HTTP status mean? (direct, api, boundary:false)
- rec-02: how should I handle database connection pooling in a serverless function? (open, database, boundary:false)
- rec-03: what's the best way to version a REST API? (open, api, boundary:false)
- single-07 BOUNDARY: "explain the sequence of events when a browser loads a page" — none class but sounds like it could trigger a sequence diagram (implicit, general, boundary:true)

**Prompts should be:**
- In Russian (matching the existing corpus language)
- Realistic developer questions (not toy examples)
- Around 1-3 sentences each
- For `none` class: questions with definitively prose-only answers

Write the complete JSON file with all 50 entries in class-grouped order: all seq-* first, then hier-*, cmp-*, status-*, prio-*, branch-*, state-*, map-*, then none/single-*/rec-*.
  </action>
  <verify>
    <automated>
# Total count
jq 'length' eval/v0.5.0-compliance/prompts.json

# Class distribution
jq 'group_by(.class) | map({class: .[0].class, count: length}) | sort_by(.class)' eval/v0.5.0-compliance/prompts.json

# Boundary count (must be exactly 9)
jq '[.[] | select(.boundary == true)] | length' eval/v0.5.0-compliance/prompts.json

# Original 15 IDs preserved
jq '[.[] | select(.id | test("^(seq-0[12]|hier-0[12]|cmp-0[12]|status-small|status-large|prio-01|branch-01|state-01|map-01|single-0[12]|rec-01)$"))] | length' eval/v0.5.0-compliance/prompts.json
# Expected: 15
    </automated>
  </verify>
  <done>
- `jq 'length'` returns 50
- Class distribution: sequence×6, hierarchy×6, comparison×6, status×6, priority×4, branching×4, state-machine×4, mapping×4, none×10
- Exactly 9 prompts have `boundary: true` (one per class)
- All 15 original prompt IDs are present with original text unchanged
  </done>
</task>

<task type="auto">
  <name>Task 3: Write aggregate.js</name>
  <files>
    eval/v0.5.0-compliance/aggregate.js
  </files>
  <action>
Write `eval/v0.5.0-compliance/aggregate.js` — CommonJS, zero npm dependencies, ~100 lines.

**Behavior:**
1. Reads all `results-*.json` files in the same directory (`eval/v0.5.0-compliance/`)
2. If no result files found: prints `"no result files yet"` and exits with code 0
3. For each result file found, reads and computes per-arm metrics
4. Outputs a formatted text table to stdout comparing all arms

**Field names to use** (from actual schema — see `<interfaces>` block):
- Per-prompt: `passed` (boolean, not `lint_pass`), `response_has_diagram` (not `has_diagram`), `response_chars`
- Per-file top-level: `arm`, `total_prompts`, `per_prompt[]`

**Per-arm metrics to compute:**
- `arm` — the `arm` field from the JSON
- `prompts` — count of entries in `per_prompt`
- `lint_pass_rate` — percentage of prompts where `passed === true` (0 decimal places, e.g. `"100%"`)
- `diagram_rate` — percentage of prompts where `response_has_diagram === true` (0 decimal places)
- `avg_chars` — mean of `response_chars` across all prompts (integer, rounded)
- `total_chars` — sum of `response_chars`

**Output format** — fixed-width text table:
```
arm                        prompts  lint_pass  diagram_rate  avg_chars  total_chars
v0.2.x (smoke-1)                50      100%          68%        443       22150
v0.2.x (smoke-2)                50      100%          70%        451       22550
```

Use `arm` field as the row label. Pad columns for alignment using `String.padEnd` / `String.padStart`. Column widths: arm=30, prompts=8, lint_pass=10, diagram_rate=13, avg_chars=10, total_chars=12.

**File discovery logic:**
```javascript
const fs = require('fs');
const path = require('path');
const dir = __dirname;  // same directory as aggregate.js
const files = fs.readdirSync(dir).filter(f => f.match(/^results-.*\.json$/));
if (files.length === 0) {
  console.log('no result files yet');
  process.exit(0);
}
```

**Error handling:**
- If a result file cannot be parsed as JSON: print a warning to stderr and skip it
- If `per_prompt` is missing or empty: skip the file with a warning to stderr
- All valid files contribute to the table; partial results are included

**Do NOT** read the prompts.json or rule files — aggregate.js operates only on result JSONs.
  </action>
  <verify>
    <automated>
# Test 1: no results exist yet — must print message and exit 0
node eval/v0.5.0-compliance/aggregate.js
echo "Exit code: $?"

# Test 2: syntax check
node --check eval/v0.5.0-compliance/aggregate.js && echo "syntax OK"

# Test 3: no require() calls beyond 'fs' and 'path'
node -e "
const src = require('fs').readFileSync('eval/v0.5.0-compliance/aggregate.js','utf8');
const requires = src.match(/require\(['\"]([^'\"]+)['\"]\)/g) || [];
const forbidden = requires.filter(r => !r.includes('fs') && !r.includes('path'));
if (forbidden.length) { console.error('unexpected deps:', forbidden); process.exit(1); }
console.log('zero-dep check OK');
"
    </automated>
  </verify>
  <done>
- `node eval/v0.5.0-compliance/aggregate.js` exits 0 and prints `"no result files yet"`
- `node --check` passes (no syntax errors)
- Only `fs` and `path` are required (zero external deps)
  </done>
</task>

<task type="auto">
  <name>Task 4: Smoke-run baseline (2× subagent harness)</name>
  <files>
    eval/v0.5.0-compliance/results-v02-smoke-1.json
    eval/v0.5.0-compliance/results-v02-smoke-2.json
  </files>
  <action>
Run the subagent harness **twice** to generate two independent baseline runs of v0.2.x rules on the 50-prompt corpus. Each run is a separate Task tool invocation (do not reuse the same subagent for both runs).

**Subagent prompt template for each run** (substitute RUN_NUMBER = 1 or 2):

---
You are acting as a Claude Code subagent in an offline evaluation harness. Your job is to simulate how Claude responds to developer prompts when the feynman v0.2.x diagram rules are injected.

**Active diagram injection rules** (from eval/v0.5.0-compliance/rules-v02.md — read this file first):
Read the file `eval/v0.5.0-compliance/rules-v02.md` and treat its contents as your active diagram injection rules for this entire session.

**Task:**
1. Read `eval/v0.5.0-compliance/prompts.json` — this is your 50-prompt corpus.
2. For each prompt in the array, generate a response as if you were Claude with the v0.2.x rules active.
   - Apply the rules honestly — generate a diagram when the rules say to, prose-only when they say not to.
   - Responses should be realistic developer responses, in Russian (matching the corpus language).
   - Keep responses concise but complete — similar length to the examples in eval/v0.4.0-compliance/results-v02.json.
3. For each response, run the linter by writing the response to a temp file first, then passing the file path:
   ```bash
   # Write response to temp file, then lint by file path (NOT inline text)
   echo "$response" > /tmp/feynman-eval-response.txt
   node bin/feynman-lint.js --json /tmp/feynman-eval-response.txt
   ```
   Or in Node.js: `fs.writeFileSync('/tmp/feynman-eval-response.txt', responseText); execSync('node bin/feynman-lint.js --json /tmp/feynman-eval-response.txt')`
   - Parse the JSON output to get `issue_count` and `issues_by_rule`.
   - `passed` = true when `issue_count === 0`.
4. For `response_has_diagram`: set true if the response contains any of: `→`, `──`, `│`, `├`, `└`, `┌`, `┐`, `┘`, `▲`, `▼`, `|` (pipe used as table separator — must appear with spaces: ` | `).
5. Compute `response_chars` as the character count of the full response string.
6. After all 50 prompts are processed, write the result to `eval/v0.5.0-compliance/results-v02-smoke-RUN_NUMBER.json` using this exact schema:

```json
{
  "arm": "v0.2.x (smoke-RUN_NUMBER)",
  "rules_path": "eval/v0.5.0-compliance/rules-v02.md",
  "total_prompts": 50,
  "per_prompt": [
    {
      "id": "<prompt id>",
      "class": "<prompt class>",
      "response_chars": <integer>,
      "response_has_diagram": <boolean>,
      "issue_count": <integer>,
      "issues_by_rule": {},
      "passed": <boolean>,
      "response_excerpt": "<first 80 chars of response>"
    }
  ],
  "per_class": {
    "<class>": {"count": <n>, "diagrams": <n>, "clean": <n>}
  },
  "per_rule_hits": {
    "L01": 0, "L02": 0, "L03": 0, "L04": 0, "L05": 0, "L06": 0,
    "L07": 0, "L08": 0, "L09": 0, "L10": 0, "L11": 0, "L12": 0, "L13": 0
  },
  "qualitative_summary": "<2-3 sentences on compliance patterns observed>",
  "tokens_spent_estimate": "<estimate>"
}
```

IMPORTANT:
- Write the file with `fs.writeFileSync` via a Node.js one-liner, or use the Write tool directly.
- The JSON must be valid — no trailing commas, no undefined values.
- `per_rule_hits` should reflect actual linter output across all 50 responses.
- Run ALL 50 prompts — do not stop early.

---

After both subagents complete, run aggregate.js to verify it can read both files:
```bash
node eval/v0.5.0-compliance/aggregate.js
```

Then compute the variance floor — the difference in `avg_chars` between smoke-1 and smoke-2. Record this in a comment at the top of each result file is NOT required; just confirm the two runs are complete.
  </action>
  <verify>
    <automated>
# Both result files exist
ls eval/v0.5.0-compliance/results-v02-smoke-1.json eval/v0.5.0-compliance/results-v02-smoke-2.json

# Each has 50 per_prompt entries
jq '.per_prompt | length' eval/v0.5.0-compliance/results-v02-smoke-1.json
jq '.per_prompt | length' eval/v0.5.0-compliance/results-v02-smoke-2.json

# aggregate.js reads both and produces a table (not "no result files yet")
node eval/v0.5.0-compliance/aggregate.js | grep -v "no result"

# Count smoke result files (must be >= 1)
ls eval/v0.5.0-compliance/results-v02-smoke-*.json | wc -l
    </automated>
  </verify>
  <done>
- Both `results-v02-smoke-1.json` and `results-v02-smoke-2.json` exist in `eval/v0.5.0-compliance/`
- Each contains exactly 50 `per_prompt` entries
- `node eval/v0.5.0-compliance/aggregate.js` outputs a 2-row table (not "no result files yet")
- `ls eval/v0.5.0-compliance/results-v02-smoke-*.json | wc -l` returns 2
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| filesystem → aggregate.js | aggregate.js reads arbitrary JSON files from its own directory; a malformed file must not crash the script |
| subagent prompt → linter | subagent passes response text to feynman-lint; response may contain shell metacharacters |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-14-01 | Tampering | aggregate.js JSON parse | mitigate | wrap `JSON.parse` in try/catch; log warning to stderr and skip malformed files |
| T-14-02 | Denial of Service | aggregate.js glob | accept | eval/ directory is local dev only; no untrusted input |
| T-14-03 | Spoofing | smoke-run linter invocation | mitigate | pass response as file via `fs.writeFileSync` to /tmp, not as shell argument; avoids shell injection from diagram chars |
| T-14-04 | Information Disclosure | result JSONs | accept | eval/ is not published; contains only synthetic responses, no PII |
</threat_model>

<verification>
Run these after all tasks complete:

```bash
# 1. Directory structure
ls eval/v0.5.0-compliance/

# 2. Corpus size
jq 'length' eval/v0.5.0-compliance/prompts.json
# Expected: 50

# 3. Class distribution
jq 'group_by(.class) | map({class: .[0].class, count: length})' eval/v0.5.0-compliance/prompts.json
# Expected: sequence×6, hierarchy×6, comparison×6, status×6, priority×4, branching×4, state-machine×4, mapping×4, none×10

# 4. Boundary count
jq '[.[] | select(.boundary == true)] | length' eval/v0.5.0-compliance/prompts.json
# Expected: 9

# 5. aggregate.js with no results
node eval/v0.5.0-compliance/aggregate.js
# Expected: "no result files yet" (before smoke run) OR a 2-row table (after)

# 6. Smoke runs
ls eval/v0.5.0-compliance/results-v02-smoke-*.json | wc -l
# Expected: 2

# 7. Full aggregate table
node eval/v0.5.0-compliance/aggregate.js
# Expected: 2-row table with arm, prompts=50, lint_pass_rate, diagram_rate, avg_chars, total_chars
```
</verification>

<success_criteria>
1. `jq 'length' eval/v0.5.0-compliance/prompts.json` → `50`
2. Class distribution matches: sequence×6, hierarchy×6, comparison×6, status×6, priority×4, branching×4, state-machine×4, mapping×4, none×10
3. `node eval/v0.5.0-compliance/aggregate.js` exits 0 (prints "no result files yet" before smoke runs; prints 2-row table after)
4. `ls eval/v0.5.0-compliance/results-v02-smoke-*.json | wc -l` → `2`
5. All 15 original v0.4.0 prompt IDs present in prompts.json with original text unchanged
6. `node --check eval/v0.5.0-compliance/aggregate.js` passes with no errors
</success_criteria>

<output>
After completion, create `.planning/phases/14-corpus-harness-setup/14-01-SUMMARY.md` using the summary template. Include:
- Files created
- Variance floor (avg_chars delta between smoke-1 and smoke-2 runs)
- Class distribution confirmed
- Any deviations from the plan
</output>
