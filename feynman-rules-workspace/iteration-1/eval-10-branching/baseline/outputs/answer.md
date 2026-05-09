# Auth Check Flow

When a request comes in, the server performs an authentication check before serving the resource. The flow branches based on the state of the token presented in the request.

## Steps

1. **Request arrives** — the server receives an incoming HTTP request and looks for an authentication token (typically in the `Authorization` header or a cookie).

2. **Check for token presence**:
   - If the token is **missing**, the server immediately rejects the request with a `401 Unauthorized` response. No further processing happens.
   - If a token is **present**, the flow proceeds to validation.

3. **Validate the token**:
   - The server verifies the token's signature, issuer, and expiration claim.
   - If the token is **valid** (signature good, not expired), the server serves the requested resource normally.
   - If the token is **expired** but otherwise well-formed, the server attempts a refresh.

4. **Refresh attempt** (expired token branch):
   - The server looks up an associated refresh token (from a secure cookie or token store).
   - If the refresh token is valid, a new access token is issued and the original request is served (often with the new token returned in the response headers or cookies).
   - If the refresh token is also invalid or missing, the server falls back to rejecting with `401 Unauthorized`, prompting the client to re-authenticate.

## Outcomes

- **Valid token** → serve the resource (200 OK or whatever the handler returns).
- **Expired token + valid refresh** → refresh, then serve.
- **Expired token + no/invalid refresh** → reject with 401.
- **Missing token** → reject with 401.

This pattern keeps short-lived access tokens secure while avoiding constant re-logins for active users, since the refresh path transparently extends the session as long as the refresh token is still trusted.
