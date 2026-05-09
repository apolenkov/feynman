# E-Commerce Order State Machine

An e-commerce order moves through a series of well-defined states from the moment a customer adds items to their cart until the goods arrive at their door. Each transition is triggered by either a user action (checkout, cancel), a system event (payment confirmation), or an external signal (carrier delivery confirmation). Cancellation is a cross-cutting concern: it can occur from several states, but the rules differ depending on how far the order has progressed.

## States

- **Cart** — items selected but not yet committed; mutable, no obligation on either side.
- **Placed** — customer has submitted the order; inventory is reserved, awaiting payment.
- **Paid** — payment authorized and captured; order is now financially binding.
- **Shipped** — warehouse has handed the package to the carrier; tracking number issued.
- **Delivered** — carrier confirms the package reached the customer; terminal happy-path state.
- **Cancelled** — terminal state reached from cart, placed, or paid (with refund).

## Transitions

| From      | Event                  | To         | Side effects                                |
|-----------|------------------------|------------|---------------------------------------------|
| Cart      | `checkout`             | Placed     | Reserve inventory, create order record      |
| Cart      | `abandon` / `clear`    | Cancelled  | Release any soft holds                      |
| Placed    | `payment_confirmed`    | Paid       | Capture funds, send confirmation email      |
| Placed    | `payment_failed`       | Cancelled  | Release inventory                           |
| Placed    | `cancel`               | Cancelled  | Release inventory, no refund needed         |
| Paid      | `ship`                 | Shipped    | Generate label, notify carrier, email user  |
| Paid      | `cancel`               | Cancelled  | Issue full refund, release inventory        |
| Shipped   | `delivery_confirmed`   | Delivered  | Close order, trigger review request         |
| Shipped   | `cancel` (return)      | Cancelled  | Initiate return flow + refund on receipt    |

## Diagram

```
            ┌──────┐  checkout    ┌────────┐  payment_confirmed   ┌──────┐
            │ Cart │ ───────────▶ │ Placed │ ──────────────────▶  │ Paid │
            └──────┘              └────────┘                      └──────┘
                │                     │                              │
                │ abandon             │ payment_failed               │ ship
                │                     │ / cancel                     ▼
                │                     │                          ┌─────────┐
                │                     │                          │ Shipped │
                │                     │                          └─────────┘
                │                     │                              │
                │                     │                              │ delivery_confirmed
                │                     │                              ▼
                │                     │                         ┌───────────┐
                │                     │                         │ Delivered │  (terminal)
                │                     │                         └───────────┘
                │                     │
                ▼                     ▼
            ┌────────────────────────────────┐
            │           Cancelled            │  (terminal; refund if Paid/Shipped)
            └────────────────────────────────┘
```

## Notes on Cancellation

Cancellation behaves as a "convergent" transition — many source states funnel into the single `Cancelled` terminal, but the *cost* of cancelling rises as the order matures:

1. **From Cart** — free, no side effects beyond releasing soft holds.
2. **From Placed** — release inventory; if a payment auth exists, void it.
3. **From Paid** — issue a full refund through the payment processor.
4. **From Shipped** — typically modeled as a *return* rather than a pure cancel: the package must come back before the refund clears. Some systems introduce an intermediate `Return-Requested` / `Returned` state for this.
5. **From Delivered** — usually outside the order state machine; handled by a separate `Return / RMA` workflow with its own states.

`Delivered` and `Cancelled` are both **terminal**: no outgoing transitions exist within this machine. Any post-delivery activity (refunds, returns, disputes) belongs to a sibling state machine that takes the order ID as input.
