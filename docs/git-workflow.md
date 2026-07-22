# Git Workflow

This is a solo learning repo, not a team codebase — optimize for low ceremony.

- **Trunk-based.** Commit directly to `main`. Branches and PRs add review overhead with no reviewer; skip them unless you specifically want the isolation.
- **Commit at the natural checkpoints in `docs/learning-workflow.md`** — after notes, after the example works, after resources are added. A topic is usually 2-4 commits, not one giant one.
- **Conventional Commits, scoped by slug:**
  - `docs(jwt): add notes on refresh rotation`
  - `feat(jwt-example): implement reuse detection`
  - `chore(index): regenerate topic index`
- **Tag milestones if you want them:** e.g. `v1-50-topics` when you cross 50 completed topics. Purely for your own sense of progress — not required.
