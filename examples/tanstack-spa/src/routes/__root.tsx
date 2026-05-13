import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { RouterContext } from "../router";
import { useEffect } from "react";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import("react-grab");
    }
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="mx-auto flex max-w-3xl items-center gap-4 p-4">
          <Link to="/" className="font-semibold [&.active]:underline">
            Home
          </Link>
          <Link to="/todos" className="font-semibold [&.active]:underline">
            Todos
          </Link>
          <Link to="/users" className="font-semibold [&.active]:underline">
            Users
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl p-6">
        <Outlet />
      </main>
      <TanStackRouterDevtools position="bottom-right" />
      <ReactQueryDevtools buttonPosition="bottom-left" />
    </div>
  );
}
