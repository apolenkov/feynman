# Strict TypeScript/Node standard

Research date: 2026-09-05. This is a source-backed implementation standard for
the TypeScript code in this repository. It records a recommended gate and the
remaining migration work; it does not certify the current checkout.

## Decision

Adopt `@typescript-eslint`'s type-aware strict configuration as the lint base,
then add a small project policy for ownership, input validation, exhaustiveness,
and module boundaries. Add the three TypeScript options that close the current
runtime and control-flow gaps: `noImplicitReturns`,
`noUncheckedSideEffectImports`, and `erasableSyntaxOnly`.

The immutability contract is about ownership. Core functions must not mutate
caller-owned data, public data parameters are deeply readonly, and state/flag
updates return a new value. A scanner may mutate a newly allocated result
buffer or a counter when that keeps the algorithm linear and the ownership is
obvious. This is a reviewable, named case; it is not permission to mutate an
input or to replace every `let` and loop mechanically.

Use guards and decoders at `unknown` boundaries, require exhaustive handling of
discriminated unions, and reject narrowing assertions and non-null assertions.
Keep iteration idiomatic to the algorithm: `map`/`filter`/`find` for value
transforms, `for...of` when an index is not needed, and an indexed or stateful
loop when it expresses early exit or a one-pass state machine.

This recommendation separates four kinds of evidence:

| Evidence | What it can establish |
| --- | --- |
| TypeScript and Node documentation | Language, compiler, and runtime behavior |
| `typescript-eslint` documentation | Preset and rule behavior; not a universal language standard |
| Local commands and source inspection | The current checkout's gaps and compatibility |
| Project policy below | The stricter ownership and acceptance contract chosen for this codebase |

## Current baseline and gap

The observed source revision is `fa0d2d5521ae7f21576d8f67152a8cc9d69dc504`.
The worktree had unrelated in-progress changes when this note was prepared;
the observations below refer to committed source unless a command is named.

* [`tsconfig.json`](../tsconfig.json) already has `strict`, unused local and
  parameter checks, `noImplicitOverride`, `noFallthroughCasesInSwitch`, exact
  optional properties, unchecked indexed access, index-signature property
  checks, verbatim module syntax, and isolated modules.
* [`eslint.config.mjs`](../eslint.config.mjs) uses `flat/recommended` and
  `flat/recommended-type-checked`, with `projectService: true` and several
  useful local rules. It does not yet use the strict or stylistic type-checked
  presets. `no-param-reassign` is scoped to `lib/`, and the non-null rule is
  scoped to production paths rather than the whole first-party test surface.
* [`package.json`](../package.json) declares Node `>=22.18.0`, TypeScript
  `6.0.3`, ESLint `10.9.1`, and `@typescript-eslint` `8.69.0` in the installed
  tree. The package runs TypeScript source directly in development and builds
  JavaScript for distribution.
* The architecture puts pure parsing, linting, and state-model code under
  `lib/`, with Codex and filesystem I/O under `bin/adapters/` and hooks. See
  [`docs/architecture.md`](architecture.md). That boundary is the right place
  to enforce input ownership and static imports.

A read-only trial adding `strict-type-checked` and
`stylistic-type-checked` produced 301 diagnostics in the saved
`eval/strict-preset-baseline.json` artifact. The primary verified that the artifact has exactly 57 unique paths, matching
all 57 tracked first-party TypeScript files at that revision: 36 production
files and 21 test files, with no duplicates, omissions or extra paths. The largest groups were:

| Rule | Diagnostics |
| --- | ---: |
| `no-non-null-assertion` | 122 |
| `prefer-nullish-coalescing` | 40 |
| `prefer-optional-chain` | 37 |
| `no-unnecessary-condition` | 32 |
| `array-type` | 30 |
| `prefer-regexp-exec` | 23 |
| `prefer-includes` | 8 |
| Other rules | 9 |

