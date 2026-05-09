## Release Status Snapshot

Seven services tracked. One down (payment), one degraded (web), five healthy.

```
+---- Release Status ----------+
| api        | healthy         |
| web        | degraded        |
| mobile     | healthy         |
| payment    | DOWN            |
| search     | healthy         |
| analytics  | healthy         |
| cdn        | healthy         |
+------------------------------+
```

### Severity ordering

```
▲ high
  payment   -- DOWN, blocks checkout
  web       -- degraded, partial UX impact
▼ low
  api, mobile, search, analytics, cdn -- healthy
```

### Release shape

```
CHANGED:
- 7 services in scope this release

VERIFIED:
- api, mobile, search, analytics, cdn -- healthy

RISK:
- payment DOWN -> revenue path broken
- web degraded -> user-facing latency or errors

ROLLBACK:
- candidate if payment cannot be restored shortly
```

Next action: triage payment first, then investigate web degradation.
