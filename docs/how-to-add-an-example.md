# How to Add an Example

Not every topic needs runnable code (e.g. CAP theorem doesn't). When it does, where the code lives depends on its runtime:

| Topic is about... | Example lives in... |
|---|---|
| React, Next.js, rendering, client state, forms | A route inside `apps/playground-next`, e.g. `app/topics/<slug>/page.tsx` |
| A backend concept that benefits from a long-running server (REST, GraphQL, WebSockets, Redis, auth flows, background jobs) | A route/module inside `apps/playground-api`, e.g. `src/routes/<slug>.ts` |
| A CLI/script concept, an algorithm, or anything Python (data science, ML, RAG) | A standalone `topics/<category>/<slug>/example/` with its own `package.json` (or `requirements.txt` / `pyproject.toml` for Python) |
| Pure infrastructure (Docker, docker-compose) | `topics/<category>/<slug>/example/docker-compose.yml` + a README, no `package.json` needed |
| A pure concept, no code | Skip `example/` entirely and delete the folder |

Standalone examples with a `package.json` are automatically picked up by the pnpm workspace glob `topics/*/*/example` — no extra config needed. Every example's `example/README.md` should state, in one line, exactly how to run it.
