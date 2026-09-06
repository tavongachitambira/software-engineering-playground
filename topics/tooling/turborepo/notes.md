# **TurboRepo**

### What is TurboRepo?

TurboRepo is a build system for JavaScript and TypeScript monorepos.

The goal is to have a single workspace / GitHub repository containing multiple applications and shared libraries, while TurboRepo handles:

- Running tasks across applications
- Running tasks in parallel
- Task dependency ordering
- Local caching
- Remote/distributed caching
- Code sharing between applications
- Shared configuration
- CI/CD workflows
- Docker optimization

The lecture's example contains:

```
turbo-repo/
├── apps/
│   ├── web/          ← Next.js
│   └── turbo-repo-nestjs/ ← NestJS
│
├── packages/
│   ├── types/        ← shared types
│   ├── eslint-config/
│   └── typescript-config/
│
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

The important mental model is:

> TurboRepo doesn't replace your package manager. It works on top of the package manager's workspace functionality.

The lecture uses pnpm, but explicitly notes that npm and Yarn can also be used.

### Workspace vs Monorepo

**Workspace**  
A TurboRepo workspace can technically contain one package or multiple packages. The common use case is multiple packages.

**Monorepo**  
A monorepo is a single repository containing multiple applications/packages.

For example:

```
my-company/
├── frontend/
├── backend/
├── mobile/
├── shared-types/
└── shared-ui/
```

Instead of separate repositories (`frontend-repo`, `backend-repo`, `shared-types-repo`), everything lives together. TurboRepo takes advantage of this structure.

### TurboRepo Uses the Package Manager's Workspace

This is one of the most important concepts from the lecture.

TurboRepo itself isn't responsible for discovering your packages from scratch. It uses the native workspace functionality of your package manager.

For pnpm this is defined in `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

This tells pnpm:  
“These directories contain packages belonging to this workspace.”

The same general idea exists with npm and Yarn, although the configuration differs.

### What Makes Something a Package?

A directory becomes a package in the workspace when it has a `package.json` and is located somewhere covered by the workspace configuration.

For example:

```
apps/
└── web/
    └── package.json
```

means `web` is a workspace package.

Likewise:

```
packages/
└── types/
    └── package.json
```

means `types` is another workspace package.

Each package gets its own:

- name
- scripts
- dependencies
- configuration

### apps vs packages

The lecture establishes a useful convention.

