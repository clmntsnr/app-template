import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@package-ui/shadcn/components/button";
import { Checkbox } from "@package-ui/shadcn/components/checkbox";
import { Input } from "@package-ui/shadcn/components/input";
import { todoCollection } from "../db";

export const Route = createFileRoute("/todos")({
  component: TodosComponent,
});

function TodosComponent() {
  const { queryClient } = Route.useRouteContext();
  const collection = useMemo(() => todoCollection(queryClient), [queryClient]);
  const { data: todos = [] } = useLiveQuery((q) =>
    q.from({ todo: collection }).orderBy(({ todo }) => todo.id),
  );

  const [draft, setDraft] = useState("");

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    collection.insert({ id: Date.now(), title, completed: false });
    setDraft("");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Todos</h2>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="What needs doing?"
        />
        <Button onClick={add}>Add</Button>
      </div>
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-3 rounded border p-3">
            <Checkbox
              checked={todo.completed}
              onCheckedChange={(checked) =>
                collection.update(todo.id, (draft) => {
                  draft.completed = checked === true;
                })
              }
            />
            <span
              className={
                todo.completed ? "flex-1 text-muted-foreground line-through" : "flex-1"
              }
            >
              {todo.title}
            </span>
            <Button variant="ghost" size="sm" onClick={() => collection.delete(todo.id)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