This inventory measures migration cost. It does not justify disabling the
rules or presenting the current configuration as strict.

The following read-only compiler probe passed on the current source:

```sh
npx tsc --noEmit \
  --noImplicitReturns \
  --noUncheckedSideEffectImports \
  --erasableSyntaxOnly \
  --allowUnreachableCode false \
  --allowUnusedLabels false
```

That pass is evidence of compatibility with these options at the installed
TypeScript version. It is not proof that the options are already part of CI or
that direct execution has been tested on the Node 22.18 floor.

## Proposed gate

| Area | Required gate | Current gap and bounded exception |
| --- | --- | --- |
| Compiler control flow | Keep the existing strict options. Add `noImplicitReturns`, `noUncheckedSideEffectImports`, and `erasableSyntaxOnly`. Keep `allowUnreachableCode: false` and `allowUnusedLabels: false` as explicit policy. | The first three options are absent from the committed config even though the probe passed. No source-level exception is needed. |
| Type-aware lint | Compose `strict-type-checked` with `stylistic-type-checked`, using the installed flat-config API, and keep the plugin major pinned and reviewed on upgrades. Do not use `all`. | The current config stops at recommended type-checked rules. The strict presets are deliberately opinionated and not semver-stable, so this is a project decision with a recorded migration baseline, not an automatic vendor mandate. The source map below links the configuration and typed-linting guidance. |
| Core input ownership | Enable `prefer-readonly-parameter-types` for `lib/` public and exported APIs. Require nested `readonly` arrays, tuples, and object properties. Use `ignoreInferredTypes: true` only for unannotated callback parameters whose type is supplied by an external API; do not add a project-wide `allow` list. | The rule is type-aware and reports mutable nested shapes. The current core has four explicit violations under this focused setting. A third-party type that cannot be made readonly must be wrapped at the adapter boundary and named in a local review record. |
| Return ownership | For exported core APIs, write an explicit return type. Mark returned collections and value objects `readonly` when callers must not mutate them; return a fresh value when the function transforms input. | `prefer-readonly-parameter-types` governs parameters, not return contracts. TypeScript `readonly` is a compile-time contract, so frozen-input tests or a boundary clone are required when runtime aliasing matters. The source map below links the TypeScript readonly guidance. |
| Caller and state mutation | Enable `no-param-reassign` with `props: true` for every first-party scope. Core and state-model functions must not mutate incoming objects, arrays, flags, or state. Adapter operations may mutate only a newly created working copy before an atomic write. | The current rule is limited to `lib/`. Inspection found caller mutation in `bin/adapters/codex-config.ts` (`removeFeynmanHooks`) and direct hook-array assembly in `bin/commands/install.ts`. Refactor those paths to clone or construct a new value. The named local scanner buffers in `lib/lint/` can remain mutable when their allocation and ownership are local; each such case should be evident from the function, with a test that frozen input is unchanged. |
| Type assertions | Enable `no-unsafe-type-assertion` for all first-party TypeScript. Narrow `unknown` with runtime predicates or decoders. Use `satisfies` for checked literals where the value's inferred type must be preserved. | The current source contains assertion-heavy JSON and fixture boundaries. A narrowing assertion is not an exception for convenience; isolate an external schema assertion behind a decoder and test invalid input. The rule allows broadening assertions, but those still need a reason at untrusted boundaries. |
| Nullability | Enable `no-non-null-assertion` for `hooks/`, `lib/`, `bin/`, `scripts/`, and `tests/`. Prefer a guard, optional chain, or an explicit failure with context. | The strict preset trial found 122 occurrences. No blanket file or test-directory disable is justified. A generated or third-party invariant, if one remains, belongs in one adapter wrapper with a line-level comment naming the invariant and a regression test. The source map below links the rule's explanation of why `!` bypasses the nullable type contract. |
| Boolean and condition checks | Enable `strict-boolean-expressions` and `no-unnecessary-condition` after the strict migration, with explicit options for this codebase. Require checks at JSON, CLI, and hook boundaries; do not add redundant guards solely to satisfy the linter. | A focused probe reports 99 strict-boolean and 35 unnecessary-condition diagnostics on the current working source. Some checks protect runtime input and should remain; unreachable checks should be removed or the type contract corrected. |
| Errors | Enable `only-throw-error`, `prefer-promise-reject-errors`, and the type-aware catch policy. Throw `Error` instances with context; normalize caught `unknown` before reporting or returning it. | This is a behavior contract for CLI, hook, and adapter failures. Do not convert every expected CLI failure into a union merely to avoid exceptions; preserve the existing command API while making thrown values and catch handling typed. |
| Discriminated unions | Model finite command, state, and parser modes as literal or discriminated unions. Enable `switch-exhaustiveness-check` with `considerDefaultExhaustiveForUnions: false` and `requireDefaultForNonUnion: false`. Use an explicit `never` check or an error default only at an untrusted boundary. | The current switch statements mostly dispatch arbitrary CLI strings, so a default is appropriate there. The rule found one current non-union switch candidate. Future finite modes must add an explicit case when the union changes; TypeScript's narrowing is the language mechanism behind this policy. |
| Exported API clarity | Enable `explicit-module-boundary-types` for exported production functions and methods. Keep local inference where the function is private and the inferred type is clear. | The current probe found three candidate boundary diagnostics. Requiring annotations on every private callback would add noise without improving the ownership contract. |
| Side-effect imports | Make `noUncheckedSideEffectImports` a typecheck gate. Keep core imports statically visible through the existing `no-restricted-imports` and dynamic-import restriction. Side-effect imports belong only in an adapter or hook whose purpose is documented. | There are no current side-effect import statements in the scoped source. The compiler option closes the typo case that TypeScript otherwise ignores; asset-loader exceptions would need an ambient declaration, as the official option documentation describes. |
| ESM and direct Node runtime | Keep explicit relative extensions, `verbatimModuleSyntax`, and type-only imports. Run direct TypeScript commands on Node 22.18 in CI. `erasableSyntaxOnly` forbids enums, runtime namespaces, parameter properties, import aliases, and other syntax that Node's type stripper cannot erase. | Node 22.18's built-in TypeScript support performs type stripping without type checking and is marked active development. The exact floor has not been exercised in this environment, which currently reports Node 26.8.1. |
| Iteration and performance | Enable `prefer-for-of` where an index is unused. Prefer one-pass loops for scanners, early exits, counters, and state machines. Use value combinators when they express a value transformation. | Do not add blanket `no-loop-statements`, `no-let`, or `immutable-data` gates. The scanner's local buffers and counters have an ownership and performance reason; replacing them with chained copies or `reduce` can obscure control flow and increase allocations. Refactoring a hot path requires a before/after benchmark or a test-sized complexity check. |

