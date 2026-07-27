# Software Engineering Playbook

A personal, long-term learning monorepo — not a product, not a portfolio. Every concept I learn becomes a self-contained topic under `topics/`, with theory, notes, resources, and a minimal working example.

## Start here
- [`docs/getting-started.md`](./docs/getting-started.md) — orientation
- [`docs/topic-index.md`](./docs/topic-index.md) — every topic, generated
- [`docs/learning-workflow.md`](./docs/learning-workflow.md) — how a topic gets added

## Structure
```
.
├── apps/
│   ├── api/              # Fastify backend — hosts backend-topic examples
│   └── playground-next/  # Next.js app — hosts frontend-topic examples
├── docs/                  # documentation about this repo
├── packages/config/       # shared tsconfig/eslint (the only shared package)
├── resources/              # cross-topic resources
├── scripts/                 # new-topic + index generation
└── topics/                  # the actual content, one folder per concept
```

## Commands
```bash
pnpm install
pnpm new-topic <category> <slug> "<Title>"   # scaffold a new topic
pnpm topics:index                             # regenerate docs/topic-index.md
pnpm --filter api dev                         # run the backend playground
pnpm --filter playground-next dev             # run the frontend playground
```

## Philosophy
Optimize for understanding this again in five years, not for how impressive it looks today. See [`docs/folder-conventions.md`](./docs/folder-conventions.md) for the reasoning behind every structural decision — including why `topics/` sits outside the pnpm workspace and why there's no shared code package for example code.