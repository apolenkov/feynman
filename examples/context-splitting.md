# Context Splitting: Product Initiative to Deploy a New Onboarding Assistant

## Question

> We want to launch a new onboarding assistant next quarter. It touches web UI, backend,
> legal review, and customer support. How should we split work so leadership can
> understand risk, dependencies, and rollout order in one view?

## Without feynman

The initiative includes multiple teams and timelines. First we should do discovery and
alignment between engineering, legal, and support. Then UI and backend work must start,
because both rely on design contracts. A pilot should run with 10% of new users, then
global rollout should happen after legal and reliability checks are complete.

## With feynman

Scope decomposition:

```
[Onboarding assistant]
  ├── Product & UX
  │     ├── onboarding copy
  │     ├── microcopy guardrails
  │     └── in-app hints
  ├── Platform
  │     ├── assistant API
  │     ├── telemetry events
  │     └── admin flags
  ├── Legal & Compliance
  │     ├── consent text
  │     └── data retention policy
  └── Operations
        ├── runbook
        ├── on-call drill
        └── rollback script
```

Cross-team launch flow:

```
[Legal approves data flow] --> [Backend API contract ready]
                                   |
                                   v
 [UX/Copy draft] --> [Integration tests] --> [10% pilot]
                                   |               |
                           fail --> [fix + retest]   v
                                                  [60-day rollback check]
                                   |
                                   +--> [full rollout]
```

Dependency safety frame:

- legal-ok: mandatory
- telemetry path: must emit onboarding_success and onboarding_fail
- fallback: always-on silent mode if latency > 300ms
- rollback: kill-switch <2 minutes

Priority lanes:

```
▲ high
  legal/consent review
  backend idempotency
  kill-switch + rollback readiness
▼ low
  copy polishing
  dashboard cosmetics
```

## Why this works

The question has nested uncertainty and cross-team constraints. The tree diagram makes
the decomposition explicit. The flow diagram shows execution order and rework loops.
The frame and priority lanes turn soft governance requirements into checkable launch
conditions.