Rule source map:

* `noImplicitReturns`: [TypeScript option](https://www.typescriptlang.org/tsconfig/noImplicitReturns.html)
* `noUncheckedSideEffectImports`: [TypeScript option](https://www.typescriptlang.org/tsconfig/noUncheckedSideEffectImports.html)
* `erasableSyntaxOnly`: [TypeScript option](https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html)
* `prefer-readonly-parameter-types`: [typescript-eslint rule](https://typescript-eslint.io/rules/prefer-readonly-parameter-types/)
* `no-unsafe-type-assertion`: [typescript-eslint rule](https://typescript-eslint.io/rules/no-unsafe-type-assertion/)
* `no-non-null-assertion`: [typescript-eslint rule](https://typescript-eslint.io/rules/no-non-null-assertion/)
* `only-throw-error`: [typescript-eslint rule](https://typescript-eslint.io/rules/only-throw-error/)
* `prefer-promise-reject-errors`: [typescript-eslint rule](https://typescript-eslint.io/rules/prefer-promise-reject-errors/)
* catch values: [use-unknown-in-catch-callback-variable rule](https://typescript-eslint.io/rules/use-unknown-in-catch-callback-variable/)
* `strict-boolean-expressions`: [typescript-eslint rule](https://typescript-eslint.io/rules/strict-boolean-expressions/)
* `no-unnecessary-condition`: [typescript-eslint rule](https://typescript-eslint.io/rules/no-unnecessary-condition/)
* `switch-exhaustiveness-check`: [typescript-eslint rule](https://typescript-eslint.io/rules/switch-exhaustiveness-check/)
* `explicit-module-boundary-types`: [typescript-eslint rule](https://typescript-eslint.io/rules/explicit-module-boundary-types/)
* `prefer-for-of`: [typescript-eslint rule](https://typescript-eslint.io/rules/prefer-for-of/)

The Node runtime constraints come from its own documentation: type stripping is
enabled by default in 22.18, does not type-check, and recommends `nodenext`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`, and (when emitting) relative
extension rewriting. See [Node TypeScript modules](https://nodejs.org/download/release/v22.18.0/docs/api/typescript.html).
Node's ESM loader requires extensions for relative and absolute imports; see
[mandatory file extensions](https://nodejs.org/download/release/v22.18.0/docs/api/esm.html#mandatory-file-extensions).

## Why a functional plugin is not the gate

The maintained [`eslint-plugin-functional` rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/tree/main/docs/rules)
describes `no-let` as disallowing mutable variables and `no-loop-statements` as
disallowing every `for`, `for...of`, `for...in`, `while`, and `do...while` loop.
Those are functional-programming style choices, not TypeScript or Node
requirements. Its own [`no-let` documentation](https://raw.githubusercontent.com/eslint-functional/eslint-plugin-functional/main/docs/rules/no-let.md)
allows a `let` in a classic loop only through an option, while its
[`no-loop-statements` documentation](https://raw.githubusercontent.com/eslint-functional/eslint-plugin-functional/main/docs/rules/no-loop-statements.md)
proposes `map` or `reduce` for all loops.

That package is not a current dependency. Its latest inspected changelog entry
was v10.0.0 (2026-06-03), which supports ESLint 10 and drops Node 18; peer
compatibility with this exact lockfile and Node 22.18 still needs a disposable
pilot. Do not add it just to obtain an immutable-looking score. If a future
pilot is useful, limit it to core ownership rules, run it against the parser's
linear paths, and reject any configuration that needs a broad ignore pattern or
forces needless copies.

## Rollout and acceptance

1. Retain the verified 57-path strict-preset inventory, then add
   `strict-type-checked` and `stylistic-type-checked` to the flat config. Keep
   the version pinned and review changes to these unstable presets on upgrades.
2. Add the three compiler options and make the probe above part of the normal
   `typecheck` command. Run it on Node 22.18 as well as the development version.
3. Fix assertion and nullability findings with guards and decoders. Convert
   mutable public data parameters to readonly contracts, and make state/flag
   updates copy-on-write. Keep named local algorithm buffers only where their
   ownership and linearity are clear.
4. Add the selected rules for assertions, errors, conditions, exhaustiveness,
   API boundaries, and `prefer-for-of`. Use no global rule-disable or path-based
   exemption for migration debt. An unavoidable external invariant must be
   isolated in a named adapter, documented at the line, and covered by a test.
5. Verify behavior with the repository's existing typecheck, ESLint, product
   linter, tests, coverage, docs check, package build, and release smoke test.

The implementation is ready to call strict when all of these denominators are
explicit and green:

| Acceptance denominator | Required result |
| --- | --- |
| Every unique file in `tsconfig.json`'s include globs | TypeScript and typed ESLint complete with zero errors and zero warnings |
| Every first-party `.ts` file under `hooks/`, `lib/`, `bin/`, `scripts/`, and `tests/` | Zero non-null assertions and zero unsafe narrowing assertions; no path-wide suppression |
| Every function parameter in the exported/core ownership surface | Deeply readonly unless the parameter is a primitive, callback, or an explicitly owned mutable adapter value |
| Every exported production function | Explicit input and return contract; returned mutable data is either intentionally owned or copied |
| Every incoming object/array at a core boundary | Frozen-input or equivalent aliasing test proves it remains unchanged |
| Every finite union or discriminated mode | All cases handled, with unknown external values rejected or mapped explicitly |
| Every side-effect import and core dependency | Import resolves, is statically visible, and has a documented adapter/hook purpose |
| Every loop changed during migration | Review records why a combinator is clearer or why the loop preserves one-pass/early-exit behavior; hot paths retain measured complexity |

## Unresolved questions

* The final configuration must publish its current unique-file denominator;
  new first-party files join the verified 57-path baseline rather than being
  omitted from the acceptance scope.
* The exact Node 22.18 runtime path and coverage command have not been exercised
  in this environment. Node 26 passing would not prove the floor.
* `@typescript-eslint` strict presets are intentionally unstable under semver;
  the repository currently uses caret ranges, so the release policy must decide
  whether exact dependency pins or a reviewed lockfile update are required.
* The adapter mutation sites named above require implementation work. This
  research note does not claim that the current source already satisfies the
  copy-on-write policy.
* A functional-plugin pilot would require package metadata and peer-dependency
  verification in an isolated temporary install. Until that evidence exists,
  it is a deferred experiment rather than a project gate.

## Primary sources

* [TypeScript `strict`](https://www.typescriptlang.org/tsconfig/strict.html),
  [compiler option reference](https://www.typescriptlang.org/tsconfig/),
  [narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html),
  [object and readonly types](https://www.typescriptlang.org/docs/handbook/2/objects.html),
  and [`satisfies`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator).
* `typescript-eslint` [shared configurations](https://typescript-eslint.io/users/configs/),
  [typed linting](https://typescript-eslint.io/getting-started/typed-linting/),
  [readonly parameters](https://typescript-eslint.io/rules/prefer-readonly-parameter-types/),
  [unsafe assertions](https://typescript-eslint.io/rules/no-unsafe-type-assertion/),
  [non-null assertions](https://typescript-eslint.io/rules/no-non-null-assertion/),
  and [switch exhaustiveness](https://typescript-eslint.io/rules/switch-exhaustiveness-check/).
* Node 22.18 [TypeScript modules](https://nodejs.org/download/release/v22.18.0/docs/api/typescript.html),
  [ES modules](https://nodejs.org/download/release/v22.18.0/docs/api/esm.html),
  and [CLI/test options](https://nodejs.org/download/release/v22.18.0/docs/api/cli.html).
* `eslint-functional` [rule sources](https://github.com/eslint-functional/eslint-plugin-functional/tree/main/docs/rules)
  and [changelog](https://raw.githubusercontent.com/eslint-functional/eslint-plugin-functional/main/CHANGELOG.md).

Release-note classification is also checked against [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/): breaking footers and the `!` marker carry the breaking signal, `BREAKING-CHANGE` is an equivalent footer token, and commit types are case-insensitive. These checks correct observed classification and history-preservation defects; they do not add a new release format.

## Implementation decisions

The project adopted both complete presets, the listed compiler checks and
additional ownership/error rules in the strengthened acceptance contract.
The lockfile remains the reproducible dependency boundary: `npm ci` is required,
and dependency updates must review effective rule changes and pass the sentinel
suite. No functional-plugin dependency was introduced. A narrowly scoped AST
mutation guard complements readonly contracts without making every loop illegal.
The historical floor-runtime runs do not validate the changed source; final
Node 22.18 checks and an updated inventory remain required.
