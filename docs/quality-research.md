# Quality research: a minimal, verifiable Codex plugin

Research date: 2026-09-04. This note records decisions and evidence for the
baseline `3d470161b5709da6cad764b23f9e10ae734b14df`. Local observations below
describe that baseline unless explicitly identified as later verification.
It is a bounded standards review, not a certification and
not evidence that the Feynman idea improves answers. Any claim about user value
requires a live, controlled with/without evaluation.

## Decision: use a skill-only core, package it as a plugin

OpenAI's current plugin documentation says that a plugin always has a
`.codex-plugin/plugin.json` manifest and may include `skills/`, hooks, MCP
configuration, and assets. Its minimal example contains one manifest and one
skill directory ([Package your plugin](https://developers.openai.com/plugins/build#package-your-plugin),
especially the minimal example and structure sections).

The same documentation says that a skill can work without an MCP server when it
needs only packaged instructions and resources, and that each skill should stay
focused on a recognizable user goal. It also defines a skill as the place for
workflow, decision points, output requirements, examples, and templates
([Build skills](https://developers.openai.com/plugins/build/skills)). Therefore
the minimum sufficient product for Feynman is:

* one plugin manifest;
* one focused `SKILL.md` for selecting a useful visual explanation;
* only the references or deterministic resources that the skill actually needs.

An MCP server is not applicable: this repository has no external data,
authentication, or controlled remote action. OpenAI's guidance assigns those
responsibilities to an MCP server, while a packaged skill can provide reusable
instructions alone. An app, UI, and authentication flow are likewise not
applicable to the Codex-only, local explanation workflow.

The CLI, state store, and SessionStart hook are optional product extensions,
not proof of plugin quality. Keep them only if a user-visible requirement is
demonstrated (for example, persistent local preferences or an independently
useful linter) and covered by integration tests. A hook adds trust and lifecycle
complexity: OpenAI says plugin hooks are non-managed until the user reviews and
trusts the current definition, and supplies `PLUGIN_ROOT` and `PLUGIN_DATA` to
hook commands ([plugin lifecycle hooks](https://developers.openai.com/plugins/build#bundled-mcp-servers-and-lifecycle-hooks)).
The current repository instead installs a user-level `~/.codex/hooks.json`
entry through the npm CLI (`docs/codex-plugin.md`, `bin/adapters/codex-config.ts`);
that is a separate installation path and must not be confused with a native
plugin-bundled hook.

## Skill contract and usefulness gate

OpenAI requires `SKILL.md` metadata (`name` and `description`) and explains that
the description drives activation. The body must define expected input, steps,
output, facts not to infer, stop/question conditions, and supporting files. It
recommends concise instructions with details in directly linked resources
([Build skills](https://developers.openai.com/plugins/build/skills)). The
repository's current `plugins/feynman/skills/feynman/SKILL.md` has the required
frontmatter and a clear smallest-useful-visual rule, but it also carries state
management instructions and invokes `npx ...@latest`; this couples the
conversation skill to network/package resolution and should be retained only if
the measured workflow requires it.

OpenAI's prescribed skill test set includes direct and indirect activating
requests, incomplete inputs that should cause a question, non-activating
requests, and edge cases where the model must not invent information or take an
unsupported action ([Test the skill](https://developers.openai.com/plugins/build/skills#test-the-skill)).
Feynman's acceptance suite must include all five classes and record activation,
output shape, factual preservation, and refusal/suppression behavior.

This still does not establish that diagrams help. A separate live evaluation
must run the same representative prompts with Feynman enabled and disabled,
using a fixed model/configuration and blinded rubric. Include architecture,
explanation, comparison, diagnosis, and ordinary prose prompts. Score
comprehension/accuracy and unwanted visualizations, and record token usage and
latency. Report sample size, exclusions, and uncertainty; do not claim benefit
from static tests or a green CI run.

## TypeScript, simplicity, and controlled mutation

Local evidence: `tsconfig.json` already enables `strict`, unused checks,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, verbatim module
syntax, isolated modules, and consistent casing. The core/commands/adapters
boundary is documented in `docs/architecture.md`; state I/O is intended to be
centralized in `bin/adapters/state-store.ts`.

The current ESLint configuration spreads `@typescript-eslint` flat/recommended,
but does not configure type-aware linting or the strict/stylistic presets.
The typescript-eslint documentation distinguishes `recommended` from
`recommended-type-checked`, `strict`, and `strict-type-checked`; it explicitly
warns that strict presets are opinionated and can change outside a major
version. Its typed-linting setup requires parser project service configuration,
and its flat example composes strict and stylistic type-checked presets
([shared configurations](https://typescript-eslint.io/users/configs/),
[typed linting](https://typescript-eslint.io/getting-started/typed-linting/)).
Apply the strongest compatible type-aware configuration deliberately, pin its
major version, and document every rule exception with a local reason. Do not
use a mass-disable to make the migration green.

“Immutable” is an engineering boundary, not a promise that JavaScript has
become immutable. Use `readonly`/`Readonly` contracts and return new values in
the pure core; do not mutate caller-owned arrays, objects, or parsed input.
Permit mutation only in narrowly named adapter operations (local buffers,
filesystem transaction assembly, and counters), and test that the input remains
unchanged. Enforce this with type-aware lint rules and targeted code review;
avoid a decorative immutable abstraction layer that obscures this small codebase.

## Node.js tests and coverage

Node's built-in `node:test` runner is stable since Node 20. Its coverage support
is still documented as experimental in current Node documentation. Coverage
can include/exclude globs and emits line, branch, and function totals; the lcov
reporter is supported ([Node test runner: coverage](https://nodejs.org/api/test.html#collecting-code-coverage)).
The repository uses Node's test runner and a 95% line threshold in
`scripts/check-coverage.ts`, but the coverage command excludes `tests/**` and
does not itself make branch coverage a gate. Keep the 95% line threshold, add a
reviewed source-scope manifest, and require tests for critical negative branches
(invalid input, corrupt state/recovery, disabled paths, unsafe package/layout
conditions). A high line percentage cannot substitute for those behavioral
cases. The supported runtime floor is Node `>=22.18.0` in `package.json`; verify
the chosen coverage flags on that floor rather than relying only on Node 26
documentation.

## npm, GitHub, and release supply chain

Local evidence: `package-lock.json` is committed, `npm ci` is required by
`AGENTS.md`, runtime dependencies are empty, Dependabot is configured, and CI
runs audit/typecheck/tests/coverage/build/release smoke. npm documents that
`npm ci` requires a lockfile, fails when it disagrees with `package.json`, and
does not rewrite either file; npm also recommends an isolated `linked` install
strategy for package authors to expose undeclared (phantom) dependencies
([npm ci](https://docs.npmjs.com/cli/commands/npm-ci/)). npm's lockfile docs
state that the committed lockfile describes the exact dependency tree for
teammates, CI, and deployments ([package-lock.json](https://docs.npmjs.com/files/package-lock.json/)).
Use these as reproducible-install evidence and smoke-test the packed tarball in
a clean temporary project with no repository-relative imports.

GitHub's security guidance says full-length commit SHA pinning is the only
immutable form for third-party actions and recommends least-privilege workflow
permissions ([secure use](https://docs.github.com/en/actions/reference/security/secure-use)).
The current `.github/workflows/ci.yml` and `release.yml` use mutable `@v7`
action tags. Pin each external action to a verified full SHA, keep
`contents: read` by default, and grant release write/id-token permissions only
to the publishing job. Review shell interpolation and untrusted PR execution.

npm provenance links a published package to its source and build instructions;
npm says GitHub Actions publishing needs a hosted runner, `id-token: write`, and
`npm publish --provenance` (or trusted publishing), and warns that provenance
does not prove a package is harmless ([npm provenance](https://docs.npmjs.com/generating-provenance-statements/)).
The current release workflow grants OIDC permission but publishes a tarball
without an explicit `--provenance`; provenance is therefore unverified until
the workflow and a registry attestation are checked. Do not claim signed or
provenanced releases from the YAML alone.

## OpenSSF applicability matrix

Use OpenSSF Scorecard's current checks as a practical SDLC checklist, not as a
certificate. The Scorecard project describes checks for CI tests, vulnerabilities,
dependency updates, pinned dependencies, packaging, token permissions, security
policy, signed releases, SAST, branch protection, code review, and related
controls ([checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md),
[repository check list](https://github.com/ossf/scorecard)).

Applicable to this repository and locally reviewable: CI tests; vulnerability
audit; dependency-update automation; committed lockfile and pinned workflow
actions; least-privilege token permissions; license; security policy; packaging
smoke tests; and documented code review/branch policy. Signed releases,
registry provenance, branch protection, required reviews, and the live
Scorecard result require GitHub/npm state and are not proven by this checkout.
SAST and fuzzing are risk-based additions. Type-aware static checks apply to all
first-party TypeScript. The Markdown parser and autofixer already accept
untrusted input, so bounded generated-input tests for no crashes, input
preservation, and convergence are applicable. A continuously hosted fuzzing
service needs a separate cost/benefit decision. Contributors-from-multiple-organizations and project
age/maintenance are repository-governance properties, not implementation gates.

OpenSSF specifically explains that pinned dependencies reduce substitution and
compromised-release risk and recommends hash-pinning GitHub workflow actions
alongside an update tool ([Pinned-Dependencies](https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies)).
Treat any unavailable external check as `unverified`, never as pass.

## Required evidence before declaring the repository an exemplar

1. A requirements matrix maps every applicable criterion to one command, test,
   or inspectable artifact and records justified non-applicability.
2. A fresh `npm ci` and `npm run ci` pass on Node `>=22.18`; formatting,
   type-aware ESLint, and product lint have no warnings/errors.
3. Behavioral tests cover activation/suppression, negative input, state
   recovery, hook/CLI boundaries, lint/autofix, and clean package smoke tests.
4. The native marketplace directory and npm tarball are independently inspected
   from clean temporary locations; their checksums and included files are
   recorded for the exact source revision.
5. The with/without live evaluation reports whether Feynman improves useful
   answers enough to justify its token/latency cost. If it does not, simplify or
   remove the extra packaging surface rather than declaring success.
