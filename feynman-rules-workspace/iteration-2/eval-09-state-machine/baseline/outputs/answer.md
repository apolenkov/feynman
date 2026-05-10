E-commerce order state machine:

```
[cart] ──place──▶ [placed] ──pay──▶ [paid] ──ship──▶ [shipped] ──deliver──▶ [delivered]
                     │                 │
                   cancel            cancel
                     │                 │
                     ▼                 ▼
                 [cancelled]       [cancelled]
```

| State     | Entry condition      | Allowed transitions              |
|-----------|----------------------|----------------------------------|
| cart      | user adds item       | → placed, abandoned              |
| placed    | checkout submitted   | → paid, cancelled                |
| paid      | payment confirmed    | → shipped, cancelled (refund)    |
| shipped   | fulfillment picks    | → delivered                      |
| delivered | carrier confirms     | terminal state                   |
| cancelled | user/system cancels  | terminal state                   |

Cancellation is allowed up to the `paid` state. Once an order is `shipped`, the cancellation path closes and only a return/refund flow applies (typically a separate state machine).
