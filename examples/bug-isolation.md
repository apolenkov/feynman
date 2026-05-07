# Bug Isolation: Intermittent 500s in Checkout

## Question

> Checkout API starts returning 500s at random intervals under normal load. How do we
> isolate root cause without a full-service shutdown?

## Without feynman

Start by checking logs, then look at DB and cache metrics, then inspect release notes,
and finally reproduce with synthetic traffic around the failure window. If needed, roll
back gradually while validating with a canary cohort.

## With feynman

Hypothesis tree:

```
intermittent 500s
├── app code
│   ├── null dereference
│   └── unhandled exception
├── data layer
│   ├── deadlock / lock timeout
│   ├── stale row locks
│   └── missing index
├── infrastructure
│   ├── DB connection pool exhaustion
│   └── Redis timeout
└── operational
    ├── rollout wave overlap
    └── scheduled jobs interference
```

Isolation flow:

```
[Symptom observed] --> [Scope blast radius]
                          |
               +----------+----------+
               |                     |
               v                     v
      [Single endpoint only]    [All endpoints]
              |                     |
          yes/no                yes/no
              |                     |
              v                     v
     [Replay payload]         [Re-check infra]
              |                     |
               v                     v
   [Exception trace matches]
   [Connection errors]
              yes/no
              |                |
              v                v
        [fix app]       [next hypothesis]
              |                |
              v                v
       [fix infra]    [rollback segment]
```

Impact priority:

```
▲ high
  user checkout failure
  payment status integrity
  canary regression safety
▼ low
  low-frequency telemetry noise
  non-critical UI latency
```

Validation decision table:

```
check             | command                        | expected
------------------|--------------------------------|-------------------------
error correlation  | logs + correlation ids         | grouped by checkout_id
db pressure       | pool saturation metrics        | stable for 15m
cache health      | hit rate and timeout count     | no timeout spike
deployment diff   | feature flags + release notes  | no new high-risk delta
```

## Why this works

Схема строит диагностику от гипотез к действиям: дерево сокращает пространство
поиска, flow управляет последовательностью экспериментов, а приоритетный блок
показывает, что лечится немедленно.
