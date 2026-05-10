`[cart] ──place──▶ [placed] ──pay──▶ [paid] ──ship──▶ [shipped] ──deliver──▶ [delivered]`
`                     │                 │`
`                   cancel            cancel`
`                     ▼                 ▼`
`                [cancelled]       [cancelled]`

Cancellation is open until `paid`. Once `shipped`, the cancellation path closes — returns and refunds are handled by a separate flow. `delivered` and `cancelled` are terminal states.
