# Monolith → Microservices Migration

## Before: Monolithic Architecture

A single deployable unit handled all business capabilities. Auth, billing, and notifications shared one codebase, one database, and one runtime process. Inter-module communication happened via direct in-process function calls.

```
┌─────────────────────────────────────────┐
│         Monolith (single process)       │
│                                         │
│   ┌──────┐   ┌─────────┐   ┌────────┐   │
│   │ Auth │──▶│ Billing │──▶│ Notify │   │
│   └──────┘   └─────────┘   └────────┘   │
│        │          │             │       │
│        └──────────┴─────────────┘       │
│                   │                     │
│                   ▼                     │
│         ┌──────────────────┐            │
│         │  Shared Database │            │
│         └──────────────────┘            │
└─────────────────────────────────────────┘
```

**Characteristics:**
- One repo, one deploy pipeline, one runtime.
- Synchronous in-process calls between modules.
- Tightly coupled — billing imports auth models directly.
- Single shared database, shared schema.
- Scaling means scaling everything together.

---

## After: Microservices with Event Bus

Each capability is its own service with its own database. Services communicate asynchronously through a shared event bus (Kafka, NATS, RabbitMQ). Direct synchronous calls are replaced with published events and subscribers.

```
                ┌───────────────┐
                │   API Gateway │
                └───────┬───────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌─────────┐    ┌──────────────┐
   │  Auth   │    │ Billing │    │ Notifications│
   │ Service │    │ Service │    │   Service    │
   └────┬────┘    └────┬────┘    └──────┬───────┘
        │              │                │
        ▼              ▼                ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │ Auth DB │    │ Bill DB │    │ Notif DB│
   └─────────┘    └─────────┘    └─────────┘
        │              │                │
        └──────────────┼────────────────┘
                       │
                       ▼
        ╔══════════════════════════════╗
        ║      Shared Event Bus        ║
        ║   (Kafka / NATS / RabbitMQ)  ║
        ╚══════════════════════════════╝
            ▲           ▲           ▲
            │           │           │
       UserCreated  PaymentOK   SendEmail
       UserLogin    InvoiceDue  SendSMS
```

**Event flow example — user signs up:**

```
[Auth] ──UserRegistered──▶ [Bus] ──┬──▶ [Billing]      (create customer)
                                   └──▶ [Notifications] (send welcome email)
```

**Event flow example — payment succeeds:**

```
[Billing] ──PaymentSucceeded──▶ [Bus] ──▶ [Notifications] (send receipt)
```

---

## Side-by-Side Comparison

| Dimension          | Before (Monolith)              | After (Microservices)               |
| ------------------ | ------------------------------ | ----------------------------------- |
| Deploy unit        | 1 binary                       | 3 services + bus infrastructure     |
| Communication      | In-process function calls      | Async events via bus                |
| Database           | 1 shared schema                | 3 isolated databases (per service)  |
| Coupling           | Tight (compile-time)           | Loose (event contract)              |
| Scaling            | All-or-nothing                 | Per-service                         |
| Failure blast      | One bug crashes everything     | Isolated; bus buffers downstream    |
| Tech stack         | One language/framework         | Polyglot per service                |
| Team ownership     | Shared codebase                | Each service owned by a team        |
| Transactions       | ACID across modules            | Eventual consistency / saga pattern |
| Operational cost   | Low (one thing to run)         | High (bus, observability, mesh)     |
| Latency per call   | Microseconds (in-process)      | Milliseconds (network + serialize)  |

---

## Migration Trade-offs

**Gains:**
- Independent deploys → faster iteration per team.
- Fault isolation → notifications outage no longer takes down login.
- Per-service scaling → billing scales for end-of-month load without scaling auth.
- Polyglot freedom → notifications could be Go, billing Java, auth Node.

**Costs:**
- Distributed-systems complexity (network failures, retries, idempotency).
- Eventual consistency replaces ACID transactions — billing may briefly lack a user record after auth creates one.
- Need observability stack (tracing, centralized logs, metrics).
- Operational overhead — bus, schema registry, service discovery.
- Data duplication — auth's user info may need to be cached in billing.

**Verdict:** worth it when teams, deploy frequency, or scale demand it; premature when the monolith is still small and one team owns everything.
