# C4-Style Architecture and Request Flow

## Question

> Sketch a clean C4-style view for an AI documentation tool and show the
> normal request flow. I want context, container split, component split, and a
> clear status view for blockers.

## Without feynman

The tool has three users: author, reviewer, and operator. It includes a web
client, a prompt gateway API, a rules engine, a diagram renderer, and a
quality service that validates responses before returning them. There is
SSO-based auth, storage for templates, and a shared observability channel.
If the rules fail to load, the request still needs a deterministic fallback to
text mode so the user is not blocked.

## With feynman

### C4 context

```
feynman-system
├── actors
│   ├── [Document Author]
│   ├── [Reviewer]
│   └── [Operator]
├── containers
│   ├── [Web Client]
│   ├── [Prompt Gateway API]
│   ├── [Rule Service]
│   ├── [Diagram Renderer]
│   └── [Quality Service]
└── external systems
    ├── [SSO]
    ├── [Template Storage]
    ├── [Model Provider]
    └── [Observability]
```

### C4 container run

```
[Document Author] --> [Web Client]
                      |
                      v
[Reviewer]       --> [Prompt Gateway API]
                      |
                      v
                      [Auth + Rate Limit]
                              |
                              +-- unauthorized --> [403 / 401]
                              |
                              +-- authorized
                                    |
                                    v
                               [Rule Service]
                                    |
                                    +-- rule set miss --> [Text fallback]
                                    |
                                    +-- rule set hit
                                          |
                                          v
                                     [Diagram Renderer]
                                          |
                                          v
                                       [Quality Service]
                                          |
                                          +-- blocked --> [Recovery Plan]
                                          |
                                          +-- pass --> [JSON response]
                                          |
                                          v
                                  [Observability publish]
                                          |
                                          v
                                   [Document Author/Reviewer]
```

### Architecture split

```
criterion      | Context (C1)        | Containers (C2)      | Components (C3)
---------------|---------------------|----------------------|----------------------
Main question  | Who talks to what   | Who owns boundary    | Who owns behavior
Primary risk   | Missing actor path   | Wrong trust boundary  | Rule fallback bug
Owner now      | Product + Ops       | Backend + Security    | Runtime rule authors
```

### Why this helps

```
┌─ Delivery readiness ────────────┐
  context map     done
  container flow   done
  component split done
  risk hotspots   identified
└─────────────────────────────────┘
```

## Why this works

Without explicit structure, the explanation is a dense paragraph. With the C4
perspective, Feynman converts it into:
- actor/system decomposition,
- runtime sequence,
- boundary+fallback behavior,
- and explicit risk visibility.

The result is understandable quickly and can be reviewed or extended as a
single architecture baseline.

