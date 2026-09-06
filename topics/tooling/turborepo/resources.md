# Resources: Turborepo

## Official documentation
- [Turborepo: Configuring turbo.json](https://turborepo.dev/docs/reference/configuration) — the reference for the `tasks` key, `dependsOn`, `inputs`, `outputs`, `env`. Read this over any third-party blog post — a lot of older content still shows the deprecated `pipeline` key.
- [Turborepo: Running Tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks) — filtering (`--filter`), automatic package scoping, the `^` dependency prefix explained precisely.
- [Turborepo: Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) — how to link a Vercel remote cache, `turbo login`/`turbo link`, and the underlying HTTP API spec if you ever want to self-host a cache server instead.
- [Vercel: Deploying Turborepo to Vercel](https://vercel.com/docs/monorepos/turborepo) — the env-vars-in-turbo.json gotcha for deployed apps specifically.

## Articles / blog posts
- Steve Kinney, "Turborepo" (Enterprise UI course notes) — a clean, current (mid-2026) explainer of the `^build` / `build` / `package#task` dependency vocabulary, and a good one-line framing: Turborepo as "a cache- and graph-aware task runner," not a monorepo framework itself.
- Strapi Engineering: "Boost Dev Speed with Turborepo" — covers the GitHub Actions `TURBO_TEAM`-as-repository-variable-not-secret detail (avoids GitHub censoring the team name in CI logs), plus a quick way to verify remote caching is actually working (delete `.turbo/cache` locally, rebuild, confirm artifacts replay from remote).

## GitHub repositories
- [vercel/turborepo](https://github.com/vercel/turborepo) — the project itself; the `skills/turborepo/references/configuration/tasks.md` file in the repo is a surprisingly good condensed reference for the `dependsOn` patterns specifically.
- [ducktors/turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache) — open-source self-hosted remote cache server implementation, useful to skim if you ever want to understand what the Vercel-hosted cache is actually doing under the hood, or self-host for a team not on Vercel.

## RFCs / specs
- None — Turborepo isn't a wire protocol or open standard, it's Vercel's own build tool. The closest thing to a spec is the Remote Caching HTTP API documented in the `turborepo-remote-cache` repo above, which any compliant server (not just Vercel's) can implement.

(General-purpose tooling resources beyond this topic go in `/resources/` per repo convention.)