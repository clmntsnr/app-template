import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";

type User = { id: number; name: string; email: string; company: { name: string } };

const userQuery = (id: string) =>
  queryOptions({
    queryKey: ["user", id],
    queryFn: async (): Promise<User> => {
      const res = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`);
      if (!res.ok) throw new Error("Failed to load user");
      return res.json();
    },
  });

export const Route = createFileRoute("/users/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(userQuery(params.id)),
  component: UserComponent,
});

function UserComponent() {
  const { id } = Route.useParams();
  return (
    <div className="space-y-4">
      <Link to="/users" className="text-sm underline">
        ← Back to users
      </Link>
      <Suspense fallback={<p>Loading…</p>}>
        <UserDetail id={id} />
      </Suspense>
    </div>
  );
}

function UserDetail({ id }: { id: string }) {
  const { data: user } = useSuspenseQuery(userQuery(id));
  return (
    <div className="rounded border p-4">
      <h2 className="text-2xl font-bold">{user.name}</h2>
      <p className="text-muted-foreground">{user.email}</p>
      <p className="text-sm">Works at {user.company.name}</p>
    </div>
  );
}
