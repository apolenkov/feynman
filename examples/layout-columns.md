# Layout Columns: Before / After Config

## Question

> Show me the old and new nginx config side by side so I can see what changed.

## Without feynman

The old config had no gzip, a single worker process, and a 30-second
timeout. The new config enables gzip with level 6, sets worker_processes
to auto, and reduces the timeout to 10 seconds for faster failure detection.

## With feynman

```
before                    │ after
──────────────────────────┼──────────────────────────
worker_processes 1        │ worker_processes auto
gzip off                  │ gzip on
gzip_comp_level —         │ gzip_comp_level 6
keepalive_timeout 30      │ keepalive_timeout 10
proxy_read_timeout 30     │ proxy_read_timeout 10
```

Single `│` separator, rows aligned. Changes read left-to-right; each row
is one setting so nothing is buried in prose.

## Why this works

A side-by-side config comparison is a parallel-columns layout — feynman's
column-separator rule activates. A single `│` between the two columns
(not a markdown table) keeps the visual minimal. The `──┼──` header
separator makes the column boundary explicit without adding frame overhead.
