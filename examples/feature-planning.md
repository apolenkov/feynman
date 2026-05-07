# Feature Planning: Build Internal Search or Use Managed API

## Question

> We need fast text search by title/body tags. Should we build it ourselves or use
> a managed search service? Compare the options by cost, speed, and maintenance.

## Without feynman

Building search internally gives us full control over ranking but requires schema
indexing work, query tuning, and ongoing reliability engineering. A managed API
is faster to deliver and has better relevance out of the box, but it increases
vendor dependency and recurring cost. We can reduce risk by evaluating latency,
cost, and maintenance for a 6-month period and then revisiting.

## With feynman

Decision matrix:

```
Option            | build-internal                  | managed-search-service
------------------|--------------------------------|--------------------------
speed-to-market   | 8-12 weeks                    | 1-2 weeks
query latency     | 60-120ms (with cache)          | 40-80ms
maintenance       | high (2 engineers, on-call)     | low
vendor lock-in    | none                           | medium-high
relevance quality | custom control, tuning effort   | high, pre-tuned
```

Decision flow:

```
[Need search by title/body now?] --> [Yes]
                                   |
                                   v
                        [Evaluate managed by default]
                                   |
                                   +--> [POC in 2 weeks]
                                   |        |
                                   v        v
                      [Latency/cost ok]   [No]
                            |               |
                            v               v
                         [Adopt]      [Re-open internal build path]
                            |
                            v
                     [Plan v1 migration in 1 sprint]
```

Governance priority:

```
▲ high
  Vendor contract review (SLA, data residency)
  Incident drill: provider outage fallback plan
▼ low
  UI polish in search result cards
  Advanced synonym tuning
```

## Why this works

The plain comparison becomes explicit with columns, and the execution path becomes
operational through a flow diagram. This helps teams decide with one view of
trade-offs and controls.
