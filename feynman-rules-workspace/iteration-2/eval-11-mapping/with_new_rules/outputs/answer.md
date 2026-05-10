| | Before (Monolith) | After (Microservices) |
|--|--------------------|-----------------------|
| Auth | Embedded module | Auth Service (standalone) |
| Billing | Embedded module | Billing Service (standalone) |
| Notifications | Embedded module | Notifications Service (standalone) |
| Communication | Direct function calls | Event bus (async) |
| Deploy | Single unit | Independent per service |
| Failure scope | Full app down | Service-local isolation |

Auth, billing, and notifications split into three independent services communicating through a shared event bus. This enables per-service scaling and independent deployment but adds operational complexity — distributed tracing, network latency, event bus as a dependency.
