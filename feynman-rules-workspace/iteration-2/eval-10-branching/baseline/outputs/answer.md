Auth check flow:

```
[request arrives]
        │
        ▼
[token present?]
    │         │
   no         yes
    │         │
    ▼         ▼
[401 reject] [valid?]
              │     │
             yes    no (expired?)
              │         │
              ▼         yes
          [serve]        │
                         ▼
                    [refresh token]
                         │
                    success? ──no──▶ [401 reject]
                         │
                        yes
                         ▼
                    [serve with new token]
```

The flow branches at each validation check. Missing token → immediate rejection. Valid token → serve. Expired token → attempt refresh; if refresh succeeds, serve with new token; if refresh fails, reject.
