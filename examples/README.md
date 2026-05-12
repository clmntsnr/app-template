# Examples

Small, heavily-commented sample apps that exercise one (or a few) of this template's packages and dependencies in isolation. Not production code — these are reference implementations and prototypes that live in the repo.

---

## Why this directory exists

The top-level layout splits intent:

| Directory   | Intent                                                                  |
| ----------- | ----------------------------------------------------------------------- |
| `apps/`     | Real applications shipped from this template.                           |
| `packages/` | Reusable code consumed by `apps/` and `examples/`.                      |
| `docs/`     | Prose: best practices, architecture, decisions.                         |
| `tests/`    | Cross-package / integration test suites.                                |
| `examples/` | **Minimal, focused sample apps** that show how packages and libs work.  |

`apps/` is for things we ship. `examples/` is for everything else we build along the way: documentation-by-code, scratch space for upcoming features, and tightly-scoped reference implementations we can clone or read when wiring something new.

## What an example is

Each example is its own workspace under `examples/<name>/` with:

- A clear, narrow scope — usually one library (e.g. TanStack DB) or one integration (e.g. Router + Query + DB together).
- **Maximally commented source code.** Comments explain *why* a pattern is used, not what the line does. Treat the source as the documentation.
- A short `README.md` covering: what it demonstrates, what to look at first, and any non-obvious setup.
- Real dependencies via the root `package.json` catalogs and `workspace:*` for in-repo packages — examples consume the same versions as `apps/`, so what works here works there.

## What examples are good for

- **Documentation-by-code.** A working, type-checked, runnable answer to "how do I use package X?" — far more honest than a snippet in a README that drifts out of sync.
- **Building along.** When adopting a new library or designing a new package, scaffold an example first. It forces the API to feel right in isolation before it lands in `apps/`.
- **Prototyping upcoming features.** Try the shape of a feature against a stripped-down setup before integrating into a real app, where unrelated complexity hides design problems.
- **Experimentation.** Compare two approaches side-by-side without polluting `apps/` history.
- **Onboarding & internal reference.** New contributors (and future-us) can read one focused example instead of reverse-engineering a full app.

## What examples are *not*

- Not production. No auth-hardening, observability, error reporting, or deploy config unless that's the thing being demonstrated.
- Not load-bearing. Anything in `apps/` may not import from `examples/`. Examples consume packages, never the other way around.
- Not a dumping ground. If an example outgrows its scope, split it. A good example fits in one sitting of reading.

## Conventions

- **Naming:** `examples/<library-or-feature>-<form>` — e.g. `tanstack-spa`, `auth-flow`, `db-migrations`. Short and descriptive.
- **Scope:** Prefer many small examples over one mega-example. If you need to demo five libraries together, that's its own example — don't add a sixth concern to an existing one.
- **Comments:** Lean into them here. In `apps/` and `packages/` we keep comments minimal; in `examples/` they are the deliverable. Explain trade-offs, link to docs, flag gotchas.
- **Workspace integration:** Examples live under `examples/*` in the root `workspaces.packages` glob and use the same catalog versions as the rest of the monorepo. They run on whatever ports avoid collisions with `apps/web` (5173) and `apps/api`.
- **Lifecycle:** Examples can be deleted. If a library is replaced or a pattern superseded, prune the example — stale examples mislead.

## Current examples

- [`tanstack-spa`](./tanstack-spa) — Client-side SPA combining TanStack Router (file-based, typed context, loaders), TanStack Query (Suspense + route prefetch), and TanStack DB (reactive collection with optimistic mutations) on top of `@package-ui/shadcn`.
- [`corgi-tracker`](./corgi-tracker) — Same stack as `tanstack-spa`, plus localStorage-backed persistence, a singleton "profile" collection, and recharts charts via shadcn's `chart` component.

## Adding a new example

1. Create `examples/<name>/` with a `package.json` (`"private": true`, `"name": "example-<name>"`).
2. Pull deps from catalogs and workspace packages — never hard-pin versions locally.
3. Extend `@package-config/typescript/react.json` (or `bun.json`) for `tsconfig.json`.
4. Write a top-of-file comment in each non-trivial source file describing what it shows and which library concept it exercises.
5. Add a `README.md` and link it from the **Current examples** list above.
6. Run `bun install` from the repo root.
