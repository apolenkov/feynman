`[commit] → [build] → [test] → [deploy staging] → [production rollout]`

A developer pushes code; the CI system compiles and packages the artifact. Tests (unit + integration) run as a gate — failure halts the pipeline. On green, the artifact promotes to staging for smoke validation, then rolls out to production, typically via canary or blue-green to limit blast radius.
