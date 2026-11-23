# Gate evidence

All measurements use commit a7dac0d0feb681b2b91da19856e901436d6fbec8. An independent local clone under a temporary directory isolated prepare/lefthook installation and the build's deletion of .build and dist. Commands ran with a cleared environment and temporary HOME, CODEX_HOME, TMPDIR, npm config/cache and package cache. Only PATH and task-specific CI/Git values were supplied. Network was used for dependency audit and the repository's pinned GitHub checker. No publish, release, model evaluation or deployment command ran.

| Invocation | Exit | Observed result |
|---|---:|---|
| npm ci | 0 | Clean lockfile install. prepare registered hooks inside the disposable clone. |
| npm run ci (one invocation) | 1 | audit returned 0 vulnerabilities; format, typecheck and ESLint passed. check:factory-workflows timed out downloading the pinned native checker. The shell short-circuited before coverage. |
| npm run check:factory-workflows, separate retry | 0 | Official schema and pinned upstream actionlint passed. |
| npm run coverage, separate | 1 | 981 tests: 980 pass, 1 fail, 0 skipped. The actionlint download/disposal test hit a network read error (EADDRNOTAVAIL). |
| node --test --test-name-pattern="downloads actionlint once" tests/factory-operations.test.ts | 0 | The one failed test passed on focused retry (1/1). |
| npm run check:coverage, separate | 0 | 16,827 / 17,566 lines = 95.79%; all 55 expected source records present, no outside records. |
| npm run test:docs, separate | 0 | Product lint checked 38 documents; tracked drift pass also ran. |
| npm run check:reproducibility, separate | 0 | Two clean builds agreed on SHA-256 eb8b17ea435f4e9d1a33f696de5ac5d286fff9d8d3321b04ca070cbbb431e0a8. |
| npm run test:release, separate | 0 | 16 manifest entries checked; retained 2.1.1 tarball installed and passed isolated runtime smoke. |

The new change passed `openspec validate reference-quality-remediation --strict`. The broader `openspec validate --all --strict` returned 1 both in the clean baseline (3 pass / 6 fail) and with the audit (4 pass / the same 6 fail). Four specs raise strict long-requirement warnings. Two also lack required structure or scenarios. The baseline already owns these diagnostics; see F12.

## Effective file sets

- tsc --showConfig returned exactly 105 tracked TS files. Compiler options from that run are in [typescript.jsonl](typescript.jsonl). Root commitlint.config.ts is outside this program. The build additionally restricts emit to bin, hooks and lib (28 TS files).
- ESLint.calculateConfigForFile confirmed projectService for the same 105 TS files, root JS config under base JS rules and commitlint.config.ts ignored. The two representative rule expansions are [core](eslint-core.jsonl) and [tests](eslint-tests.jsonl). Both use typed strict/stylistic presets. Core adds import and ambient I/O restrictions; test registration has a scoped promise exemption. Do not add another strict preset.
- Node's test glob selects 45 top-level test files. Six nested TS helpers are imported, not standalone test entries. There are no tracked nested *.test.ts files. A future nested suite would need an explicit discovery decision. evals contains Markdown and JSON; its runner scripts are typed, linted and part of the coverage denominator.
- The executable LCOV scope is 54 TS files in bin/hooks/lib/scripts plus eslint.config.mjs. Tests are excluded from production measurement. The gate checks both missing and extra source records before applying the 95% aggregate floor. The per-file [LCOV totals](coverage.jsonl) reconcile the numerator and denominator. See the boolean fields on each [source row](../inventory.jsonl).
- npm run lint invokes the diagram linter. npm run eslint runs the TypeScript-aware code checker. The docs command lints named roots plus direct Markdown children of docs and examples; the independent drift sweep reads tracked files with explicit exclusions. format:check selects ts/mjs/json/yml/yaml and respects .prettierignore. JSONL has its own parse/identity checks in this audit.
- Hosted CI defines six OS/runtime combinations, installs the pinned Codex tool and runs the full gate. CodeQL, Scorecard, release, and the four factory entrypoints have distinct permissions and triggers. [Workflow jobs](workflows.jsonl) describe their static shape. Hosted jobs did not execute as part of this audit.

## Disposable paired controls

Each pair used git worktree add --detach at the snapshot under the job temp directory. The fixtures were removed with their worktree. No invalid source was introduced on the audit branch.

