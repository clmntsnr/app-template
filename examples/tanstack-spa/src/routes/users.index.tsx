import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";

type User = { id: number; name: string; email: string };

const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: async (): Promise<User[]> => {
    const res = await fetch("https://jsonplaceholder.typicode.com/users");
    if (!res.ok) throw new Error("Failed to load users");
    return res.json();
  },
});

export const Route = createFileRoute("/users/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(usersQuery),
  component: UsersComponent,
});

function UsersComponent() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Users</h2>
      <p className="text-sm text-muted-foreground">
        Loaded via the route loader → preloaded on link hover.
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <UserList />
      </Suspense>
    </div>
  );
}

function UserList() {
  const { data } = useSuspenseQuery(usersQuery);
  return (
    <ul className="space-y-2">
      {data.map((u) => (
        <li key={u.id}>
          <Link
            to="/users/$id"
            params={{ id: String(u.id) }}
            className="block rounded border p-3 hover:bg-accent"
          >
            <div className="font-medium">{u.name}</div>
            <div className="text-sm text-muted-foreground">{u.email}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
