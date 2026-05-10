A typical CI/CD deploy pipeline flows through these stages:

[code commit] → [build] → [test] → [deploy staging] → [production rollout]

After a developer pushes code, the build system compiles and packages the artifact. The test stage runs unit, integration, and possibly end-to-end checks. If tests pass, the artifact deploys to a staging environment for final validation. Once staging is confirmed healthy, the production rollout begins — often via blue-green or canary strategy to limit blast radius.
