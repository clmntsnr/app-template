import { treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";

export const createClient = <App extends Elysia<any, any, any, any, any, any, any>>(
  baseUrl: string,
) => treaty<App>(baseUrl);
