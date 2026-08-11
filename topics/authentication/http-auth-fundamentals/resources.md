# Resources: HTTP & Token Auth Fundamentals

## Official documentation
- [RFC 7617 — The 'Basic' HTTP Authentication Scheme](https://www.rfc-editor.org/rfc/rfc7617.html) — the actual spec for what you implemented first. Short, worth reading in full.
- [RFC 7616 — HTTP Digest Access Authentication](https://httpwg.org/specs/rfc7616.html) — the challenge-response nonce mechanism, spelled out precisely.
- [RFC 7519 — JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519) — defines the actual structure/claims (`sub`, `exp`, `iat`, `jti`, etc.) you're using in `jwt-auth.ts`.
- [RFC 6750 — Bearer Token Usage](https://datatracker.ietf.org/doc/html/rfc6750) — defines what "Bearer" actually means as a spec term, not just a convention — this is the doc that formalizes "whoever holds it, owns it."
- [jose documentation](https://github.com/panva/jose) — the library itself; worth reading the README's "Algorithm key requirements" section once you move from HS256 to RS256 (see RBAC/production-auth token pair discussion).

## Articles / blog posts
- Auth0: "Refresh Token Rotation" (search: `auth0 refresh token rotation docs`) — covers the reuse-detection mechanism you implemented, and how production systems handle a detected replay (revoking the whole token family, not just the one token).
- jwt.io — not just a decoder; the "Introduction" page on the site explains the three-part structure (header/payload/signature) clearly, useful as a quick visual reference alongside the RFC.

## GitHub repositories
- [panva/jose](https://github.com/panva/jose) — the library source. Worth skimming the algorithm-confusion-prevention code (why `SignJWT`/`jwtVerify` force explicit `alg`) since that's a real historical CVE class in older JWT libraries.

## RFCs / specs
- See "Official documentation" above — for this topic, the RFCs and the docs are largely the same set of links.

(General-purpose access-control resources beyond this topic go in `/resources/` per repo convention.)