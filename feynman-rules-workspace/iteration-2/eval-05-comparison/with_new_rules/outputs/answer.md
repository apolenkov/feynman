| Database   | Typical use case                     | Write throughput      | Replication support               |
|------------|--------------------------------------|-----------------------|-----------------------------------|
| PostgreSQL | Web apps, analytics, complex queries | High (WAL-based)      | Streaming + logical replication   |
| MySQL      | Web apps, read-heavy workloads       | High (InnoDB)         | Master-replica, Group Replication |
| SQLite     | Embedded, mobile, single-user        | Low (file-level lock) | None (file copy only)             |

PostgreSQL is the most SQL-standard compliant and feature-rich (JSONB, window functions, strong ACID). MySQL trades some standard compliance for ecosystem breadth. SQLite is zero-config and serverless — best when the database is local to the application.
