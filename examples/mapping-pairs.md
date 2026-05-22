# Mapping Pairs: Error Code to Action

## Question

> What should a client do when it gets each HTTP error code from our API?
> Give me a clear mapping I can hand to the frontend team.

## Without feynman

A 400 means the request payload is malformed and the client should fix and
retry. A 401 means the token is missing or expired and the client should
redirect to login. A 403 means the user lacks permission and should see an
access-denied screen. A 429 means rate limit was hit and the client should
back off and retry after the Retry-After header value. A 503 means the
service is down and the client should show a maintenance banner and poll.

## With feynman

```
400 Bad Request      --> fix payload and retry
401 Unauthorized     --> redirect to /login
403 Forbidden        --> show access-denied screen
429 Too Many Req     --> wait Retry-After, then retry
503 Service Unavail  --> show banner, poll /health
```

Each code maps to exactly one client action. Arrow separates source from
target so the mapping direction is unambiguous.

## Why this works

An error-to-action lookup is a mapping grid — feynman's mapping-pairs rule
activates. Arrow (`-->`) shows direction: status code on the left, client
action on the right. No table headers, no frame overhead — just five clean
pairs the frontend team can paste into a runbook.
