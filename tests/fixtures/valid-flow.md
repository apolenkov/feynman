# Valid Flow Diagram

This is a simple flow diagram that passes all lint rules.

```
[Start] --> [Process] --> [End]
```

A branching flow:

```
[Request] --> [Auth?]
                 |
          yes -- + -- no
          |             |
      [Handle]      [Reject]
          |             |
          +--- [Done] --+
```
