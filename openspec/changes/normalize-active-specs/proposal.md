## Why

Six active specifications fail OpenSpec 2.1.1 strict validation. These
baseline failures make it harder to see whether a new change introduced a
validation problem. See R10 in
`openspec/changes/reference-quality-remediation/tasks.md` and F12 in its audit.

## What Changes

- Move detailed cases out of long requirement bodies while preserving the
  existing obligations and scenarios.
- Add scenarios for staged settings and state write failures and for corrupt
  state backup failures. The existing requirement already covers both.
- Make the active requirements in repository-quality visible to OpenSpec.
  Keep the acceptance matrix and historical evaluation record intact.

## Non-goals

- Changes to product behavior or to the quality acceptance criteria.
- Applying other deltas from reference-quality-remediation.

## Review and application

[The comparison](review.md) maps the deltas to the current spec text. The
[repository-quality structure patch](repository-quality-structure.patch)
prepares that capability for the merge. OpenSpec archive carries requirement
blocks, but cannot add the missing headings around existing blocks.

After owner review, run from the repository root:

```sh
git apply --check openspec/changes/normalize-active-specs/repository-quality-structure.patch
git apply openspec/changes/normalize-active-specs/repository-quality-structure.patch
openspec validate normalize-active-specs --strict
openspec archive normalize-active-specs --yes
openspec validate --all --strict
```

If validation or archive fails before applying the deltas, pass the structure
patch to `git apply -R`. Each delta replaces blocks in one capability only.
After archive, a capability can be reverted by reversing its own spec diff
against the pre-application tree. For repository-quality, include its structure
changes in that reversal.
