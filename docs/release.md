# Release Documentation

This document defines the full release process for `@albinocrabs/feynman`, including changelog usage, release notes generation, publishing, and verification.

## 1) Scope and ownership

- Release versioning is package-driven (`package.json` `version`).
- GitHub release tags use `v${version}` format.
- Changelog is the canonical source for release notes.
- CI/release workflows live in `.github/workflows/ci.yml` and `.github/workflows/release.yml`.

## 2) Pre-release checks

1. Verify repo cleanliness and branch context.
2. Ensure `main` is clean and CI checks are green.
3. Confirm `package.json` version is the intended next version.
4. Confirm matching plugin manifest versions if changed.

Recommended commands:

```bash
git status --short --branch
git log --oneline -5 --decorate
npm run ci
```

## 3) Changelog-first release notes (required)

### What to update

- Edit top of `CHANGELOG.md` before tagging.
- Use this section format:

```md
## <version> - <YYYY-MM-DD>

Changes since v<previous-version>.

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Maintenance
- ...
```

### What goes into release notes

- `GitHub Release body` is generated from the section matching the new version in `CHANGELOG.md`.
- If no section exists or it is empty, workflow auto-falls back to:
  - `## <version>`
  - `Changes since <previousTag>.`
  - `- Release published from package.json version <version>.`

### Key rule

The workflow ignores changelog command output at publish time; it extracts directly from the repository changelog section for the version.

## 4) Version and release flow

### Step-by-step sequence

1. Update files for release:
   - `package.json` and `package-lock.json` version bump.
   - Matching versions in `.claude-plugin/plugin.json`,
     and `plugins/feynman/.codex-plugin/plugin.json`.
   - top `CHANGELOG.md` section for that version.
2. Run release checks:
   - `npm run ci`
3. Commit and push to `main`.
4. Create and publish GitHub release tag `v<version>`:
   - Via UI or CLI.
5. GitHub release workflow executes automatically:
   - validates repository and package checks,
   - extracts changelog notes,
   - uploads tarball artifact,
   - updates/creates release body,
   - publishes to npm (if not already published),
   - verifies npm propagation.

Manual local command examples:

```bash
git add package.json package-lock.json CHANGELOG.md \
  .claude-plugin/plugin.json \
  plugins/feynman/.codex-plugin/plugin.json
git commit -m "chore: release v<version>"
git push origin main

gh release create v<version> --generate-notes --target main
```

If you need a full dry run without publish, use workflow dispatch:

```bash
gh workflow run release.yml -f dry_run=true
```

## 5) What each workflow step does

- Checkout with full history + tags (`fetch-depth: 0`, `fetch-tags: true`).
- Resolve metadata from `package.json`:
  - `package_name`
  - `package_version`
  - `tag`
  - previous tag for fallback context.
- Parse `CHANGELOG.md` for matching `## <version>` section.
- Build and test release artifact (`npm run ci` + `npm run build`).
- Upload `dist/*.tgz` artifact.
- Update release notes on GitHub release.
- Publish to npm using `NPM_TOKEN` (skipped if version already exists).
- Verify publication via repeated `npm view` checks.

## 6) Post-release verification

Run in order:

1. Git state and alignment:

```bash
git rev-parse --short HEAD
git rev-parse --short origin/main
```

2. Release artifact validation:

```bash
gh release view v<version> --json name,tagName,isDraft,isPrerelease,url -q '.name+"\\n"+.tagName+"\\n"+.isDraft+"\\n"+.isPrerelease+"\\n"+.url'
gh release view v<version> --json body -q .body
```

3. NPM publication:

```bash
npm view @albinocrabs/feynman@<version> version
npm view @albinocrabs/feynman dist-tags
```

4. Smoke test from clean env:

```bash
node --version # confirm the supported Node.js baseline
npx -y @albinocrabs/feynman@latest version
```

## 7) Troubleshooting

- **Release notes still show CI/CD text**
  - Ensure tag points to commit containing the new `CHANGELOG.md` section.
  - Ensure section header exactly matches `## <version>`.
- **Publish failed**
  - confirm `NPM_TOKEN` is set in repo secrets,
  - verify package name in `package.json`.
- **Release not auto-updated**
  - run on `release` event only or manual dispatch with `dry_run=false`.

## 8) Required docs references

- [Release process (short)](../README.md) – README overview.
- [CI workflow](./launch.md#release-checklist).
- [Release workflow](../.github/workflows/release.yml).
