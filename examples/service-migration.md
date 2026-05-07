# Service Migration: Move Billing to a New Provider

## Question

> We need to migrate billing from Provider A to Provider B. What is the safest rollout
> sequence with fallback and acceptance gates?

## Without feynman

Start in read mode to keep both providers enabled, compare charge outcomes for a
sample of users, run a pilot for low-risk plans, then run a staged migration to
full traffic with manual approval and rollback checkpoints.

## With feynman

Migration ladder:

```
[Dual-run mode]
      |
      v
[Replay 30 days of traffic] --> [Compare divergence < 1%] --> [Pilot 5% users]
      |
      v
[Auto-scaling smoke] --> [Pilot 30% users] --> [100% rollout]
      |
      +--> [Error rate > threshold] --> [Disable 30% wave]
      |
      +--> [Critical incidents] --> [Fallback to A]
```

Vendor comparison:

```
Option A (keep)   | Option B (move)      | Hybrid (dual)
------------------|----------------------|------------------
steady risk       | new integration risk  | controlled transition
low complexity     | higher validation    | higher ops cost
higher cost risk   | lower long-term cost  | medium monitoring
fast execution     | phased execution      | slower initial step
```

Go/no-go gates:

- divergence_rate <= 1%
- failed callbacks < 0.2%
- latency_p95 <= baseline + 20ms
- reconciliation queue no growth

Fallback playbook:

- trigger: payment failure spike
- action: switch traffic to A
- deadline: < 10 minutes
- owner: on-call + fintech lead

Execution priority:

```
▲ high
  reconciliation accuracy
  callback reliability
▼ low
  brand messaging tweaks
  custom dashboard layout
```

## Why this works

В миграции ключевая ценность — показывать не просто шаги, а условия перехода между
ступенями. Поток делает это явно: переход к следующей стадии возможен только при
прохождении метрик и готовности fallback.
