# How to Add a New Topic

1. Run:
   ```bash
   pnpm new-topic <category> <slug> "<Title>"
   ```
   This scaffolds `topics/<category>/<slug>/` from the template.

2. Follow `docs/learning-workflow.md` to fill it in.

3. Decide where the runnable example (if any) lives — see `docs/how-to-add-an-example.md`.

4. Update `status` in the topic's `README.md` frontmatter as you go: `planned` → `in-progress` → `done`.

5. Regenerate the index:
   ```bash
   pnpm topics:index
   ```

6. Commit. A few commits per topic is normal — see `docs/git-workflow.md`.
