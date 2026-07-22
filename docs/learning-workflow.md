# Learning Workflow

The repeatable loop for every new topic.

1. **Choose a topic.** Check `docs/topic-index.md` first so you don't duplicate work.
2. **Scaffold it:** `pnpm new-topic <category> <slug> "<Title>"`.
3. **Gather official documentation.** Add links to `resources.md` as you find them — don't wait until the end.
4. **Collect high-quality resources** (articles, videos, repos, RFCs) into the same `resources.md`. Anything general-purpose goes in `/resources/` instead and gets linked.
5. **Take structured notes** in `notes.md` while the topic is still confusing — this file is meant to be messy.
6. **Build the smallest possible implementation.** Decide where it lives using `docs/how-to-add-an-example.md`, then build it.
7. **Explain the implementation** by writing `README.md`'s "How it works" and "How to implement it" sections in your own words. If you can't explain it plainly, you don't understand it yet — go back to step 5.
8. **Fill in "Common mistakes"** as you hit them, both now and every time you revisit this topic later.
9. **Link related topics** in the `related` frontmatter field, then run `pnpm topics:index` and commit.

Set `status: done` in the frontmatter only once steps 6-8 are real, not placeholder text.
