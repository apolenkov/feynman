# Algorithm: Token-Bucket Rate Limiter

## Question

> Explain how a token-bucket rate limiter works. Walk through the state
> machine and the per-request decision logic.

## Without feynman

A token bucket holds up to N tokens. Tokens are added at a fixed rate (the
refill rate). When a request arrives, one token is consumed. If the bucket
is empty the request is rejected. Over time the bucket refills up to its
capacity. Bursts are handled because a full bucket allows N requests
immediately; sustained overload is prevented because refill is bounded.

## With feynman

State machine:

```
[bucket: N tokens]
        |
        +-- tick (every 1/rate seconds)
        |          |
        |          v
        |   [add 1 token, cap at N]
        |
        +-- request arrives
               |
               v
        [check bucket]
               |
        empty -+- has token
        |             |
        v             v
  [reject 429]     [tokens--]
                      |
                      v
               [allow request]
```

Per-request decision flow:

```
[request] --> [read bucket state] --> [tokens > 0?]
                                            |
                                   yes -----+------ no
                                   |               |
                                   v               v
                            [tokens--]      [reject 429]
                            [allow]         [retry-after]
```

Key properties:

```
property         | value
-----------------|----------------------------------
burst capacity   | N tokens (full bucket)
sustained rate   | refill rate (tokens/second)
penalty          | token consumed even on error
state storage    | counter + last_refill timestamp
```

## Why this works

An algorithm with internal states and per-step decisions maps to feynman's
flow-diagram rule. The state diagram shows the two concurrent processes
(tick refill and request consume); the flow diagram shows per-request
branching; the table captures the rate-limit contract in comparable columns.
