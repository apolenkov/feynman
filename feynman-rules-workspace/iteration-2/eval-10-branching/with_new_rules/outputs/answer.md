```
[request] → [token present?]
                  │           │
                 yes           no → [401 missing]
                  │
                  ▼
           [valid?]
              │       │
             yes     expired?
              │           │
              ▼          yes → [refresh] → success? → [serve]
           [serve]                              │
                                               no → [401 refresh failed]
```

Three rejection paths: missing token → immediate 401; invalid token → 401; expired token → attempt refresh, serve on success, 401 on failure.
