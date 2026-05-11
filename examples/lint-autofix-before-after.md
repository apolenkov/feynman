# feynman-lint --fix: frame alignment before / after

## Before (misaligned right edge)

```text
┌──────────────┐
│ short        │
│ very long content here │
│ medium line  │
│ one more     │
│ x            │
│ last row here│
└──────────────┘
```

The inner lines are wider (or shorter) than the border — right `│` column drifts.

## After (`feynman-lint --fix file.md`)

```text
┌───────────────────────┐
│ short                 │
│ very long content here│
│ medium line           │
│ one more              │
│ x                     │
│ last row here         │
└───────────────────────┘
```

All inner lines padded to the same display width; top and bottom borders
redrawn to match the widest content row.

## L11 dot-leader conversion (≤5 inner lines with label/state pattern)

Frames with 1–5 inner lines where each line is a `label state` pair get
converted to a dot-leader list instead of realigned:

Before:

```text
┌────────┐
│ build done │
│ test  done │
└────────┘
```

After:

```text
build .... done
test  .... done
```

## Running the fix

```bash
feynman-lint --fix path/to/file.md   # rewrites file in place
```

Exit code is always `0` on success. If the frame was already aligned the file
is not touched (idempotent).
