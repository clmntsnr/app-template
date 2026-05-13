import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">TanStack SPA Example</h1>
      <p className="text-muted-foreground">
        A client-side SPA showcasing TanStack Router (file-based routing), TanStack Query
        (server state), and TanStack DB (reactive client store with optimistic mutations).
      </p>
      <ul className="list-disc space-y-1 pl-6 text-sm">
        <li>
          <strong>/todos</strong> — TanStack DB collection backed by TanStack Query, with
          optimistic create / update / delete.
        </li>
        <li>
          <strong>/users/:id</strong> — Dynamic route with a Query loader.
        </li>
      </ul>
    </div>
  );
}
