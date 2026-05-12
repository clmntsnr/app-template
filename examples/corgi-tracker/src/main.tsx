// Bootstraps the SPA. We mirror the tanstack-spa example: one QueryClient,
// one Router, and Strict Mode so any side-effecting hook misuse surfaces in dev.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router";
import "./styles.css";

const queryClient = new QueryClient();

// Tell the Router about its concrete instance type so `Link to` / route
// params get full inference across the app.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
    </QueryClientProvider>
  </StrictMode>,
);
