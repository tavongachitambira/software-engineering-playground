---
title: "HTTP & Token Auth Fundamentals"
category: authentication
last-updated: 2026-08-11
---

# HTTP & Token Auth Fundamentals

## What is it?
A family of HTTP-level mechanisms for proving who is making a request. The spectrum runs from the simplest (Basic Auth — credentials on every request) through stateful sessions, opaque API keys, and fully self-contained signed tokens (JWTs). Modern systems almost always end up at the access-token + refresh-token pattern: a short-lived bearer JWT for every API call, paired with a longer-lived, server-tracked refresh token that can be rotated and revoked.

## Why does it exist?
Early web applications needed a standard way to restrict access without every developer inventing a one-off login form and cookie scheme. Stateful sessions solved the “don’t make me log in on every request” problem, but they forced every server instance to consult a shared session store — a scaling bottleneck once you go horizontal. Stateless tokens (especially JWTs) remove that lookup by putting the necessary claims and a cryptographic signature inside the token itself. The access/refresh split then solves the remaining security/UX tension: short-lived access tokens limit the blast radius of theft, while long-lived refresh tokens keep the user logged in without forcing constant re-authentication.

## When should I use it?
- **Basic Auth** — internal tooling, quick scripts, service-to-service calls over a trusted network where nothing better is set up yet. Never for public-facing browser apps.
- **API keys** — machine clients, third-party developer access, server-to-server. Not for representing an individual user’s browser session.
- **Session cookies** — traditional server-rendered web apps, low-to-moderate scale, situations where instant revocation is more important than horizontal scale.
- **JWT bearer + refresh** — modern SPA / mobile / microservice APIs that need to scale across many instances and still offer a good “stay logged in” experience.

**When not to use it**
- Don’t put long-lived JWTs in `localStorage` (XSS).
- Don’t rely on a single long-lived access token without a refresh + rotation story.
- Don’t use Basic Auth over plain HTTP or for anything user-facing.

## How it works

This topic covers two working examples: Basic auth and JWT bearer auth (plus the refresh-token extension).

### Basic auth
The client sends `username:password` base64-encoded in the `Authorization: Basic` header on every single request — there is no session, nothing is remembered server-side between requests. The server decodes the header and checks the credentials against its user store on every call.

This is fast to implement but insecure by default: base64 is encoding, not encryption, so anyone who sees the header can recover the raw password instantly. It only becomes safe under TLS, and even then repeatedly sending raw credentials is bad practice. There is no expiration and no way to scope access — it’s all or nothing.

### JWT bearer auth
The client logs in once via `/login` and gets back a signed JWT — a self-contained token with claims (subject, issued-at, expiry) baked in and a cryptographic signature over the top. From then on the client sends `Authorization: Bearer <token>` on every request. The server verifies the signature locally — no database lookup needed — which is what makes this approach stateless and scalable across multiple server instances.

Tokens are short-lived (15 min in the example) by convention, since there is no cheap way to revoke a JWT before it expires — the only real defense against a leaked token is keeping its lifetime short.

### Access + Refresh token pair (modern production pattern)
`/login` now returns both:
- a short-lived **access token** (JWT, 15 min) used on every API request, and
- a longer-lived **refresh token** (7 days, tracked server-side).

When the access token expires the client silently calls `/refresh`. The server:
1. validates the refresh token,
2. immediately invalidates the old one (rotation),
3. issues a brand-new access + refresh pair.

A stolen refresh token can therefore be replayed at most once. In production you also revoke the entire token family on reuse-of-a-dead-token detection — that is a strong signal of theft.

### How to implement it
- `basic-auth.ts` — decode the `Authorization: Basic` header with `Buffer.from(..., 'base64').toString()`, split on `:`, compare against a user store.
- `jwt-auth.ts` — uses `jose`’s `SignJWT` to issue tokens (`HS256`, `setExpirationTime('15m')`) and `jwtVerify` to check them on protected routes. `jose` forces you to declare the algorithm explicitly, which prevents the classic algorithm-confusion attack (attacker swaps `RS256` → `HS256` or `none` to forge a valid-looking token).
- Extended `jwt-auth.ts` with a refresh-token pair: `/login` returns both tokens; `/refresh` exchanges a valid refresh token for a new pair and rotates (invalidates) the old refresh token. In a real system the refresh store would be Redis or a DB and you would also kill the whole token family on reuse detection.

## Common mistakes
- Treating Base64 as encryption — it is trivial to reverse.
- Storing JWTs (especially refresh tokens) in `localStorage` instead of memory + `HttpOnly` / `Secure` / `SameSite=Strict` cookies.
- Assuming a signed JWT (JWS) is confidential — the payload is only base64url-encoded and readable by anyone who obtains the token.
- Forgetting that a JWT cannot be cheaply revoked before `exp`; this is why access tokens must be short-lived and why refresh tokens are tracked server-side.
- Letting the verification library trust the `alg` header from the token itself (algorithm confusion / “none” algorithm attacks). Always pin the expected algorithm.
- Using a single long-lived access token with no rotation story.

## Related topics
- OAuth 2.0 / OpenID Connect (OIDC uses ID tokens that are JWTs and the same access/refresh pattern)
- Cookie security flags (`HttpOnly`, `Secure`, `SameSite`)
- JWKS / key rotation for asymmetric (RS256) verification
- Token revocation strategies (blacklist, short TTL + refresh rotation)

## Resources
See [resources.md](./resources.md).