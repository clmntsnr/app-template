# Dependency Management

How dependencies, packages, and apps are organized in this monorepo. Rules are opinionated and meant to keep the graph small, the versions coherent, and the boundaries clear.

---

## Core Principles

### 1. No extra library
Before adding a dependency, check whether the codebase already solves the problem.

- If another package/app already pulls in a library for this purpose, **use the same one**. Don't introduce a second utility lib, a second date lib, a second HTTP client, a second validator.
- If a pattern already exists (e.g. an Elysia route style, a TanStack Query hook factory, a Drizzle repository helper), **follow it** rather than rolling a new one.
- A new dependency must be justifiable: it does something materially different, it's significantly better than the incumbent, and the migration cost is acknowledged.
- "Small" libs count too. Every dep is supply-chain surface, version churn, and build time.

**Rule:** the first answer to "what do I install?" is "what do we already have?"

### 2. Single source per concern
One library per concern across the whole monorepo:
- One schema lib (TypeBox).
- One ORM (Drizzle).
- One HTTP framework (Elysia).
- One component primitive layer (shadcn on Base UI).
- One styling system (Tailwind).
- One test runner (Bun test).
- One linter+formatter (Biome).

If you find yourself reaching for a second tool in the same lane, raise it as a stack decision — don't fragment quietly.

### 3. Pinned versions, no ranges
- All dependencies use **exact versions** in `package.json` — no `^`, no `~`, no `*`.
- `bun.lock` is committed and authoritative.
- Upgrades are deliberate: bump the version, run the build/tests, commit. No drive-by `bun update`.

### 4. Catalogs for shared versions
Use **Bun catalogs** (`workspaces.catalog` / `workspaces.catalogs` in the root `package.json`) to declare the canonical version of every shared dependency once.

- Each workspace references the catalog via `"react": "catalog:"` instead of restating the version.
- One bump in the root upgrades the whole graph.
- Prevents the classic monorepo bug where two workspaces resolve different minor versions of React/Zod/etc.
- Default catalog covers everything cross-cutting (React, Tailwind, TanStack, Drizzle, TypeBox, Elysia, Effect, Biome, TypeScript). Named catalogs only when a subset genuinely needs a different version (rare — justify it).

### 5. Dev vs runtime deps stay honest
- A runtime import → `dependencies`.
- Build/test/type-only → `devDependencies`.
- Type-only packages (`@types/*`, `*-types`) → `devDependencies`.
- Never put a prod import in `devDependencies` to "shrink the install" — it breaks downstream consumers.

---

## Repository Layout

```
apps/         # runnable apps and servers
packages/     # reusable modules, grouped by category
docs/         # documentation (this folder)
```

### `apps/` — what runs
Anything with an entry point a human or a process starts:

- `apps/web` — TanStack Start frontend.
- `apps/api` — Elysia HTTP server.
- `apps/desktop` — Electrobun shell.
- `apps/docs` — docs site.
- `apps/<worker>` — background workers, cron runners, CLIs.

**Apps are intentionally shallow.** They wire packages together and expose a runtime — almost no business logic lives here. If an app file grows substantial logic, it probably belongs in a package.

An app:
- May depend on any number of `packages/*`.
- **Must not** be depended on by another app or package.
- Owns its own config (env, build, deploy).

### `packages/` — what's reused
Packages are **categorized by domain**, not flat. The category is encoded in the npm scope.

```
packages/
  ui/
    shadcn/          # @package-ui/shadcn — copied shadcn components on Base UI
    icons/           # @package-ui/icons
    theme/           # @package-ui/theme — Tailwind preset, tokens
  config/
    typescript/      # @package-config/typescript — base tsconfigs
    biome/           # @package-config/biome — shared biome.json
    tailwind/        # @package-config/tailwind
  core/
    db/              # @package-core/db — generic Drizzle helpers (createDb, types)
    auth/            # @package-core/auth — Better Auth setup
    api-client/      # @package-core/api-client — Eden client wrapper
    schemas/         # @package-core/schemas — shared TypeBox schemas
  db/
    app/             # @package-db/app — primary DB schema + client instance
    analytics/       # @package-db/analytics — analytics DB schema + client
    <name>/          # one folder per logical database
  features/
    billing/         # @package-features/billing — domain module
    <feature>/       # one folder per bounded domain
  utils/
    <name>/          # @package-utils/<name> — pure, dependency-light helpers
```

**Naming convention:** `@package-<category>/<name>`. The category is the npm scope, the package is the leaf. This is a real npm-valid `package.json#name` — no TS-alias trick needed, Bun/Node resolution Just Works, and you can later publish any package without renaming.

**Categories used here:**

