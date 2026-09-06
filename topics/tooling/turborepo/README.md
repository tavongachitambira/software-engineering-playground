# Turborepo

## What is it?

Turborepo is a build system for JavaScript/TypeScript monorepos. It
doesn't replace your package manager's workspace feature (pnpm/npm/yarn
workspaces) — it sits on top of it, adding two things: a dependency-aware
task graph so `build`/`lint`/`test` run in the correct order and in
parallel where possible, and content-aware caching so unchanged work is
skipped entirely (replayed from a cache) rather than re-executed.

## How it works

Any directory under `apps/` or `packages/` with its own `package.json`
is automatically a Turborepo package — no separate registration needed
beyond satisfying the package manager's own workspace config.

`turbo.json` defines tasks and their relationships:
- `dependsOn: ["^build"]` — run this task in all dependency packages
  first (the `^` means "in dependencies," not "in this same package")
- `dependsOn: ["build"]` (no `^`) — run another task in the SAME package
  first
- `inputs`/`outputs` — what counts toward a task's cache key, and what
  gets restored on a cache hit

Shared code between packages works through an explicit `exports` field
in a library's `package.json`, consumed by other packages as a normal
workspace dependency (`workspace:*` for pnpm). Because it's a real
package dependency, not a copy-pasted file, a change to a shared type
propagates to every consumer immediately.

Remote caching (`turbo login` + `turbo link`, then `TURBO_TOKEN` +
`TURBO_TEAM` env vars in CI) means a cache hit on one machine — a
teammate's laptop, or a previous CI run — is available to every other
machine and pipeline. In CI specifically, `TURBO_TEAM` should be a
GitHub Actions repository **variable**, not a secret — as a secret it
gets censored in logs for no real security benefit, since a team ID
isn't sensitive.

`turbo prune <package> --docker` generates a pruned copy of the
workspace containing only the code and dependencies one specific
package actually needs — the mechanism that keeps monorepo Docker
images from bloating with every other app/library's source and
dependencies.

## How to implement it

This topic doesn't have a runnable `example/` in this repo yet — it's
conceptual/reference notes based on a video walkthrough, cross-checked
against current official docs (the `tasks` key, not the deprecated
`pipeline` key from Turborepo 1.x). If a hands-on example gets built
later, the natural fit is retrofitting `apps/web` + `apps/api` in this
very repo with a root `turbo.json`, since they're already a two-app
pnpm workspace without task orchestration wired up yet.

## Common mistakes (things worth double-checking against docs, not blog posts)
- **`pipeline` vs `tasks`** — a huge amount of Turborepo content online
  still shows `pipeline` as the turbo.json key. That's Turborepo 1.x;
  current versions use `tasks`. There's an official codemod
  (`rename-pipeline`) for migrating.
- **`TURBO_TEAM` as a GitHub secret** — works, but gets silently
  censored in CI logs, making cache debugging harder than it needs to
  be. Use a repository variable instead.
- **Forgetting `env` in a task's config when code reads
  `process.env.SOMETHING`** — Turborepo's own linter flags this (as
  seen when the transcript's tutorial hit this warning directly), since
  an untracked env var means changing it silently doesn't invalidate
  the cache, serving a stale build.

## Related topics
- This repo's own monorepo structure (`apps/web`, `apps/api`,
  `packages/`) is a smaller, currently-unoptimized instance of exactly
  the structure this topic describes — no turbo.json task caching wired
  up yet.