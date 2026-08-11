---
title: "OAuth 2.0 and OpenID Connect"
category: authentication
last-updated: 2026-08-11
---

# OAuth 2.0 and OpenID Connect

## What is it?
OAuth 2.0 is an **authorization framework** — it lets a client application access a user’s resources on another service without ever seeing the user’s password. It issues limited, scoped, revocable tokens instead of permanent credentials. OpenID Connect (OIDC) is a thin identity layer built on top of OAuth 2.0 that adds real **authentication**: it returns a cryptographically signed ID Token (a JWT) that proves who the user is, not just what the app is allowed to do.

## Why does it exist?
Before OAuth, the only way for App A (e.g. Claude.ai) to access your data on Service B (e.g. GitHub) was to hand App A your actual password. That is disastrous: the third party now holds full credentials, can do anything your account can do, and revocation means changing your password everywhere. OAuth fixes the delegation problem by giving the third-party app a short-lived, scoped token instead of your password. Raw OAuth, however, still cannot reliably answer “who is this user?” — that is the gap OIDC closes with the ID Token.

## When should I use it?
- **Use OAuth 2.0 / OIDC** when your app needs to access a third-party service on the user’s behalf, or when you want users to sign in with an external identity provider (Google, GitHub, Auth0, etc.) instead of managing passwords yourself.
- **Do not use it** for pure first-party login where no third-party resource is involved. Plain session or JWT auth (see `http-auth-fundamentals`) is simpler and sufficient in that case.

## How it works
OAuth 2.0 answers “what can this app do on the user’s behalf?” OIDC answers “who is this user?”

The standard secure flow is the **Authorization Code** flow:

1. The client redirects the browser to the provider’s Authorization Endpoint with `client_id`, `redirect_uri`, `scope` (must include `openid` for OIDC), a high-entropy `state` (CSRF protection), and a `nonce` (replay protection for the ID Token).
2. The user authenticates and consents. The provider redirects back to the exact pre-registered `redirect_uri` with a short-lived `code` and the original `state`.
3. The client’s backend verifies the `state`, then performs a **server-to-server** POST to the Token Endpoint (using `client_secret`) to exchange the code for tokens. This back-channel step is what proves the request comes from the legitimate registered app.
4. The response contains an `access_token` (for calling APIs), optionally a `refresh_token`, and — when `openid` was requested — an `id_token` (a signed JWT containing identity claims such as `sub`, `email`, `iss`, `aud`, `exp`, and the `nonce`).
5. The client verifies the ID Token’s signature (via the provider’s JWKS), checks `iss`, `aud`, `exp`, and the `nonce`, then treats the claims as authentic identity.

The front-channel (browser redirects) never carries the tokens; the back-channel (server-to-server) does. That separation is the core security property of the flow.

## How to implement it
This topic is the exception to “smallest possible toy implementation” — a meaningful version requires acting as a real OAuth/OIDC **client** against a live provider.

- **OAuth 2.0 (Authorization Code) against GitHub** (`/topics/oauth/*`): generates a one-time `state`, redirects to GitHub’s authorize endpoint, validates `state` on the callback, then exchanges the code server-to-server for an access token and calls `api.github.com/user`.
- **OIDC against Google** (`/topics/oidc/*`): same Authorization Code flow, but requests the `openid` scope so Google also returns an `id_token`. The ID Token is verified locally with `jose`’s `createRemoteJWKSet` (handles key rotation) plus explicit checks on `iss`, `aud`, and `nonce`. Once verified, `sub`/`email`/`name` are trustworthy identity claims.

Full code lives in `./example/`.

## Common mistakes
- Treating OAuth 2.0 as authentication — it is only authorization. Without OIDC (or equivalent ID Token verification) you have no reliable proof of who the user is.
- Forgetting that `redirect_uri` must match the registered value *exactly* (including protocol and trailing slash) — classic `redirect_uri_mismatch`.
- Skipping the `state` parameter (CSRF) or the `nonce` claim (ID Token replay).
- Performing the code → token exchange in the browser instead of server-to-server (exposes tokens to the user-agent).
- Trusting claims from the UserInfo endpoint without confirming the returned `sub` matches the verified `sub` inside the ID Token.
- Using HTTP 307 redirects (they can leak POST bodies / credentials); prefer 302 or 303.
- Assuming the access token itself proves identity — only the verified ID Token does.

## Related topics
- `http-auth-fundamentals` — access tokens, refresh tokens, and JWTs follow the same lifecycle and verification patterns described there; ID tokens are simply JWTs with specific required claims.
- Cookie security flags (`HttpOnly`, `Secure`, `SameSite`) for binding `state`/`nonce` to the browser session.
- JWKS / key rotation for verifying ID Token signatures.

## Resources
See [resources.md](./resources.md).
