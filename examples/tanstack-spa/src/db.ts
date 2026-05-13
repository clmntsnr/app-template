import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { QueryClient } from "@tanstack/react-query";

export type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

const seed: Todo[] = [
  { id: 1, title: "Learn TanStack Router", completed: true },
  { id: 2, title: "Try TanStack DB", completed: false },
  { id: 3, title: "Wire up TanStack Query", completed: false },
];

let store: Todo[] = [...seed];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const api = {
  list: async () => {
    await delay(150);
    return [...store];
  },
  create: async (todo: Todo) => {
    await delay(150);
    store = [...store, todo];
  },
  update: async (todo: Todo) => {
    await delay(150);
    store = store.map((t) => (t.id === todo.id ? todo : t));
  },
  remove: async (id: number) => {
    await delay(150);
    store = store.filter((t) => t.id !== id);
  },
};

export const todoCollection = (queryClient: QueryClient) =>
  createCollection(
    queryCollectionOptions<Todo>({
      id: "todos",
      queryKey: ["todos"],
      queryFn: api.list,
      queryClient,
      getKey: (todo) => todo.id,
      onInsert: async ({ transaction }) => {
        for (const m of transaction.mutations) await api.create(m.modified);
      },
      onUpdate: async ({ transaction }) => {
        for (const m of transaction.mutations) await api.update(m.modified);
      },
      onDelete: async ({ transaction }) => {
        for (const m of transaction.mutations) await api.remove(m.original.id);
      },
    }),
  );
