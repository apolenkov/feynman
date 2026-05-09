## PostgreSQL vs MySQL vs SQLite

Comparison across three options and three criteria — side-by-side ASCII columns, max ten words per cell.

```
PostgreSQL              | MySQL                   | SQLite
------------------------|-------------------------|--------------------------
complex OLTP, analytics | web apps, LAMP stack    | embedded, mobile, local files
high write throughput   | high write throughput   | low to moderate, single writer
streaming, logical, BDR | async, semi-sync, group | none built-in, file copy only
```

### Notes per criterion

- Typical use case: PostgreSQL fits transactional plus analytical workloads with rich types and extensions. MySQL fits high-traffic web backends and read-heavy services. SQLite fits in-process storage for apps, devices, tests, and config.
- Write throughput: PostgreSQL and MySQL both scale writes on a single primary with proper tuning and hardware; MySQL InnoDB often edges out on simple key-value writes, PostgreSQL holds up better under mixed and complex transactions. SQLite serializes writers via a file lock, so concurrent write throughput is limited even with WAL mode.
- Replication support: PostgreSQL ships streaming physical replication, logical replication, and supports tools like Patroni and BDR. MySQL ships asynchronous, semi-synchronous, and Group Replication, with InnoDB Cluster and Galera as common stacks. SQLite has no native replication; durability and distribution rely on file-level copies, Litestream, or rqlite-style wrappers.