**apps/**  
Contains actual applications.

```
apps/
├── web/
└── api/
```

- `web` → Next.js application  
- `api` → NestJS application  

**packages/**  
Contains reusable code.

```
packages/
├── types/
├── ui/
├── eslint-config/
└── typescript-config/
```

These aren't standalone applications. They're libraries/configuration that applications consume.

### Root package.json

There is also a root `package.json`. This belongs to the entire workspace rather than a particular application.

The lecture emphasizes that dependencies here should generally be dependencies required by the workspace itself.

```json
{
  "devDependencies": {
    "prettier": "...",
    "turbo": "...",
    "typescript": "..."
  }
}
```

The root package also contains the commands used to orchestrate tasks across the workspace:

```json
{
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "format": "turbo format"
  }
}
```

The important idea:

```
pnpm run build
       ↓
   turbo build
       ↓
find every package's "build" script
       ↓
execute them according to turbo.json
```

### turbo.json

This is TurboRepo's central configuration file.

Example conceptual structure:

```json
{
  "tasks": {
    "build": {},
    "dev": {},
    "lint": {}
  }
}
```

The `tasks` object tells Turbo:  
“These are the tasks that Turbo knows how to orchestrate.”

This is important because merely putting `"build": "turbo build"` in the root `package.json` doesn't define what Turbo should do. Turbo needs the corresponding task in `turbo.json`.

### Turbo Tasks

The lecture works with tasks such as `build`, `dev`, `lint`, and `test`.

The important relationship is:

```
turbo.json
     ↓
defines the task
     ↓
package.json
     ↓
provides the actual command
```

Example:

**Turbo**
```json
{
  "tasks": {
    "build": {}
  }
}
```

**Web package**
```json
{
  "scripts": {
    "build": "next build"
  }
}
```

**Nest package**
```json
{
  "scripts": {
    "build": "nest build"
  }
}
```

Turbo says “Run build.” Each package decides what its build actually means.

### Parallel Execution

This is one of TurboRepo's biggest benefits.

Suppose you have `apps/web`, `apps/admin`, and `apps/api`, and each has a `"build"` script.

Running `pnpm run build` can cause Turbo to execute the builds in parallel where dependencies permit it.

Instead of sequential execution:

```
web build
   ↓
admin build
   ↓
api build
```

you can get:

```
web  ────────┐
admin ────────┼──→ complete
api ──────────┘
```

The lecture demonstrates this with multiple Next.js applications being built simultaneously.

### Task Dependencies — dependsOn

Suppose `web` depends on the shared `ui` package. You don't want `web` build to happen before `ui` build.

Turbo can express this with:

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"]
    }
  }
}
```

The `^` is important.

**What does `^build` mean?**  
Before running `build` for this package, run `build` for its workspace dependencies.

So:

```
web
 ↓
ui
```

becomes:

```
ui build
   ↓
web build
```

Turbo can discover the dependency because `web/package.json` declares `ui` as a workspace dependency.

### Think of Turbo as a Dependency Graph

This is the mental model strongly recommended in the lecture.

Imagine:

```
        types
          ↓
         api
          ↓
         web
```

Turbo sees the relationships between packages. Then it determines:  
“Which tasks can run simultaneously, and which must wait?”

So Turbo isn't merely “run everything.” It's more like:

```
Build the dependency graph
        ↓
Determine dependencies
        ↓
Determine execution order
        ↓
Run independent tasks concurrently
        ↓
Cache results
```

That is the real value of the tool.

### Caching

TurboRepo's second major feature is caching.

Suppose you run `pnpm run build`. Turbo performs the build and the result is cached. Then you run `pnpm run build` again without changing anything. Turbo doesn't need to actually rebuild.

```
First run
─────────
build → execute → cache result

Second run
──────────
build → cache hit → restore result
```

The lecture demonstrates a build taking only milliseconds on the second execution because Turbo simply replayed the cached result.

### Cache Hit vs Cache Miss

**Cache hit**  
Turbo determines: “I've already performed this exact work.”

```
CACHE HIT
    ↓
reuse previous result
```

**Cache miss**  
Turbo determines: “Something relevant changed.”

```
CACHE MISS
    ↓
run task
    ↓
store new result
```

This is why caching can massively reduce build times.

### inputs

Turbo's `inputs` configuration determines which files affect a task.

Conceptually:

```json
{
  "tasks": {
    "build": {
      "inputs": [...]
    }
  }
}
```

The idea is: If an input that affects the build changes, invalidate the cache.

For example, if `web/page.tsx` changes, Turbo sees that this is an input to the web build. Therefore the old cache is invalid and a new build runs. But if an unrelated package (e.g. `api`) doesn't change, its cache can remain valid.

### Environment Variables Are Inputs Too

This is an easy concept to miss.

Suppose your build depends on `API_URL`. Changing:

```
API_URL=http://localhost:3001
```

to:

```
API_URL=http://localhost:4000
```

can change the result of the build. Therefore Turbo needs to know that the build depends on this environment variable.

The lecture adds:

```json
{
  "env": ["API_URL"]
}
```

to the build task.

Now:

```
API_URL changes
      ↓
Turbo invalidates cache
      ↓
build runs again
```

### outputs

The other side of caching is what Turbo should save.

For example, Next.js produces `.next/`. So Turbo can be told that this is a build output:

```json
{
  "outputs": [".next/**"]
}
```

Turbo can then cache the generated artifacts rather than just remembering that the command ran. This is particularly important for build tasks.

### The Complete Caching Mental Model

Put these three things together:

```
INPUTS
  ↓
determine whether work needs to be redone

TASK
  ↓
the actual operation

OUTPUTS
  ↓
what gets stored/restored
```

So:

```
inputs + environment
        ↓
   cache key
        ↓
 ┌──────────────┐
 │ Cache exists?│
 └──────┬───────┘
        │
    yes │ no
        │
        ↓
   restore       execute
   outputs          ↓
      ↓          outputs
      └──────→ cache
```

This is arguably the most important technical concept in the lecture.

### Shared Libraries

TurboRepo allows applications to consume internal workspace packages.

Example: `packages/ui` contains `Button`, `Card`, and `Code`. Then `apps/web` can import them.

This means:

```
              ┌──→ web
ui library ───┤
              └──→ docs
```

One implementation can be used by multiple applications.

### Package exports

The shared library defines an `exports` field in its `package.json`.

Conceptually:

```json
{
  "exports": {
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx"
  }
}
```

Now applications can do:

```ts
import { Button } from "@repo/ui/button";
```

rather than reaching into the library's internal filesystem. This creates controlled entry points into the package.

### Workspace Dependencies

The consuming application must explicitly declare the internal package as a dependency.

With pnpm:

```json
{
  "dependencies": {
    "@repo/ui": "workspace:*"
  }
}
```

`workspace:*` essentially tells pnpm:  
“Use the package from this local workspace.”

This is a key difference between simply having folders in the repository and having actual package-to-package dependencies.

### Why Shared Libraries Matter

Without a shared package:

```
web/
  Button.tsx

admin/
  Button.tsx

docs/
  Button.tsx
```

You have duplicated code.

With a shared package:

```
packages/
└── ui/
    └── Button.tsx
```

all applications use `@repo/ui`. Changing `Button.tsx` changes the component for every application using it.

The lecture emphasizes this as a way to keep the codebase DRY — Don't Repeat Yourself.

### Shared TypeScript Configuration

You can share configuration too. The lecture creates `packages/typescript-config/`.

Instead of every application having completely independent configuration, you can have `base.json` and application-specific configurations that extend it.

For example:

```
base.json
   ↑
   ├── nextjs.json
   └── react.json
```

Then `apps/web/tsconfig.json` extends the shared configuration.

This gives you a single source of truth instead of duplicated config across `web`, `api`, `docs`, etc.

### Shared ESLint Configuration

The same concept applies to ESLint. The lecture creates `packages/eslint-config` with configurations for `react`, `next`, and `library`.

Applications consume the appropriate shared configuration. Therefore:

```
common ESLint rules
        ↓
 ┌──────┼───────┐
web    api     docs
```

Change the shared configuration once → applications inherit the change.

### Adding a NestJS Application

The lecture demonstrates that a TurboRepo isn't restricted to Next.js. The existing workspace contains `apps/web`. A NestJS application is added as `apps/turbo-repo-nestjs`.

The key requirement remains: `apps/turbo-repo-nestjs/package.json` (because that's what makes it a workspace package).

### Aligning Scripts

Nest's default development script is `start:dev`, while Turbo expects `dev`. So the lecture changes the Nest script to:

```json
{
  "scripts": {
    "dev": "nest start --watch"
  }
}
```

The underlying command can differ. What matters is that Turbo sees the same task name (`dev`) across packages.

Therefore:

```
turbo dev
   ↓
web → next dev
api → nest start --watch
```

This is a very important distinction:  
**Turbo defines the task name; each package defines how that task is performed.**

### Port Conflicts

When both applications are launched, Next.js and NestJS both try to use port 3000 and conflict. The lecture changes NestJS to port 3001, giving:

- Next.js → `localhost:3000`
- NestJS → `localhost:3001`

This demonstrates another benefit of the monorepo development experience: both applications can be launched from one root command.

### Shared DTOs

Now the lecture moves into a much more realistic use case.

The backend has `CreateProductRequest`. The UI also needs to understand that request.

Without shared types you would duplicate the definition. That's dangerous. For example:

- Backend: `price: number`
- Frontend: `price: string`

Now your systems disagree.

Instead, create `packages/types` and define the DTO once. Both Next.js and NestJS import it.

### DTO vs Domain Interface

The lecture makes an important distinction.

**DTO** (`CreateProductRequest`) represents data coming into the system:

```ts
class CreateProductRequest {
    productName: string;
    price: number;
}
```

**Product** (the actual stored product) contains additional information:

```ts
interface Product extends CreateProductRequest {
    id: string;
}
```

So:

```
CreateProductRequest
├── productName
└── price

Product
├── productName
├── price
└── id
```

The `id` is generated by the server.

### Barrel File

The lecture introduces a useful package pattern: `src/index.ts`.

Instead of exposing every file individually through `package.json`, the package exposes one entry point.

For example:

```ts
export * from "./products/dto/create-product-request";
export * from "./products/interfaces/product";
```

Then consumers can simply:

```ts
import { Product, CreateProductRequest } from "@repo/types";
```

This is called a barrel file. The advantage: You don't continually modify the package exports whenever you add another type.

### Building the Shared Types Package

The types package gets its own `package.json`, `tsconfig.json`, `.eslintrc.js`, and `src/`.

It can have:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "lint": "eslint ."
  }
}
```

Now it becomes a proper Turbo package. Turbo can therefore run `turbo build` and include this library.

### Filtering Turbo Commands

You don't always want to run a task across the entire monorepo. Turbo supports filtering.

Conceptually:

```
pnpm run build --filter=@repo/types
```

Now:

- build everything ❌  
- build only `@repo/types` ✅  

This becomes useful in large monorepos where running everything would be wasteful.

### Next.js Server Actions

The lecture then connects the monorepo to Next.js.

A form is created with Name, Price, and a [Create Product] button.

Instead of making the browser directly call the NestJS API, the lecture uses a Next.js Server Action. A Server Action runs on the server.

The flow becomes:

```
Browser
   ↓
Next.js Server Action
   ↓
NestJS API
   ↓
Product service
```

rather than:

```
Browser
   ↓
NestJS API
```

The lecture specifically marks the server-action file with `"use server";`.

### Environment Variables in Next.js

The backend URL is stored in an environment variable `API_URL`. Then the Server Action uses `process.env.API_URL`.

The lecture deliberately commits this `.env` because the variable contains only a non-sensitive URL.

The important lesson is: Whether an environment variable belongs in source control depends on whether its value is actually sensitive. Secrets should obviously not be committed.

### Turbo + Environment Variables

This connects back to caching. Turbo's build cache must know that the build depends on `API_URL`.

Therefore:

```json
{
  "env": ["API_URL"]
}
```

is configured.

Now:

```
API_URL changes
       ↓
cache invalidated
       ↓
build reruns
```

This prevents Turbo from incorrectly restoring a build produced using an old environment configuration.

### Next.js Request Cache + Tags

The lecture then introduces another caching system: Next.js request caching.

The products fetch gets a tag `products`:

```ts
fetch(url, {
    next: {
        tags: ["products"]
    }
})
```

Then after creating a product, `revalidateTag("products")` is called.

The idea:

```
GET /products
       ↓
cache tagged "products"

POST /products
       ↓
new product created
       ↓
invalidate "products"
       ↓
next GET fetches fresh data
```

This is separate from Turbo's build cache. Do not confuse these two caching layers.

### Two Different Caches

This lecture actually demonstrates multiple caching systems.

**Turbo cache**  
Caches development/build/test task results (`turbo build`, `turbo lint`, `turbo test`).

**Next.js request cache**  
Caches application data fetches (`GET /products`).

This distinction is extremely important.

### GitHub Actions / CI

The next major topic is CI/CD. The lecture creates:

```
.github/
└── workflows/
    └── ci.yaml
```

GitHub Actions executes this workflow when code is pushed. The pipeline performs things like:

```
checkout
   ↓
setup Node
   ↓
install pnpm
   ↓
build
   ↓
test
```

The goal is: Every commit should automatically be checked.

### GitHub Actions Steps

The workflow contains steps such as:

- **Checkout** — `actions/checkout@v4` (gets the repository code)
- **Node** — `actions/setup-node@v4` (sets up Node.js; the lecture uses Node 20)
- **pnpm** — Installs the package manager
- **Build** — Runs `pnpm run build` (which ultimately invokes `turbo build`)
- **Test** — Runs the Turbo test task

This gives you automated validation on every commit.

### CI/CD Mental Model

```
Your local machine:
git commit
    ↓
git push
    ↓
GitHub
    ↓
GitHub Actions
    ↓
turbo build
turbo test
turbo lint
    ↓
PASS / FAIL
```

So CI becomes an automated safety net.

### Remote Distributed Cache

Local cache only helps one machine.

Imagine:

```
Developer A
    ↓
build
    ↓
local cache
```

Developer B doesn't have that cache, so Developer B has to rebuild.

Remote caching solves this:

```
                 Remote Cache
                /      |      \
               /       |       \
         Developer A  Developer B  CI
```

If A performs a build:

```
A → build → remote cache
```

B can then do:

```
B → build
     ↓
remote cache
     ↓
cache hit
```

No rebuild.

### Vercel Remote Cache

The lecture uses Vercel's remote caching service.

The workflow is roughly:

```
turbo login
      ↓
authenticate
      ↓
turbo link
      ↓
associate repository with remote cache
```

Once enabled, Turbo can store and retrieve task results remotely.

### GitHub Secrets

CI needs credentials to access the remote cache. You don't put the token directly inside `ci.yaml`.

Instead, GitHub repository secrets are used. The lecture creates `TURBO_TOKEN` as a secret and also configures `TURBO_TEAM` as the associated team/scope information.

The workflow accesses them through GitHub's `secrets` mechanism.

### Remote Cache in CI

Now the really powerful part.

Suppose the `types` package, NestJS API, and Next.js web were built in CI. Then you change only Next.js web.

On the next CI run:

- `types` → CACHE HIT  
- NestJS → CACHE HIT  
- web → CACHE MISS  

Therefore only `web` actually rebuilds. The lecture demonstrates exactly this behavior.

### Why This Is Called Distributed Caching

Because the cache isn't tied to one computer. The same cache can be accessed by:

- Developer laptop
- Developer laptop #2
- GitHub Actions
- Docker build

So the unit of reuse becomes the entire development/CI infrastructure. That's much more powerful than a local cache.

### Docker Problem in Monorepos

The lecture's final major topic is Docker.

A naive Dockerfile might do `COPY . .` inside a monorepo. But this means you're copying `apps/web`, `apps/api`, `packages/types`, `packages/ui`, etc., even if you're only trying to build `web`.

Problems:

1. **Larger Docker context** — Unnecessary source code gets copied.  
2. **More dependencies** — Docker may install dependencies for unrelated applications.  
3. **Worse caching** — Unrelated changes can invalidate Docker layers.  
4. **Larger image** — You end up carrying things the application doesn't need.  

The lecture explicitly identifies unrelated monorepo changes as a Docker build problem.

### turbo prune

Turbo provides `turbo prune`. You specify the package you want.

For example:

```
turbo prune @repo/web --docker
```

Conceptually:

```
Full monorepo
       ↓
turbo prune web
       ↓
Only:
web
+
its dependencies
+
relevant lockfile
```

The resulting output contains only what that application needs.

### Why Pruning Is Powerful

Imagine:

```
apps/
├── web
├── api
├── admin
└── mobile

packages/
├── ui
├── types
├── auth
└── database
```

If `web` only depends on:

```
web
 ↓
ui
 ↓
types
```

there's no reason for the Docker build to carry `api`, `admin`, `mobile`, or `database`. Pruning produces a minimal build context.

### Docker Production Build

The lecture then builds the application from the pruned workspace.

For Next.js, the production flow is essentially:

```
install dependencies
      ↓
build Next.js
      ↓
start production server
```

The resulting container can run `pnpm start`, which invokes `next start`.

### Remote Cache Inside Docker

The lecture then combines Docker + Turbo + Remote Cache.

The same remote cache credentials used in GitHub Actions can be supplied to the Docker build. The Docker builder receives `TURBO_TEAM` and `TURBO_TOKEN` as build arguments/environment variables.

Then:

```
Docker
   ↓
pnpm run build
   ↓
turbo build
   ↓
remote cache
```

If the same build already exists remotely → CACHE HIT and the build completes extremely quickly.

### The Big Picture

If you understand this diagram, you've understood the lecture:

```
                       TURBOREPO
                           │
             ┌─────────────┴─────────────┐
             │                           │
         Workspace                    Task System
             │                           │
      ┌──────┴──────┐              ┌─────┼─────┐
      │             │              │     │     │
     apps        packages        build  test  lint
      │             │
 ┌────┴────┐   ┌────┴───────────┐
 │         │   │                │
Next.js  NestJS types       configurations
 │         │   │                │
 └────┬────┘   └──────┬─────────┘
      │               │
      └───────┬───────┘
              │
         Shared Code
              │
       ┌──────┴──────┐
       │             │
    parallel       caching
       │             │
       └──────┬──────┘
              │
       Remote Cache
              │
      ┌───────┼────────┐
      │       │        │
   Local    GitHub   Docker
   Dev       CI       Build
```

### The Core Mental Model

Don't memorize TurboRepo commands first. Understand this:

> TurboRepo is fundamentally about avoiding unnecessary work.

It does this in several ways:

```
                     "Do I really need to do this?"
                                  │
             ┌────────────────────┼───────────────────┐
             ↓                    ↓                   ↓
        Dependency            Parallelize           Cache
        awareness             independent          previous
                              work                 work
             │                    │                   │
             ↓                    ↓                   ↓
        correct order        faster execution     no duplicate work
```

Then it extends that idea across your entire engineering workflow:

```
Local development
       ↓
CI/CD
       ↓
Docker
```

And remote caching means the work you've already performed on one machine can potentially be reused by another machine or CI runner.

That is the real reason TurboRepo becomes extremely valuable as a monorepo grows. The lecture's examples demonstrate this progression from local parallel builds → local caching → shared packages → CI → remote caching → Docker optimization.