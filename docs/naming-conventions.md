# Naming Conventions

- **Folders and files:** kebab-case, always. `background-jobs`, not `BackgroundJobs` or `background_jobs`.
- **Categories are plural, broad nouns:** `authentication`, `databases`, `apis`, `testing`, `infrastructure`, `ai-ml`. Keep the category list short and stable — add a new one only when a topic genuinely doesn't fit an existing category.
- **Slugs are the specific concept:** `jwt`, `oauth`, `websockets`, `vector-databases`.
- **Full path:** `topics/<category>/<slug>/`.
- **Standalone example packages:** named `@topics/<slug>` in their `package.json`.
- **Git commits:** Conventional Commits, scoped by slug — `docs(jwt): add refresh rotation notes`, `feat(jwt-example): add reuse detection demo`.
- **Branches (if you use them):** `topic/<category>-<slug>`.
