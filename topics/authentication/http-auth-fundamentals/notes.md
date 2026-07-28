# HTTP & Token Auth Fundamentals — Notes

Messy working notes. Clean version goes in README.md once I've built the example.

## 1. Basic Auth

**What happens:**
- Client sends `Authorization: Basic base64(username:password)` header.
- This is sent on **every single request** — there is no session, no state kept anywhere.
- Server decodes the header, checks credentials against DB on every request.
- If valid → request proceeds. If invalid → 401, back to signin.

**Key correction to my original understanding:** it's NOT a cookie. No cookie is ever set. The raw credentials (base64-encoded, not encrypted) go out on the wire with every single call.

**Why it's dead in production:**
- Base64 is *encoding*, not encryption — trivially reversible (`atob()` in any browser console).
- Only survives if wrapped entirely in TLS, and even then, sending raw credentials repeatedly is bad practice.
- No concept of expiration, revocation, or scoping.

**When it's still fine:** internal tooling, quick scripts, service-to-service calls over trusted networks where nothing better is set up yet.

---

## 2. Digest Auth

**What happens (challenge-response, not just "hash the cookie"):**
1. Client requests a protected resource.
2. Server responds `401` with a `WWW-Authenticate: Digest` header containing a **nonce** (random one-time value).
3. Client computes `hash(username:realm:password:nonce:...)` — traditionally MD5 — and sends *that hash*, never the raw password.
4. Server does the same computation on its end (since it also knows the password) and compares.

**Why it existed:** avoids sending the plaintext password over the wire even without TLS — an improvement over Basic auth in a pre-HTTPS-everywhere world.

**Why nobody uses it now:**
- MD5 is cryptographically weak.
- TLS is ubiquitous now, which solves the "credentials on the wire" problem more thoroughly anyway.
- Considered legacy / rarely seen in modern APIs.

---

## 3. API Key Auth

**What happens:**
- Server generates a unique key per user/app at signup or app-registration time.
- Client sends it on every request, typically `Authorization: Api-Key <key>` (or a custom header like `X-API-Key`).
- Server does a DB lookup on every request to match the key to an account.

**Correction to my original notes:** the "statefulness" downside I attributed to API keys is really more a session-auth problem. API keys are a stateless-per-request lookup (no session object being tracked) — it's just that every request costs a DB hit. Also: API keys usually identify an **application or service**, not a specific logged-in user session.

**Downsides:**
- No built-in expiration by default (some systems add one manually).
- If leaked, whoever has it has full access until manually revoked — no natural rotation.
- No information encoded in the key itself (unlike JWTs) — it's just an opaque lookup token.

**When to use:** server-to-server, third-party developer API access, machine clients — not for representing an individual user's browser session.

---

## 4. Session-Based (Stateful) Auth

**What happens:**
1. User logs in with credentials.
2. Server creates a session record (in memory, Redis, or DB) with a unique session ID.
3. Server sends that session ID back as a cookie.
4. On every subsequent request, the cookie is sent automatically by the browser; server looks up the session ID to know who's making the request.
5. Sessions can have an expiration date server-side.

**Downside:** stateful — the server has to check a shared store (or in-memory map) on every single request to know who's asking. This doesn't horizontally scale cleanly: every server instance needs access to the same session store (hence Redis/shared DB), otherwise a user hitting a different server instance "loses" their session.

**Good for:** traditional server-rendered web apps, low-to-moderate scale, cases where instant revocation matters (just delete the session record).

---

## 5. JWT (Bearer Token) Auth

**What happens:**
- Server issues a **JWT (JSON Web Token)** after login — a signed, self-contained object containing claims (user id, roles, expiry, etc.) as JSON, base64url-encoded, with a cryptographic signature.
- Client sends it as `Authorization: Bearer <jwt>` on every request.
- "Bearer" is a convention meaning: **whoever holds this token owns the access it grants** — no further proof of identity needed beyond having the token.
- Server verifies the signature (using its secret or public key) on each request — no DB lookup required, since all the needed info is embedded in the token itself.

**Properties:**
- Stateless — nothing to look up server-side.
- Short-lived by convention: **15 minutes to 1 hour**.
- Scales well — any server instance with the verification key can validate it independently, no shared session store needed.

**Structure:** `header.payload.signature` — header + payload are just base64url JSON (readable, NOT encrypted — never put secrets in a JWT payload), signature is what makes it tamper-proof.

---

## 6. Access Token + Refresh Token (Modern Pattern)

Modern systems don't use a single long-lived token — they split responsibilities:

**Access token:**
- The JWT bearer token described above.
- Short-lived (15 min–1 hr).
- Sent on every API request.

**Refresh token:**
- Longer-lived (days to weeks, e.g. 7–30 days).
- Stored in the client (commonly as an httpOnly cookie, so JS can't read it — mitigates XSS token theft).
- When the access token expires, the client silently sends the refresh token to a dedicated endpoint (no user interaction needed).
- Server looks the refresh token up in its DB (refresh tokens ARE tracked server-side, unlike access tokens — this is what makes them revocable).
- If valid → server issues a **new** access token (and often a new refresh token too).

**Refresh token rotation (production detail I missed initially):**
- Every time a refresh token is used, the old one is invalidated and a new one issued.
- If a stolen refresh token gets replayed after the legitimate client already rotated it, the server can detect the reuse of a dead token and revoke the whole token family — limits the damage window from a stolen refresh token to a single use.

**Why this split exists:** short-lived access tokens limit the blast radius if one leaks (attacker only has 15–60 min of access), while refresh tokens give a good UX (no re-login every 15 minutes) without keeping a long-lived bearer token floating around in every request header.

---

## Tradeoffs Summary

| Method | Storage Requirement | Scalability | Revocation |
|---|---|---|---|
| Session-based | Server-side (Redis/DB) | Lower — needs shared state | Instant (delete session) |
| API Keys | DB lookup per request | Moderate | Manual, immediate |
| JWT | None (stateless) | High — validated locally via signature | Hard — must wait for expiry or maintain a blocklist |

## Common mistakes
- Assuming JWT payload is encrypted — it's not, it's just base64. Never put secrets/PII you don't want readable in there.
- Forgetting JWTs can't be easily revoked before expiry — this is why access tokens are kept short-lived and pairing with a refresh-token DB record is what actually gives you a revocation lever.
- Storing refresh tokens in localStorage instead of httpOnly cookies — exposes them to XSS.

## Related topics
- `oauth2-oidc` — OIDC uses ID tokens which are JWTs, and access/refresh tokens follow the same pattern described here.