# API Flow: POST /api/login Request Lifecycle

## Question

> Walk me through exactly what happens when a client sends POST /api/login.
> Include middleware, validation, and the response path.

## Without feynman

When a login request arrives the framework runs the CORS middleware first,
then body-parser parses the JSON payload. The validation layer checks that
email and password fields are present and well-formed. The controller calls
the auth service, which queries the database. If credentials match, a session
token is issued and returned. If anything fails along the way an appropriate
error response is sent.

## With feynman

```
[Client] --> [CORS middleware] --> [body-parser] --> [Validation]
                                                          |
                                                   pass --+-- fail
                                                   |           |
                                                   v           v
                                            [Controller]     [400 Bad Request]
                                                   |
                                                   v
                                            [AuthService]
                                                   |
                                                   v
                                            [UserRepository]
                                                   |
                                         found ----+---- not found
                                         |                   |
                                         v                   v
                                  bcrypt.compare       [401 Unauthorized]
                                         |
                                 match --+-- mismatch
                                 |               |
                                 v               v
                          [issue JWT]     [401 Unauthorized]
                                 |
                                 v
                          [200 OK + token]
```

Seven stages, two branch points. Every failure path exits early — success
continues to the next stage.

## Why this works

The request lifecycle is a sequential flow with conditional branches, which
activates feynman's flow diagram rules. Boxes (`[…]`) mark processing stages;
arrows (`-->`) mark data flow; branch splits show the conditional paths at
validation and credential-check points.
