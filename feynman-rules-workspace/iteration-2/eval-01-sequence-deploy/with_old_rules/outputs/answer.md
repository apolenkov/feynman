A typical CI/CD deploy pipeline follows this sequence:

```
[commit] --> [build] --> [test] --> [staging] --> [production rollout]
```

**Stage breakdown:**

1. **Code commit** — developer pushes to the main branch (or merges a PR); triggers the pipeline
2. **Build** — CI server compiles, bundles, and packages the artifact (Docker image, JAR, etc.)
3. **Test** — unit tests, integration tests, and static analysis run in parallel where possible
4. **Deploy to staging** — artifact promoted to a staging environment; smoke tests run
5. **Production rollout** — final promotion, typically via blue-green or canary deployment

Each arrow represents a gate: if a stage fails, the pipeline halts and the team is notified before the artifact advances.
