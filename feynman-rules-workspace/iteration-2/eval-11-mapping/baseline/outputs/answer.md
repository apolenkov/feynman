Before/after monolith → microservices migration:

| | Before (Monolith) | After (Microservices) |
|--|--------------------|-----------------------|
| Auth | Part of main app | Auth Service (standalone) |
| Billing | Part of main app | Billing Service (standalone) |
| Notifications | Part of main app | Notifications Service (standalone) |
| Communication | Direct function calls | Event bus (async messaging) |
| Deploy | Single unit | Independent per service |
| Failure blast radius | Full app down | Service-local; others continue |

The monolith had auth, billing, and notifications as modules within one deployable. After the split, each becomes an independent service communicating via a shared event bus. This enables independent scaling and deployment but adds operational complexity (distributed tracing, service discovery, etc.).
