Comparison of PostgreSQL, MySQL, and SQLite:

```
Criterion          | PostgreSQL              | MySQL                   | SQLite
-------------------|-------------------------|-------------------------|------------------
Typical use case   | Web apps, analytics     | Web apps, read-heavy    | Embedded, mobile
Write throughput   | High (WAL-based)        | High (InnoDB)           | Low (file lock)
Replication        | Streaming + logical     | Master-replica, Group   | None (file copy)
```

**Key differentiators:**
- PostgreSQL: most SQL-standard compliant; JSONB, window functions, strong ACID; preferred for complex queries
- MySQL: broad hosting support, large ecosystem, MariaDB fork; slightly less standard-compliant
- SQLite: zero-config, serverless, single-file; no network protocol; ideal when DB is local to app
