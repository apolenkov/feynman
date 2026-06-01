---
status: accepted
---

# TypeScript source with a packaging-time build, zero runtime deps preserved

The hook and CLI are authored in TypeScript (ESM, `type: module`) and compiled
to plain JavaScript by `scripts/build-package.ts` (`tsc`) only at npm-packaging
time. In development the `.ts` files run directly via Node's type-stripping
(`engines.node >= 22.6`); the published tarball ships compiled `.js` with all
hook/CLI references rewritten `.ts` → `.js`. This supersedes the original
constraint of "pure JavaScript, no build step, CommonJS" recorded in earlier
docs.

The end-user promise is unchanged: `dependencies` stays `{}`, the installed
hook is plain JS, and no build runs on the user's machine. Only the **dev
toolchain** gained TypeScript (`devDependencies` only).

## Considered options

- **Stay pure CommonJS, single-file, no toolchain** — original design. Maximal
  auditability (shipped source == repo source, 1:1) and zero dev setup, but no
  type checking across a codebase that grew to a lint pipeline, a multi-target
  installer, and ~250 KB of tests.
- **TypeScript with a packaging build (chosen)** — type safety and refactor
  confidence across the now-larger surface; the cost is a `tsc` step at publish
  time and a divergence between repo source (`.ts`) and shipped artifact (`.js`).

## Consequences

- Documentation must describe `.ts` for the repo source and note that published
  files are `.js`. The two are mechanically related by `build-package.ts`.
- Node baseline rose from 18 to **22.6** (required for direct `.ts` execution).
  Any doc or script claiming "Node >= 18" is stale.
- `zero-dep` in marketing/README refers to **runtime** deps; the project is not
  toolchain-free.