- **`ui/`** — visual primitives, components, theming. Anything React/Tailwind that renders.
- **`config/`** — shared tool configs consumed by apps and packages (tsconfig, biome, tailwind).
- **`core/`** — cross-feature platform: shared utilities, auth, schemas, generated clients. Used by most apps.
- **`db/`** — one package per logical database. Each package owns its schema, its drizzle-kit config, its migrations, and exports a typed client built from `@package-core/db`'s `createDb` helper. A second DB (analytics, audit log, vector store) is a sibling package, never an extra schema file inside `db/app`. This keeps connection strings, migration history, and type inference cleanly separated per DB.
- **`features/`** — bounded domain modules (billing, notifications, organizations…). Each owns its routes, schemas, db tables, UI surfaces. Apps compose features.
- **`utils/`** — small, pure, dependency-light helpers. No framework imports. If it needs React or the DB, it doesn't belong here.

### Adding a new package

1. Pick a category. If none fits, propose a new category — don't drop it loose.
2. Path: `packages/<category>/<name>`. Package name: `@package-<category>/<name>`.
3. Start from a sibling as a template. Match the existing structure (entry, exports, tsconfig extends, scripts).
4. Add the catalog references; don't pin versions locally.

---

## Cross-Package Rules

### Dependency direction
```
apps  →  features  →  core  →  utils
              ↓         ↓
              ui     config
```

- Arrows point **down**. Higher tiers depend on lower tiers, never the reverse.
- `utils` and `config` are leaves — they depend on nothing internal.
- `core` may depend on `utils`/`config`.
- `features` may depend on `core`, `ui`, `utils`, `config`.
- `apps` may depend on anything.
- **No sibling-to-sibling imports across features.** If `features/billing` needs something from `features/notifications`, the shared piece moves to `core/` (or a new feature is composed at the app layer).

### Internal package imports
- Always import via the package name (`@package-core/db`), never via relative paths that cross package boundaries.
- Each package exports through a single `index.ts` (or explicit `exports` map). No deep imports into another package's internals.

### Workspace protocol
Internal deps in `package.json` use `"workspace:*"`:
```json
"@package-core/db": "workspace:*"
```
Bun resolves it locally; published artifacts (if any) get rewritten on publish.

---

## Versioning & Upgrades

- **Renovate / Dependabot** runs weekly, grouped by ecosystem (TanStack together, Drizzle together, types together). Reduces PR noise.
- **Major upgrades** are their own PR with a written migration note in the PR body.
- **Security patches** merge fast, no batching.
- After any upgrade: `bun install && bun run check && bun test && bun run build` — green before merge.

---

## Anti-Patterns (don't)

- Adding `lodash` (or `ramda`, or `underscore`) for one helper. Write the four-line function or use the Bun/standard equivalent.
- Adding a date lib. If you must, **one** for the whole repo, decided deliberately.
- Mixing `axios` + `fetch` + `ky`. Pick one — likely Eden + native fetch.
- Local version overrides ("just for this package"). Either it's a catalog change or it doesn't happen.
- Untyped `any` deps with no `@types/*` and no built-in types. Find a typed alternative or write a `.d.ts`.
- Circular workspace deps. CI should fail on these.

---

## Open Proposals — please confirm

These are additional rules I'd add. Tell me yes/no on each and I'll fold the accepted ones in (or remove sections you don't want):

1. **Renovate weekly, grouped by ecosystem** — as described above. Alternative: Dependabot, or manual-only.
2. **Forbid `peerDependencies` in internal packages** — internal packages always use `dependencies`. `peerDependencies` only when publishing externally.
3. **`exports` map required on every package** (no `main` only) — enforces the public API surface and lets us hide internals.
4. **CI guard against new top-level deps** — a PR that adds a root-level dependency requires a doc change in this file justifying it. Stops dep sprawl.
5. **`sideEffects: false` by default** in every package's `package.json` unless it genuinely has side-effectful imports (CSS, polyfills) — keeps tree-shaking aggressive.
6. **No `node_modules` binaries called directly** — always go through `bun run <script>` or `bunx`. Keeps invocation reproducible.
7. **One `tsconfig.base.json` in `packages/config/typescript`** that every package extends; per-package tsconfigs only override `include`/`outDir`.
8. **Bundle-size budget on `apps/web`** — fail CI if the client bundle grows past a threshold without an explicit bump. Catches accidental heavy deps.
9. **Disallow `postinstall` scripts in dependencies** (Bun supports `trustedDependencies`) — only allow-listed packages can run install scripts.
10. **A `CODEOWNERS`-style mapping from category → reviewer** so `core/` and `config/` changes get extra eyes.

Reply with the numbers you want kept, dropped, or modified, and I'll update the doc.
