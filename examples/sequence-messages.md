# Sequence Messages: Login Flow

## Question

> Show me the message sequence for a user login. Who calls whom, in what
> order, and what comes back?

## Without feynman

The client sends credentials to the API. The API looks up the user in the
database and, if found, compares the password hash. On success the database
returns the user record, the API issues a token, and the client gets a 200
response with the token. On failure the API returns 401.

## With feynman

```
Client ->> API : POST /login (email, password)
API    ->> DB  : SELECT user WHERE email=?
DB   -->> API  : user row
API    ->> API : bcrypt.compare(password, hash)
API  -->> Client : 200 OK + token
```

Sync call (`->>`): caller waits for result. Return (`-->>`): response back.
Three participants, two round trips, one decision at the API layer.

## Why this works

A login flow is a message sequence across named participants — feynman's
sequence-diagram notation activates. Each line is one message: `sender ->> receiver : label`
for calls and `sender -->> receiver : label` for returns. No vertical lane
bars needed — the participant columns are implicit in the label positions.
Arrow style is consistent throughout (`->>` / `-->>`), so L03 stays clean.
