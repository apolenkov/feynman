# Architecture Review: Auth Service Topology

## Question

> How does our auth service connect to the user database and rate limiter?
> Walk me through the request path.

## Without feynman

The auth service receives incoming requests and first checks the rate limiter
to see if the caller has exceeded their quota. If not, it queries the user
database to validate credentials. On success it issues a JWT and logs the
event. If the rate limiter trips, the request is rejected before the database
is ever touched.

## With feynman

```
[POST /auth/token]
        |
        v
[Rate Limiter: Redis, 100 req/60s per IP]
        |
  over limit --> 429 Too Many Requests
        |
  within limit
        |
        v
[Auth Service: validate credentials]
        |
        v
[UserDB: SELECT hash WHERE email = ?]
        |
        v
[bcrypt.compare(password, hash)]
        |
  match --> issue JWT (RS256, 15 min TTL) --> 200 OK
        |
  no match --> 401 Unauthorized
```

Three components, one path. Rate limiter sits in front — database never sees
throttled traffic.

## Why this works

The response describes a hierarchy of sequential components with decision
branches, activating feynman's flow-integrity and frame-block rules. The flow
diagram shows each processing stage as a box with arrows marking the request
path and branch outcomes.
