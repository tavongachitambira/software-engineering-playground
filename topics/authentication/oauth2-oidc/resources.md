# Resources: OAuth 2.0 and OpenID Connect

## Official documentation
- [RFC 6749 — The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749) — the core spec. Frames the whole problem well: compromise of any third-party app used to mean compromise of the end-user's password and everything protected by it, which is exactly what OAuth's separation of client credentials from resource-owner credentials fixes. 
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — the OIDC spec itself. Section on ID Token validation is directly relevant to the `jwtVerify(... issuer, audience)` check in `oidc-google.ts`.
- [RFC 7519 — JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519) — same JWT spec as the auth-fundamentals topic; the ID token you verify against Google's JWKS is structured per this doc.
- [oauth.net — Map of OAuth 2.0 Specs](https://oauth.com/oauth2-servers/map-oauth-2-0-specs/) — useful index once you realize RFC 6749 alone leaves a lot unspecified (token format, PKCE, etc. are separate RFCs).

## Articles / blog posts
- "OAuth 2.0 and OpenID Connect: what the standards actually say" (search: `oauth 2.0 openid connect standards guide medium`) — good plain-language walkthrough of `state` (CSRF) vs `nonce` (OIDC replay protection) — worth reading since your GitHub implementation only used `state`; a proper OIDC implementation (which you did with Google) should also use `nonce` in the ID token to prevent replay.
- Auth0: "OAuth2 vs OIDC" (search: `auth0 oauth2 vs oidc blog`) — reinforces the "what can this app do" vs "who is this user" framing.

## GitHub repositories
- [panva/jose](https://github.com/panva/jose) — same library, specifically the `createRemoteJWKSet` usage for verifying provider-signed ID tokens against a rotating public key set.

## RFCs / specs
- RFC 6749 (OAuth 2.0), RFC 7519 (JWT), OpenID Connect Core 1.0 — see above.

(General-purpose access-control resources beyond this topic go in `/resources/` per repo convention.)