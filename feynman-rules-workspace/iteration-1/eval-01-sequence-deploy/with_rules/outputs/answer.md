A typical CI/CD pipeline turns a code commit into a production release through a fixed sequence of automated stages. The commit triggers the CI server, which builds an artifact (compiled binary, container image, or bundle) from a clean checkout. Automated tests — unit, integration, and often security/lint checks — then run against that artifact, and a failure halts the pipeline. If tests pass, the artifact is deployed to a staging environment that mirrors production for smoke tests and any final manual or automated verification. Finally, the same artifact is rolled out to production, usually via a controlled strategy (blue/green, canary, or rolling) with health checks and automatic rollback on failure.

```
[commit] --> [build] --> [test] --> [deploy staging] --> [production rollout]
                            |                                    |
                          fail                                 fail
                            |                                    |
                       [halt + alert]                       [rollback]
```
