| Database   | Typical use case                        | Write throughput        | Replication support              |
|------------|-----------------------------------------|-------------------------|----------------------------------|
| PostgreSQL | Web apps, analytics, complex queries    | High (WAL-based)        | Streaming + logical replication  |
| MySQL      | Web apps, read-heavy workloads          | High (InnoDB)           | Master-replica, Group Replication|
| SQLite     | Embedded, mobile, single-user desktop   | Low (file-level lock)   | None (file copy only)            |

PostgreSQL is the most feature-rich: JSONB, window functions, strong ACID compliance. MySQL trades some SQL standard compliance for ecosystem breadth (wide hosting support, MariaDB fork). SQLite is zero-config and serverless — ideal when the database is local to the application.
