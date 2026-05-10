E-commerce order state machine:

```
[cart] ──place──▶ [placed] ──payment confirmed──▶ [paid] ──fulfillment picks──▶ [shipped] ──carrier confirms──▶ [delivered]
                     │                               │
                   cancel                          cancel (refund initiated)
                     ▼                               ▼
                [cancelled]                     [cancelled]
```

**State transitions:**
- `cart` → `placed`: user completes checkout submission
- `placed` → `paid`: payment gateway confirms charge
- `placed` → `cancelled`: user cancels before payment
- `paid` → `shipped`: fulfillment team picks and ships
- `paid` → `cancelled`: user cancels post-payment (triggers refund)
- `shipped` → `delivered`: carrier confirms delivery

**Terminal states:** `delivered`, `cancelled` — no further transitions possible.

**Note:** Once `shipped`, cancellation is not available. Returns and refunds post-delivery are a separate state machine (e.g., `return_requested` → `return_received` → `refunded`).
