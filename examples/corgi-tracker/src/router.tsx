import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Anything dropped into `context` here becomes available to every route
// loader and component via `Route.useRouteContext()`. We only need the
// QueryClient so route components can build their TanStack DB collections
// against the same cache main.tsx provisioned.
export interface RouterContext {
  queryClient: QueryClient;
}

export const router = createRouter({
  routeTree,
  // Preload on link hover/focus — for a tiny SPA like this it's basically free
  // and makes navigation feel instant.
  defaultPreload: "intent",
  // Real value is injected by RouterProvider's `context` prop in main.tsx.
  // The `undefined!` here just satisfies the type at construction time.
  context: { queryClient: undefined! },
  scrollRestoration: true,
});
