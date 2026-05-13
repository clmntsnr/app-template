import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { RouterContext } from "../router";

// Root route owns the layout shell (nav + main + devtools). All page routes
// render inside `<Outlet />`. `createRootRouteWithContext` lets us thread
// the typed RouterContext (queryClient) into every child loader/component.
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="mx-auto flex max-w-4xl items-center gap-4 p-4">
          <span className="mr-2 text-xl">🐕</span>
          <Link
            to="/"
            className="font-semibold [&.active]:underline"
            activeOptions={{ exact: true }}
          >
            Home
          </Link>
          <Link to="/trends" className="font-semibold [&.active]:underline">
            Trends
          </Link>
          <Link to="/log" className="font-semibold [&.active]:underline">
            Log
          </Link>
          <Link to="/profile" className="font-semibold [&.active]:underline">
            Profile
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl p-6">
        <Outlet />
      </main>
      <TanStackRouterDevtools position="bottom-right" />
      <ReactQueryDevtools buttonPosition="bottom-left" />
    </div>
  );
}
