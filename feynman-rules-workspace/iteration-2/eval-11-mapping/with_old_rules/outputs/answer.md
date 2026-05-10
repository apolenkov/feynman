Monolith → microservices migration:

```
BEFORE                          AFTER
──────────────────────          ──────────────────────────────
┌─ Monolith ──────────┐         ┌─ Auth Service ─────┐
│  ┌─────────────┐   │         │  auth logic         │
│  │  Auth       │   │         └───────────┬──────────┘
│  ├─────────────┤   │                     │
│  │  Billing    │   │    ┌─ Event Bus ────┤
│  ├─────────────┤   │    │                │
│  │Notifications│   │    │  ┌─ Billing ───┤
│  └─────────────┘   │    │  │  Service    │
└────────────────────┘    │  └─────────────┘
        │                 │
  direct function calls   │  ┌─ Notifications ─┐
                          └──│  Service        │
                             └─────────────────┘
```

| Dimension          | Before (Monolith)     | After (Microservices)       |
|--------------------|-----------------------|-----------------------------|
| Communication      | Direct function calls | Async via event bus         |
| Deployment         | Single unit           | Independent per service     |
| Failure scope      | Full app down         | Service-local isolation     |
| Scaling            | Scale whole app       | Scale individual services   |
| Dev autonomy       | Single codebase lock  | Per-team service ownership  |

**Trade-offs gained:**
- Independent deployment and scaling per service
- Fault isolation: Notifications failure doesn't bring down Auth

**Trade-offs added:**
- Distributed tracing, service discovery, network latency
- Event bus as a new operational dependency
