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

### C4 context (who uses what)

```
Person(Author)    --> WebApp: writes docs
Person(Reviewer)  --> WebApp: reviews output
Person(Operator)  --> WebApp: monitors system
WebApp            --> PromptGateway: HTTPS
PromptGateway     --> SSO: auth
PromptGateway     --> ModelProvider: inference
PromptGateway     --> Observability: metrics
```

### C4 containers (runtime boundaries)

```
Person(Author) --> Container(WebApp): HTTPS
Container(WebApp) --> Container(PromptGateway): REST
Container(PromptGateway) --> Container(RuleService): gRPC
Container(PromptGateway) --> Container(QualityService): gRPC
Container(RuleService) --> ExternalSystem(TemplateStorage): S3
Container(QualityService) --> ExternalSystem(Observability): metrics
```

### C4 request flow (happy path + fallback)

```
[Author request]
      |
      v
[PromptGateway: auth + rate-limit]
      |
  unauthorized --> [401 / 403]
      |
  authorized
      |
      v
[RuleService: load rule set]
      |
  miss --> [text fallback mode]
      |
  hit
      |
      v
[DiagramRenderer]
      |
      v
[QualityService: validate]
      |
  blocked --> [RecoveryPlan]
      |
  pass
      |
      v
[JSON response to Author]
```

### Architecture decision lens

```
criterion      | C1 Context       | C2 Containers     | C3 Components
---------------|------------------|-------------------|-------------------
Main question  | who talks to what| who owns boundary | who owns behavior
Primary risk   | missing actor    | wrong trust zone  | rule fallback bug
Owner          | Product + Ops    | Backend + Security| Rule authors
```

### Delivery readiness

```
context map    ......... done
container flow ......... done
component split ........ done
risk hotspots  ......... identified
```

## Why this works

Without explicit structure, the explanation is a dense paragraph. With the C4
perspective, feynman converts it into actor/system decomposition, runtime
sequence, boundary and fallback behavior, and explicit risk visibility.
`Type(name) --> Type(name): label` is the minimal C4 arrow notation — readable
cold without a legend.
