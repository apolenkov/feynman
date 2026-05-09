# Auth Check Flow

The authentication middleware inspects every incoming request, decides what to do based on the token's state, and routes it to one of three terminal outcomes.

```
[Request] --> [Token present?]
                    |
            yes --- + --- no
            |             |
     [Validate token]   [Reject 401]
            |
     [Decision: state?]
            |
   valid -- + -- expired
   |             |
[Serve]      [Refresh token]
                  |
            [Refresh ok?]
                  |
          yes --- + --- no
          |             |
       [Serve]      [Reject 401]
```

Step-by-step:

1. **Request arrives** — middleware intercepts before the route handler.
2. **Token present?** — missing token short-circuits to `401 Unauthorized`.
3. **Validate token** — signature and expiry are checked.
4. **Valid** — request is forwarded to the handler and served normally.
5. **Expired** — refresh flow runs; on success the request is served, on failure it is rejected with `401`.

DONE

