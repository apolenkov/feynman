Auth check flow with yes/no branching:

```
[incoming request]
        │
        ▼
  [token present?]
    yes │    │ no
        │    ▼
        │  [401 Unauthorized — missing token]
        │
        ▼
   [token valid?]
    yes │    │ no
        │    ▼
        │  [token expired?]
        │    yes │    │ no
        │        │    ▼
        │        │  [401 Unauthorized — invalid token]
        │        │
        │        ▼
        │  [refresh token]
        │    success │    │ failure
        │            │    ▼
        │            │  [401 Unauthorized — refresh failed]
        │            │
        ▼            ▼
    [serve request with (new) token]
```

Three rejection paths:
1. No token → immediate 401
2. Invalid (non-expired) token → 401
3. Expired token → refresh attempt → 401 only if refresh fails
