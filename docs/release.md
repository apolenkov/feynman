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
does not receive an npm publish token. It upgrades npm to the current release
before publishing; npm 11.5.1 or newer is required for Trusted Publishing.

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

## Post-release verification

```bash
gh release view v<version> --json tagName,isDraft,isPrerelease,url
npm view @albinocrabs/feynman@<version> version
npx -y @albinocrabs/feynman@<version> version
```

Confirm that `main`, the tag, GitHub Release, and npm version all refer to the
same package version. Keep the successful release run as operational evidence;
remove only obsolete or failed runs when performing repository housekeeping.
