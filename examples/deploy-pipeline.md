# Deploy Pipeline: Monorepo CI/CD

## Question

> Draw the CI/CD pipeline for our monorepo. We run lint, test, and build in
> parallel, then deploy to staging, run smoke tests, and promote to production.

## Without feynman

The pipeline starts with lint, unit tests, and the build running in parallel.
Once all three pass the deploy job sends the artifact to staging. After that
the smoke test suite runs against staging. If smoke tests pass, a manual
approval gate is required before the production deployment goes out. If smoke
tests fail, the pipeline stops and alerts on-call.

## With feynman

```
[push / PR] --> [trigger CI]
                      |
          .-----------+-----------.
          |           |           |
          v           v           v
       [Lint]      [Test]      [Build]
          |           |           |
          '-----------+-----------'
                      |  all pass
                      v
              [Deploy --> Staging]
                      |
                      v
              [Smoke Tests]
                      |
              pass ---+--- fail
              |               |
              v               v
       [Manual Approval]     [Stop + Alert]
              |
              v
       [Deploy --> Production]
              |
              v
       [Rollout health check]
              |
          ok -+- degraded
              |         |
              v         v
          [Done]     [Auto-rollback]
```

Three parallel jobs gate everything downstream. Production only reachable
after staging smoke tests and human approval.

## Why this works

A pipeline with parallel stages and conditional branches is feynman's
canonical flow-with-branch pattern. The parallel fork and join shows
concurrent jobs; sequential arrows show the rest of the path.
