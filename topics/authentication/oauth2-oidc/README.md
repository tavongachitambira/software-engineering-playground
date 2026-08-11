---
title: "OAuth 2.0 and OpenID Connect"
category: authentication
slug: oauth2-oidc
status: planned
difficulty: beginner
related: []
last-updated: 2026-07-29
---

# OAuth 2.0 and OpenID Connect

## What is it?
One paragraph, plain language.

## Why does it exist?
The problem it solves. What was painful before this existed?

## When should I use it?
Concrete scenarios. Also note when NOT to use it.

## How it works
The mental model. Diagrams go in `diagrams/` and are referenced here.

## How to implement it
Link to `./example/` and summarize the approach in a few sentences. Full code lives in the example, not here.

## Common mistakes
Bullet list. Update this every time you get bitten by something.

## Related topics
- (fill in as you add them)

## Resources
See [resources.md](./resources.md).

**OIDC implemented via Google** (`/topics/oidc/*`): GitHub's OAuth doesn't
support OIDC, so this uses Google instead. The key addition over plain
OAuth: the `openid` scope triggers Google to also return an `id_token`
alongside the access token. The ID token is a JWT — its signature is
verified locally against Google's public keys (fetched via `jose`'s
`createRemoteJWKSet`, which handles key rotation automatically), and its
`iss`/`aud` claims are checked to confirm it was issued by Google
specifically for this app. Once verified, `sub`/`email`/`name` in the
payload are trustworthy — that verification step is what "authentication"
actually means in OIDC, as opposed to OAuth's "authorization" alone.