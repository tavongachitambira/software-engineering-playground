# Folder Conventions

Every top-level folder has exactly one job.

| Folder | Responsibility |
|---|---|
| `topics/` | Learning content. One folder per concept, organized as `topics/<category>/<slug>/`. Not part of the pnpm workspace unless a topic has a standalone runnable example. |
| `apps/` | Small runnable apps that exist only to host examples. No business logic beyond what a topic needs. |
| `packages/config` | Shared tsconfig/eslint/prettier — the *only* shared package. See the note on shared code below. |
| `docs/` | Documentation about the repo itself (this file, workflows, conventions). Not topic content. |
| `resources/` | Cross-topic resources (books, RFCs, a reading backlog). Topic-specific resources live inside the topic. |
| `scripts/` | Repo automation (scaffolding, index generation). |

## Why `topics/` isn't inside `packages/`
Hundreds of topic folders would pollute the workspace dependency graph if every single one were a pnpm package, and most topics (pure concept notes, no runnable code) don't need a `package.json` at all. `topics/` is deliberately just documentation on disk. Only the `example/` subfolder inside a topic ever becomes an installable package, and only when it genuinely needs isolated dependencies.

## Why there's no `packages/shared` for example code
This is the one place this repo intentionally departs from how you'd structure a production monorepo. In a SaaS codebase, duplication is a liability. Here, duplication is often the point — seeing JWT signing implemented directly in three different examples teaches more than importing one shared `signToken()` helper three times. Don't create shared abstractions across examples unless the topic itself is "how to build a shared abstraction."

## Where does an example's code actually live?
Depends on the topic's runtime — see `docs/how-to-add-an-example.md` for the decision tree.
