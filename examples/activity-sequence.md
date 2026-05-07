# Action Sequencing: Checkout Incident During Peak

## Question

> Checkout error rate jumps during peak and latency is now above SLO. We need a
> concrete action sequence for recovery, including who does what, when to rollback,
> and when to stop doing damage-control.

## Without feynman

The team usually starts by checking dashboards, then opens an emergency channel,
then asks backend and DB teams to investigate. If they find a single failing
dependency they rollback that change; otherwise they add read-through cache and
throttle traffic. Communication goes out if the user impact is material.

## With feynman

Operational sequence:

```
[Alert: checkout error spike] --> [On-call acknowledges in 60s]
                                   |
                                   +--> [Is impact external?]
                                               |
                                               +-- yes --> [Start Incident Commander]
                                               |
                                               +-- no  --> [Fast path mitigation only]
                                                                   |
                                                                   v
[Notify org channel] --> [Freeze non-critical deploys] --> [Triage by layer]
                                                          |
                                                          v
                                               [Cache/DB/API/Infra]
                                                          |
                                              [Need rollback?]
                                                      |
                                                       +-- yes --> [Rollback scoped deploy]
                                                       |
                                                       +-- no  --> [Apply temporary safeguard]
                                                           |
                                                           v
                                               [Stabilize + reduce blast radius]
                                                          |
                                                          v
                                                  [Declare recovery ETA]
                                                          |
                                                          +-- success --> [Post-incident audit]
                                                          |
                                                          +-- degraded --> [Resume changes]
```

State board (what changed inside the incident):

```
┌─ Incident Action Board ───────────────────────┐
│ triage              : done                    │
│ command setup       : done                    │
│ mitigation active   : in-flight               │
│ rollback            : ready                   │
│ customer comms      : live                    │
│ root-cause evidence : collecting              │
└───────────────────────────────────────────────┘
```

Critical path decomposition:

```
[Containment]
  ├── [Enable queue throttle]
  ├── [Route reads to replica]
  └── [Turn on circuit breaker]
[Recovery]
  ├── [Collect flamegraphs]
  ├── [Compare with healthy minute]
  └── [Prepare rollback diff]
[Verification]
  ├── [Canary checks]
  ├── [Synthetic transaction replay]
  └── [SLO probe]
```

Priority ladder during incident:

```
▲ high
  data integrity checks
  user-visible checkout path
▼ low
  dashboard chart style changes
  PR comments cleanup
```

Runbook gate table:

```
check                | owner          | threshold      | action
--------------------|----------------|----------------|-------------------------
P95 latency         | SRE            | <= 700ms       | continue with mitigation
error budget burn    | SRE            | <= 3%/15m      | escalate communications
db retry pressure    | Backend lead    | <= 2x baseline | rotate to fallback path
cache hit rate       | Platform lead   | >= 78%         | stop throttling traffic
```

This template forces action ordering, makes ownership explicit, and keeps the
team from drifting between investigation and mitigation under stress.
