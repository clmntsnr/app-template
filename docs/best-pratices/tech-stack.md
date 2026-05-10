# Tech Stack

The canonical stack for this template. Every choice below is opinionated: type-safety end-to-end, first-class performance, and minimal glue code between layers.

---

## Core Principle: Stay on the Bleeding Edge

**Always use the latest stable major of every dependency.** No exceptions without a written reason in the PR description.

- **Why:** This template is a starting point — anything we ship locks downstream apps into our choices. Picking the newest major means we inherit modern architecture (Tailwind v4's Oxide engine, Vite's Rolldown, React 19's compiler-friendly APIs) instead of paying for a migration six months in. Old majors accumulate footguns; new majors fix them.
- **What this means in practice:**
  - Bump **catalogs in the root `package.json`** whenever a major drops. Prefer the breaking-change migration over staying behind.
  - Track ecosystem signal: if a tool ships a v-next (Tailwind v4, Vite 8, TypeScript 6, React 19), assume we adopt it within the same release cycle.
  - Pin to exact versions (no `^`, no `~`) so upgrades are explicit, reviewable diffs — not silent drift.
  - When two libraries gate each other (e.g. a plugin lags its host), take the host's latest and find a maintained replacement for the lagging plugin (we did this when moving from `tailwindcss-animate` → `tw-animate-css` for Tailwind v4).
- **Acceptable reasons to lag:** a hard incompatibility with a load-bearing dependency, or a known regression that breaks production. Both must be called out in the catalog with a `// TODO: bump to vX once Y` comment.

---

## Runtime & Tooling

### Bun
- **Scope:** JavaScript/TypeScript runtime, package manager, bundler, test runner.
- **Why:** Single binary replaces Node + npm + tsx + jest. Native TS, fast installs, built-in workspace support. Lockfile (`bun.lock`) is deterministic and fast to resolve.
- **Used for:** Running every app and package in the monorepo, installing dependencies, executing scripts.

### Turborepo
- **Scope:** Monorepo task orchestration and remote caching.
- **Why:** Pairs cleanly with Bun workspaces. Caches build/test/lint outputs across the graph.
- **Used for:** `apps/*` and `packages/*` task pipelines.

### Bun Test
- **Scope:** Unit and integration test runner (built into Bun).
- **Why:** Zero-config, native TS, Jest-compatible API (`describe`/`it`/`expect`), starts in milliseconds. No Vitest/Jest install, no separate transform pipeline. Snapshot testing, mocks, and coverage included.
- **Used for:** All unit and integration tests across apps and packages. Run with `bun test`.

### Biome
- **Scope:** Linter + formatter in a single Rust binary.
- **Why:** Replaces ESLint **and** Prettier with one tool that's ~25× faster. Zero-config defaults are sane; one `biome.json` covers the whole monorepo. Fits the Bun-era "single fast tool" philosophy — no plugin sprawl, no config drift between packages.
- **Used for:** Linting and formatting every TS/JS/JSON file. Run via `bun run check` (Biome's combined lint+format pass).

---

## Frontend

### TanStack Start (React)
- **Scope:** Full-stack React framework — routing, SSR, server functions, streaming.
- **Why:** Type-safe routing (file-based but typed end-to-end), first-class data loaders, server functions that feel like RPC. React because it's the largest ecosystem — every component lib, every hire, every example.
- **Used for:** Web app shell, pages, server-side data loading, server actions.

### TanStack Router
- **Scope:** Routing layer (already inside Start).
- **Why:** Fully type-safe params, search params, and links. Loader-based data fetching integrates with Query.
- **Used for:** Navigation, route-level data loading, search-param state.

### TanStack Query
- **Scope:** Server-state management (fetching, caching, invalidation, mutations).
- **Why:** The standard. Pairs with Router loaders for SSR hydration. Replaces Redux/Zustand for anything that comes from the server.
- **Used for:** All client-side data fetching, optimistic updates, background refetching.

### TanStack Table
- **Scope:** Headless table primitives.
- **Why:** Headless = full control over markup/styling (pairs with shadcn). Sorting, filtering, pagination, virtualization, column resizing — all type-safe over your row shape.
- **Version:** v9 (alpha). The headless contract is preserved; ownership of breaking changes during alpha is expected — pin exact versions and treat upgrades as code-touching.
- **Used for:** Any non-trivial data grid.

### TanStack Form
- **Scope:** Headless, type-safe form state.
- **Why:** Same philosophy as Table — fully typed, framework-agnostic, no schema lock-in (works with Zod/Valibot/Effect Schema).
- **Used for:** All forms.

### TanStack Virtual
- **Scope:** Virtualization primitives for long lists/tables.
- **Why:** Headless, handles dynamic sizes, integrates with Table.
- **Used for:** Long lists, large tables, infinite scroll surfaces.

### TanStack Pacer (shortcuts / debouncing / throttling)
- **Scope:** Async control utilities — debounce, throttle, queue, rate-limit.
- **Why:** Type-safe, framework-agnostic, replaces ad-hoc `setTimeout` glue.
- **Used for:** Search inputs, autosave, request batching.

---

## UI

### shadcn/ui (on Base UI)
- **Scope:** Copy-in component library — buttons, dialogs, popovers, menus, etc.
- **Why:** Code lives in your repo, fully ownable and themeable. Non-negotiable for shipping a polished UI fast.
- **Note:** Use the **Base UI** variants (not Radix). Base UI is the successor maintained by the original Radix team — better accessibility primitives, cleaner composition API, more permissive styling hooks.
- **Used for:** Every interactive UI primitive.

### Tailwind CSS (v4)
- **Scope:** Utility-first styling.
- **Why:** Default styling layer for shadcn. Co-locates style with markup, no CSS-in-JS runtime cost. **v4 is mandatory** — the new Oxide engine is an order of magnitude faster, config lives in CSS (`@theme`) instead of `tailwind.config.{js,ts}`, and the first-party `@tailwindcss/vite` plugin replaces the PostCSS pipeline. No more `postcss.config` / `autoprefixer` — Tailwind handles vendor prefixing internally.
- **Animations:** Use `tw-animate-css` (v4-native). The legacy `tailwindcss-animate` plugin does not work with v4.
- **Used for:** All styling.

---

## Backend

### Elysia
- **Scope:** HTTP API framework on Bun.
- **Why:** End-to-end type safety via Eden (client infers types directly from server routes — no codegen, no OpenAPI round-trip). Built for Bun, faster than Hono/Express, ergonomic schema-first validation.
- **Used for:** REST/RPC APIs, websocket endpoints, anything that doesn't belong in a TanStack Start server function.

### Effect
- **Scope:** Strategic — **not** the default for every function.
- **Version:** 4.x (currently beta). The 4.x API is more compositional than 3.x; consult the migration guide before introducing Effect into a new module, and don't mix idioms across files.
- **Why:** Excellent for **dependency injection** (Layer/Context), **interface contracts**, and **typed error channels**. The error-as-value model removes the "what can this throw" guessing game.
- **When to use:**
  - Service boundaries (database, external APIs, queues) — declare as `Effect.Service` with a typed interface and inject via Layer.
  - Workflows where errors are part of the domain (payments, multi-step transactions).
  - Anywhere you'd otherwise write a janky `Result<T, E>` shim.
- **When NOT to use:**
  - Simple sync utilities, glue code, UI handlers — plain TS is shorter and clearer.
  - Routes that are already trivially typed by Elysia/TanStack Start.
- **Rule of thumb:** if the function would benefit from a typed error union and a swappable implementation, reach for Effect. Otherwise don't.

### Better Auth
- **Scope:** Authentication — sessions, OAuth, email/password, 2FA, organizations.
- **Why:** Framework-agnostic, owns the schema (no vendor lock-in), TypeScript-first, plugin architecture covers most needs (passkeys, magic links, RBAC).
- **Used for:** Any app that needs user accounts.

---

## Native / Desktop

### Electrobun
- **Scope:** Native desktop app shell powered by Bun.
- **Why:** Replacement for Electron — uses the OS webview (no bundled Chromium → tiny binaries), Bun runtime on the main process, native menus and tray. Same web stack, native distribution.
- **Used for:** Desktop builds of the web app.

---

## Schema / Validation

Pick **one** per project and stick with it. Default below.

### TypeBox (default)
- **Scope:** Runtime schema validation with static TS inference, JSON Schema output.
- **Why:**
  - **Native to Elysia** — Elysia's `t` is TypeBox. Using anything else means an extra adapter layer and a second source of truth.
  - **JSON Schema is the output, not an afterthought** — schemas serialize directly to OpenAPI/JSON Schema with zero translation. Free API docs, free client codegen if you ever need it.
  - **Faster validation** — TypeBox compiles validators (via `TypeCompiler`) to straight-line JS; benchmarks consistently beat Zod by an order of magnitude on hot paths.
  - **Smaller runtime, tree-shakeable** — composable `Type.*` builders, no monolithic class hierarchy.
  - **Type inference is structural** — `Static<typeof Schema>` produces clean, readable types (no deeply-wrapped `ZodObject<...>` noise in errors).
- **Used for:** Input validation at every system boundary — Elysia routes, queue payloads, env parsing, form schemas.

### Alternatives considered

- **Zod** — Largest ecosystem, integrates everywhere out of the box. Lose: slower runtime, no native JSON Schema, awkward inside Elysia (requires adapter), uglier inferred types. Reach for it only if a third-party lib hard-requires Zod schemas and adapting is more work than dual-declaring.
- **Valibot** — Tiny bundle, modular like TypeBox. Lose: no JSON Schema story, smaller ecosystem, no Elysia integration. Good fit for client-only bundles where size dominates; not worth fragmenting the stack for.
- **Effect Schema** — Excellent inside Effect-heavy modules (transformations, branded types, decoders compose with `Effect`). Lose: pulls Effect into anything that touches the schema. Acceptable **only** in modules already committed to Effect.
- **ArkType** — Great DX (TS-syntax-as-schema), fast. Lose: ecosystem still maturing, no Elysia parity. Revisit in a year.
- **Yup / Joi** — Legacy. Skip.

**Rule:** TypeBox by default. Effect Schema inside Effect modules. Anything else needs a written reason.

---

## Database

### Drizzle ORM
- **Scope:** SQL query builder + schema definition + migrations. Works with Postgres, MySQL, SQLite (incl. Bun's native SQLite, Turso, Neon, PlanetScale).
- **Why:**
  - **Best-in-class type safety** — query results are inferred from the schema down to nullability and joined column shape. No code generation step, no `prisma generate` dance.
  - **SQL-first, verbose on purpose** — the API mirrors SQL (`select().from().where().leftJoin()`), so what you write is what runs. No hidden N+1s, no magic eager loading, no query-builder lottery.
  - **Performance** — thin wrapper over the driver. Drizzle adds negligible overhead vs raw SQL; benchmarks consistently top the ORM charts. No proxy/engine process like Prisma.
  - **Schema in TypeScript** — tables, indexes, relations, constraints all declared in TS. Single source of truth, diffable, refactor-friendly.
  - **drizzle-kit** — generates migrations from schema diffs, supports introspection of existing DBs, has a Studio GUI.
  - **Pairs with TypeBox/Elysia** — schema → TypeBox via `drizzle-typebox`. End-to-end types from Postgres column to React component, no codegen.
  - **Native Effect support (v1+)** — Drizzle 1.0 ships first-class Effect integration (the `effect-validator` work merged into the 1.0 line), so modules that already commit to Effect can validate at the DB boundary without a third-party adapter.
- **Version:** Drizzle ORM and drizzle-kit are pinned to the **1.0 RC** line. `drizzle({ client })` is the v1 constructor — schema is no longer threaded through the client; pass `relations()` if you use the relational query builder.
- **Used for:** All database access. No raw drivers, no Prisma, no Kysely.

### drizzle-typebox
- **Scope:** Generates TypeBox schemas directly from Drizzle table definitions (`createSelectSchema`, `createInsertSchema`, `createUpdateSchema`).
- **Why:** Closes the type chain. The Drizzle table is already the single source of truth for the database shape — `drizzle-typebox` makes it the source of truth for API validation too. One schema definition flows: **Postgres column → Drizzle table → TypeBox schema → Elysia route validator → Eden client type → React component prop**. No drift, no codegen, no duplicate definitions.
- **Version:** While the Drizzle 1.0 line is in RC, `drizzle-typebox` only publishes prerelease commit-tagged 1.0 betas (no clean RC tag yet). Pin to a specific `1.0.0-beta.N-<sha>` build that pairs with the Drizzle ORM RC; revisit once an RC is cut. The `createSelectSchema`/`createInsertSchema` API is stable across the 1.0 betas.
- **Used for:** Every Elysia route that reads or writes a DB entity. Compose generated schemas with `Type.Pick`/`Type.Omit`/`Type.Partial` rather than redefining shapes by hand.

### Alternatives considered

- **Prisma** — Great DX, but: separate engine binary, slower cold starts, opaque query layer, schema lives in a custom DSL. Drizzle wins on transparency and Bun compatibility.
- **Kysely** — Excellent type-safe query builder, similar philosophy. Lose: no schema/migration story built in, smaller ecosystem around Bun/Elysia.
- **Raw SQL + postgres.js** — Fine for tiny services. Lose: hand-rolled types, no migration tool. Drizzle gives you the same SQL-shape with types for free.

---

## Layering Rules

1. **Server state lives in TanStack Query.** Never duplicate it into local state.
2. **URL state lives in TanStack Router search params.** Filters, tabs, pagination — all in the URL, all typed.
3. **Form state lives in TanStack Form.** Don't reach for `useState` for inputs.
4. **Cross-process boundaries are typed.** Elysia ↔ client via Eden. TanStack Start server functions are typed by definition. No untyped `fetch`.
5. **Effect is opt-in per module.** A package/service either commits to Effect or stays plain TS — don't mix idioms in one file.
6. **UI primitives come from shadcn (Base UI).** Don't import a second component library; extend shadcn instead.

---

## Out of Scope (intentionally not chosen)

- **Next.js** — TanStack Start gives better routing types and a cleaner data model.
- **Radix** — superseded by Base UI for new work.
- **Express/Hono** — Elysia is faster on Bun and has better type inference via Eden.
- **NextAuth/Auth.js** — Better Auth owns its schema and is easier to extend.
- **Electron** — Electrobun is the Bun-native replacement.
- **Redux/Zustand for server data** — TanStack Query covers it.
- **Prisma** — Drizzle gives equal DX with no engine binary, faster runtime, and transparent SQL.
- **Zod (as default)** — TypeBox is native to Elysia and serializes to JSON Schema; Zod stays as a fallback only when a third-party lib forces it.

---

## Future Additions

This list will grow. Anything added must clear the same bar: type-safety end-to-end, minimal glue, and a clear scope that doesn't overlap with what's already here.
