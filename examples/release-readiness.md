# Release Readiness: Monthly Deployment to Production

## Question

> We have a monthly release with API, web, and mobile changes. What gates and
> rollback triggers do we need before and after deploy?

## Without feynman

Coordinate release notes, run migration checks, execute smoke tests on staging, and
run targeted regression tests. If deployment passes, monitor key metrics for one hour
and then announce success. Rollback should be triggered on increased errors or
critical latency regressions.

## With feynman

```
[Pre-release plan] --> [Staging deploy]
                      |
                      v
              [Smoke + regression]
                      |
             pass ----+---- fail
              |              |
              v              v
        [Production]    [Stop + fix]
              |
              v
        [Observe 60 min]
              |
      pass ----+---- fail
       |              |
       v              v
[Done + announce] 
[Rollback + incident]
```

Readiness gates:

```
criterion            | gate type | owner          | must be true
--------------------|-----------|----------------|----------------------
migration safety     | schema    | platform       | dry-run + backward-compatible
auth/checkout smoke  | functional| product qa      | 100% critical paths
error budget         | reliability| sre            | error rate <= baseline + 0.2%
security regression  | security  | infosec        | zero new critical findings
```

Readiness status:

- staging-deploy: done
- smoke-tests: in progress
- security-gate: pending
- rollback-drill: ready
- comms-draft: in progress

Priority ladder:

```
▲ high
  no data loss
  idempotent migrations
  auth + checkout paths
▼ low
  branding tweaks
  help-center wording
```

## Why this works

The flow diagram shows what blocks progression to production and where rollback
branches back. The gate table gives objective pass criteria. The status frame and
priority scale separate urgent reliability conditions from polish work.
