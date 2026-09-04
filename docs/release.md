# Release guide

This is the release contract for `@albinocrabs/feynman`. Release ownership is
the repository maintainer; CI and the GitHub Release workflow are the gates.

## Preconditions

```bash
git status --short --branch
npm ci
npm run ci
```

Use Node.js 22.18 or newer. The working tree must be clean before the version
bump.

## Package reproducibility

Run the package check after `npm ci` and before publishing:

```bash
node scripts/check-reproducibility.ts
```

It runs `scripts/build-package.ts` twice in sequence, keeps the second tarball
in `dist/`, and accepts only byte-identical package bytes. It prints the
retained tarball's SHA-256. Run it in a worktree where no user, editor, or
process changes source files, lockfiles, or installed dependencies until it
finishes. The checker fingerprints the workspace before and after each build,
excluding its generated outputs; concurrent changes that are reverted before a
snapshot cannot be detected.

## Version and notes

1. Curate the top `[Unreleased]` section in `CHANGELOG.md`.
2. Run `node scripts/feynman-bump.ts <version> --dry-run`.
3. Run the bump with its explicit commit, tag, and push flags:

```bash
node scripts/feynman-bump.ts <version> --commit --tag --push
```

The script updates `package.json`, `package-lock.json`, and the native Codex
manifest. A populated `[Unreleased]` section is promoted to the versioned
section; conventional commits are only a fallback when notes are absent. It
then runs the full `npm run ci` gate before it can create a commit or tag.
If preparation fails, it restores the original bytes of all four release files
and reports any restoration failure. Commit, tag and push happen after this
reversible preparation phase.

Repeated changelog generation preserves curated versioned notes. Generated
sections carry a checksum comment and are replaced only while their contents
remain unchanged. Editing a generated section makes it curated; unmarked older
sections are also preserved. A current-version heading is never duplicated to
promote additional `[Unreleased]` notes: those notes remain pending for review.

## GitHub publication

Create a GitHub Release for the pushed tag:

```bash
gh release create v<version> --title "<version>" --target main \
  --notes-file <release-notes.md>
```

The release workflow checks out the tag, runs the full CI/build gate, uploads
the package artifact, and publishes it through npm Trusted Publishing (GitHub
OIDC). It then verifies registry propagation and runs the published-package
smoke test. The workflow has the required `id-token: write` permission and
does not receive an npm publish token. Both publication and rehearsal use
pinned npm 12.0.2; review and verify a new npm version before changing this pin.
npm 11.5.1 or newer is required for Trusted Publishing.

Workflow permissions default to `contents: read`. Only the publishing job gets
repository write and OIDC permissions; `dry_run=true` runs a separate read-only
job. Release runs are serialized, and checkout does not persist Git credentials.
The exact artifact built and smoke-tested by CI is uploaded and published
without rebuilding it afterward. Third-party actions are pinned to full commit
SHAs verified against their official repositories; Dependabot proposes updates.

### One-time npm configuration

In npm package settings for `@albinocrabs/feynman`, add a **Trusted Publisher**
of type **GitHub Actions** with these exact values:

- GitHub user or organization: `apolenkov`
- Repository: `feynman`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`
- Environment: leave empty

Use npm's package settings rather than copying credentials into local files or
chat. After the first successful OIDC release, remove the obsolete GitHub
repository secret named `NPM_TOKEN`.

For a non-publishing rehearsal, use the workflow's `dry_run=true` dispatch.
Validate workflow syntax locally with `actionlint` before changing the release
flow. A local check cannot prove registry permissions or OIDC publication;
retain evidence from an authorized GitHub run for those claims.

## Post-release verification

```bash
gh release view v<version> --json tagName,isDraft,isPrerelease,url
npm view @albinocrabs/feynman@<version> version
npx -y @albinocrabs/feynman@<version> version
```

Confirm that `main`, the tag, GitHub Release, and npm version all refer to the
same package version. Keep the successful release run as operational evidence;
remove only obsolete or failed runs when performing repository housekeeping.
