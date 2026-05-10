Release status snapshot:

+--- Service Status ---+
| API service     ✓ healthy   |
| Web app         ⚠ degraded  |
| Mobile app      ✓ healthy   |
| Payment service ✗ DOWN      |
| Search          ✓ healthy   |
| Analytics       ✓ healthy   |
| CDN             ✓ healthy   |
+---------------------+

**Priority actions:**

▲ high
  Payment service — down; blocking transactions; page on-call immediately
⚠ medium
  Web app — degraded; likely downstream from payment; monitor closely
▼ low
  All other services healthy

**Retro status:**
- DONE: API, Mobile, Search, Analytics, CDN deployed and healthy
- FRAGILE: Web app degraded (payment dependency)
- BLOCKED: Payment service outage — active incident

**Release decision:**
- CONTEXT: 5/7 services healthy; payment down blocks revenue
- OPTIONS: roll back payment release vs hold current state + incident response
- CHOICE: incident response path; do not roll back other services
- CONSEQUENCE: revenue impact until payment restored
