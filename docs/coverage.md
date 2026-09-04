# Coverage

`npm run coverage` emits `coverage/lcov.info`; `npm run check:coverage` is the
single line-coverage gate used by local CI and GitHub Actions. The gate requires
at least 95% of the aggregate LCOV `LH`/`LF` lines. Incomplete, duplicate,
non-numeric and inconsistent line-total fields are rejected before calculation.

The gate also requires a coverage record for every first-party TypeScript file
under `bin/`, `hooks/`, `lib/` and `scripts/`, plus the executable
`eslint.config.mjs`. Missing sources and arbitrary records outside that inventory
fail acceptance. Tests are excluded from the production measurement. New
production TypeScript files join the inventory automatically; there are no
unmeasured production-file exceptions.

The configuration file was already included in the historical percentage and
remains included. Its explicit inventory entry preserves that denominator instead
of dropping fully covered configuration lines to hide a mismatch. The current
inventory contains 37 TypeScript files plus configuration, 38 sources total.

## Historical baseline and expanded scope

At `fa0d2d5521ae7f21576d8f67152a8cc9d69dc504`, the reported 95.47% covered
29 of 36 production TypeScript files plus configuration. Seven scripts had no
coverage record: build-package, check-reproducibility, evaluate, feynman-bump,
feynman-highlight, release-smoke and verify-published-package. The earlier checker
only disclosed these omissions; it did not fail them. That historical percentage
must not be presented as whole-repository coverage or compared directly with a
larger denominator without stating the scope change.

After the strict implementation pass, the first complete local run measured
98.01% (6,741/6,878 lines), with all 38 inventory records and 502 passing tests.
This is an intermediate worktree result, not final-revision acceptance; subsequent
fixes require a new run. The retained command output and final acceptance record
identify the source revision, runtime, numerator and denominator.

## Meaning of the evidence

The aggregate is a floor, not proof of correctness. Negative tests separately
exercise malformed data, process failure, cleanup failure, atomic writes,
rollback, source drift, missing coverage and unavailable commands. Script tests
use temporary repositories and explicit fake command boundaries; real local
process-adapter tests cover environment inheritance and `ENOENT`. They do not
claim live model, registry or deployment success. Real packaging smoke and live
skill evaluations remain separate acceptance evidence.
