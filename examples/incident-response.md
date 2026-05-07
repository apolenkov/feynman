# Incident Response: API Latency Spike and 502s

## Question

> My API started returning intermittent 502s and latency jumped from 120ms to
> 4s. I have Redis, API pods, and DB replicas. How should we triage and restore
> service in the next 20 minutes?

## Without feynman

The API has a latency issue. First verify if the issue is traffic-related or a
deployment regression, then inspect pods, then check cache hit rates, and then
inspect database query times. If the pods are overloaded, scale horizontally and
enable degraded mode. If Redis errors increase, fail over to DB reads with a strict
timeout. If replicas are behind replication lag, move read traffic back to primary
only and notify users of elevated error rates.

## With feynman

Triage and restore sequence:

```
[Alert: 502 + latency spike] --> [1) Confirm incident scope]
                                  |
                                  +--> [Critical path only]
                                  |        |
                                  |        +--> [Disable non-core features]
                                  |        |
                                  |        +--> [Enable queue fallback]
                                  |
                                  +--> [2) Isolate root layer]
                                           |
                                            yes --------------------------+
                                           /                               |
                                  [Cache regression?]                  [No]
                                     | no                                |
                                     v                                   v
                                   [DB latency?]                      [Deployment rollback?]
                                      | no                               | yes
                                      v                                  v
                                  [Scale API / limit RPS]            [Rollback last deploy]
                                      |                                  |
                                      v                                  v
                                  [Service partially stable]        [Restore response rate]
```

Live status summary:

```
┌─ Incident Runbook ────────────────────┐
  step-1        in-progress
  step-2        pending
  step-3        pending
  external-comm on-call-channel
└───────────────────────────────────────┘
```

Priority gates:

```
▲ high
  API error budget burn
  Security-sensitive write path (stop writes if needed)
▼ low
  Nice-to-have dashboards
  Cosmetic alert updates
```

## Why this works

This example combines sequential flow (triage stages), branch isolation, status
frames, and priority scale. It turns ad-hoc firefighting into an explicit,
readable execution plan before any action is taken.
