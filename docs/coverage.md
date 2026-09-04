# Coverage

`npm run coverage` emits `coverage/lcov.info`; `npm run check:coverage` is the
single line-coverage gate used by local CI and GitHub Actions. It keeps the
existing aggregate of every LCOV `LH` and `LF` record and requires at least
95% lines. The checker rejects incomplete, duplicate, non-numeric, or
internally inconsistent `LH`/`LF` records before it calculates that aggregate.

The percentage is not a claim that every repository file is covered. On each
run, the checker enumerates every first-party TypeScript source in `bin/`,
`hooks/`, `lib/`, and `scripts/`, then separately prints the files absent from
LCOV. Tests are intentionally outside that production inventory. LCOV can also
contain support files outside the inventory, such as `eslint.config.mjs`; those
records remain in the unchanged aggregate and are reported separately.

## Reviewed inventory evidence

The following was recorded from the local `npm run coverage && npm run
check:coverage` run on 2026-09-04. It establishes the scope of the 95% gate at
that point; the command remains the source of truth as files change.

| Evidence | Result |
| --- | --- |
| Aggregate line coverage | Recorded by the command output for all LCOV `LH`/`LF` records |
| First-party TypeScript inventory | 36 files: all `.ts` files below `bin/`, `hooks/`, `lib/`, and `scripts/` |
| Files recorded by LCOV | 29 of 36 production TypeScript files |
| LCOV records outside that inventory | `eslint.config.mjs` |
| Production files absent from LCOV | `scripts/build-package.ts`, `scripts/check-reproducibility.ts`, `scripts/evaluate.ts`, `scripts/feynman-bump.ts`, `scripts/feynman-highlight.ts`, `scripts/release-smoke.ts`, `scripts/verify-published-package.ts` |

The seven scripts listed as absent are not covered by the current LCOV report.
They are disclosed by the checker; the 95% aggregate does not silently turn
their absence into a whole-repository coverage claim.
