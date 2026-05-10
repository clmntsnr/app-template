import { Elysia, t } from "elysia";

export const app = new Elysia()
  .get("/", () => ({ message: "Hello from Elysia" }))
  .get("/hello/:name", ({ params }) => ({ message: `Hello, ${params.name}!` }), {
    params: t.Object({ name: t.String() }),
  })
  .listen(3001);

export type App = typeof app;

console.log(`API running at http://${app.server?.hostname}:${app.server?.port}`);