| Question / command | Permitted control | Controlled variation | Result |
|---|---|---|---|
| ESLint max-lines-per-function, max 50, skip blank/comment lines, TS parser | Valid 50-line tally function | Same body with one more valid addition | Exit 0 / 1; exactly the named size rule. |
| ESLint max-lines, max 300, same exclusions | Valid 300-line array module | Same initializer with one extra element | Exit 0 / 1; exactly the named file rule. |
| Does scripts/check-docs.ts surface unexpected tracked read failures? | Unmodified tracked SUPPORT.md | Tracked path now refers to a directory and readFileSync cannot obtain text | Both exit 0, both report 38 docs. This concerns the tracked drift sweep, separate from the named diagram-lint list. F08. |

A separate paired state-store check used a disposable worktree and synthetic temporary preferences. The control started disabled, returned inactive, retained the file bytes and created no backup. With only the state-file read changed to throw EIO, reconciliation returned active, replaced the preferences and created a backup. This records an I/O failure and ordinary state transition without disclosing any user data (F13).

In a disposable worktree the initial bootstrap succeeded and created its ownership marker. A simulated copy failure during force replacement exited 1, removed the previous complete bundle and left a partial directory without the marker. Retrying normally exited 0; retrying with force exited 2 (F15). The random-example control selected activity-flow.md: 50 source lines, 26 preview lines (F14).

Applying the two size rules in memory to all 54 implementation TS files found 14 file and 71 function candidates. The 85 distinct identities in [size-candidates.jsonl](size-candidates.jsonl) use rule, path and qualified symbol/callback role. Locations aid lookup; they are outside the hash. This establishes candidate detection. A disposable 51-line function retained its identity after two lines were inserted before it. Renaming the violating function produced a different identity at a constant count of one. Approval, stale-entry handling and comparison across revisions remain PROJECTED in R08.

## Self-check and replay

At the pinned revision, compare `git ls-tree -rlz HEAD` to the inventory by path, size, mode and blob. Independently compute each blob as SHA-1 of the Git blob header plus file bytes. In the audit checkout use the full snapshot SHA in place of HEAD. Parse each JSONL line as one JSON value. Compare each function range to its file's line count and blob, each relative dependency to a tracked target, and each Markdown link to a local destination. The self-check reconciled all 299 paths with the index and working bytes, all 3,234 execution ranges, 107 module records and all 85 unique size identities. The pre-challenge completion check reconciled 23 findings and 18 tasks. The subsequent independent challenge brought these to 31 findings and 21 numbered tasks. The [implementation plan](../../tasks.md) records current dependencies and landed work. R08 follows R04–R06, and R09 waits for integration. R06 also needs the factory owner’s manifest review. The scoped diff contains only change artifacts. Public material was checked for local home paths, credentials and private-key markers.

A second reproducibility and release-smoke check with the staged audit files in the disposable clone produced the same tarball SHA-256 as the clean snapshot. The OpenSpec location therefore adds zero bytes to the npm artifact in this build.


## Source-reading completion

The 79 remaining source blobs contribute 1,364,914 bytes and 36,208 physical lines. They contain 2,892 registered execution units. The 30 initial reads account for the other 214 units. The 128 workflow jobs and steps remain structural. F16–F23 record static evidence and the tests that bound each claim. None of these findings rests on a hosted run.

On the completion pass, Prettier with the repository ignore rules exited 0, npm run test:docs exited 0 (38 documents), and openspec validate reference-quality-remediation --strict exited 0. The repository excludes Markdown from formatting and has no JSONL parser in the format gate. JSONL parsing, snapshot identities, complete ranges, local links, finding counts and the task dependency graph passed separate checks. The pre-push hook runs typecheck, ESLint, tests and docs. The single full-CI measurement above remains the snapshot result.

## Integrated branch after the independent challenge

The release runtime at `2f72cee` (macOS arm64, Node 24.22.3, npm 11.19.1) passed the full CI gate with the challenge documents staged. All 990 tests passed with zero skips. Line coverage was 16,888/17,623 (95.83%) across all 56 expected sources. Both package builds produced SHA-256 `2c8ddb757a9e6e9681b8661417decce7224647d9e34eae86b51375887e3ef32e` and the retained tarball passed release smoke. The first invocation stopped at npm startup because of a machine-level configuration conflict. The successful run isolated that configuration for the process. These results supplement the historical C4 measurement above.
