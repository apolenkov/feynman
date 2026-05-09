# PostgreSQL vs MySQL vs SQLite

## Comparison

| Criterion | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| **Typical use case** | Complex OLTP and analytical workloads, geospatial (PostGIS), JSON-heavy apps, multi-tenant SaaS, data warehousing, anything needing strong correctness guarantees and rich SQL features. | General-purpose web apps (LAMP/LEMP stack), CMSes (WordPress, Drupal), e-commerce, read-heavy workloads where simplicity and broad hosting support matter. | Embedded storage: mobile apps (iOS/Android), desktop apps, browsers, IoT devices, local caches, test fixtures, single-file data exchange, small-to-medium websites with low write concurrency. |
| **Write throughput** | High and predictable under concurrent load thanks to MVCC and per-row locking; scales well vertically. Write amplification from WAL and autovacuum means tuning matters at scale. Strong for mixed read/write workloads. | High for simple inserts/updates, especially with InnoDB and well-tuned buffer pool. Generally a bit faster than Postgres for trivial single-row writes but can degrade under heavy concurrent contention or complex transactions. | Very high for single-writer scenarios (file-local, no network round-trip), but the database is locked during a write — only one writer at a time. WAL mode allows concurrent readers but still serializes writers. Not suitable for high-concurrency write workloads. |
| **Replication support** | Built-in streaming replication (physical), logical replication (per-table, cross-version), synchronous and asynchronous modes, cascading replicas, hot standbys. Mature ecosystem (Patroni, repmgr) for HA and failover. | Built-in asynchronous and semi-synchronous replication, GTID-based, statement/row/mixed binlog formats. Group Replication and InnoDB Cluster provide multi-primary and automatic failover. Widely deployed and well-understood. | No built-in replication. Common workarounds: file-level copy, Litestream (stream WAL to object storage), rqlite/dqlite (Raft-based distributed forks), or application-level sync. Replication is explicitly outside SQLite's design goals. |

## Quick guidance

- Choose **PostgreSQL** when correctness, advanced SQL, and write concurrency matter.
- Choose **MySQL** when you need a battle-tested general-purpose RDBMS with broad tooling and hosting.
- Choose **SQLite** when the database is embedded in a single process and concurrent writers are not required.
