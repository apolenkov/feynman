# Idempotent in HTTP Context

In HTTP, a method is **idempotent** if making the same request multiple times produces the same effect on the server as making it once. The client can safely retry the request without worrying about unintended side effects from duplicate execution.

Note that idempotent does not mean the response is identical every time — only that the *server state* ends up the same. For example, a `DELETE` on a resource returns `204 No Content` the first time and `404 Not Found` on subsequent calls, but the resource remains deleted either way.

## Idempotent vs Non-Idempotent Methods

Per RFC 9110 (HTTP Semantics):

| Method    | Idempotent? | Safe? | Notes                                              |
|-----------|-------------|-------|----------------------------------------------------|
| `GET`     | Yes         | Yes   | Read-only; no state change                         |
| `HEAD`    | Yes         | Yes   | Like GET, no body                                  |
| `OPTIONS` | Yes         | Yes   | Metadata query                                     |
| `PUT`     | Yes         | No    | Replace resource — same payload = same final state |
| `DELETE`  | Yes         | No    | Resource ends up gone regardless of retry count    |
| `POST`    | **No**      | No    | Typically creates a new resource each call         |
| `PATCH`   | **No***     | No    | Depends on patch semantics (e.g., `{counter: +1}`) |

\* `PATCH` *can* be idempotent if the patch document describes an absolute state, but it is not guaranteed by the spec.

## Why It Matters

Idempotency is the foundation for **safe retries** in distributed systems:

- **Network failures** — if a client doesn't receive a response, it can retry an idempotent request without risk of double-processing.
- **Load balancers and proxies** — intermediaries may replay requests on timeout; idempotent methods tolerate this.
- **Caching and prefetching** — `GET` and `HEAD` can be aggressively cached because they have no side effects.

For non-idempotent operations like `POST` (e.g., "charge credit card"), applications typically implement their own idempotency layer using an **`Idempotency-Key`** header (popularized by Stripe and now standardized in [draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)). The server stores the key and returns the cached result for any retry with the same key.

## Quick Mental Model

```
Idempotent?  →  "Can I press this button N times and get the same world?"
   yes  →  GET, PUT, DELETE  →  retry freely
   no   →  POST              →  retry only with an idempotency key
```
