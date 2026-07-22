# Getting Started

This repo is a personal software engineering learning system, not a product. Read this once, then forget it — the point is that you shouldn't need to remember any of this to use the repo effectively.

## Orientation
- `topics/` — the actual content. One folder per concept.
- `apps/` — two small runnable apps (`playground-next`, `playground-api`) that host most examples.
- `docs/` — meta-documentation about how this repo works (you are here).
- `resources/` — general-purpose resources that span many topics.
- `scripts/` — automation for scaffolding topics and generating the index.

## The three commands you actually need
```bash
pnpm new-topic <category> <slug> "<Title>"   # scaffold a new topic
pnpm topics:index                             # regenerate docs/topic-index.md
pnpm dev                                      # run the playground apps
```

## Coming back after months away
1. Open `docs/topic-index.md` to see everything that exists and its status.
2. Open the topic's `README.md` for the summary. Only read `notes.md` if you need the messy deep-dive.
3. Run its example if it has one — see "How to run it" in `example/README.md`.

See `docs/learning-workflow.md` for the process of adding new material.
