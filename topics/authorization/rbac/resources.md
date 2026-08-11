# Resources: Role-Based Access Control (RBAC)

## Official documentation
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) — the best single starting point. Covers RBAC vs ABAC vs ReBAC and when each breaks down.
- [NIST RBAC model (INCITS 359)](https://csrc.nist.gov/projects/role-based-access-control) — the formal academic model RBAC implementations are usually loosely based on: users, roles, permissions, sessions.

## Articles / blog posts
- Auth0: "Role-Based Access Control (RBAC) vs Attribute-Based Access Control (ABAC)" — good for understanding when plain role-checks stop being enough and you need per-resource attribute rules.
- "Postgres Row-Level Security" (search: `postgres RLS docs`) — worth reading once you get past app-layer RBAC, since SyncBoard uses Postgres and enforcing authorization at the DB layer (not just in route middleware) is the more robust pattern for a real system.

## GitHub repositories
- [stalniy/casl](https://github.com/stalniy/casl) — a well-regarded isomorphic authorization library for JS/TS. Worth reading the source/docs even if you hand-roll your own version first — it shows how a more general permission system (beyond flat roles) gets modeled in code.

## RFCs / specs
- None — RBAC isn't a wire protocol/standard like OAuth, it's an access-control model, so there's no RFC. That's actually a useful distinction to note in your `README.md`'s "What is it?" section: RBAC is a *pattern* you implement yourself, not a spec you implement against.

(General-purpose access-control resources beyond this topic go in `/resources/` per repo convention.)   