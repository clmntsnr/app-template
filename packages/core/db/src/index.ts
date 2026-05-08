import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type Schema = Record<string, unknown>;

export function createDb<S extends Schema>(connectionString: string, schema: S) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type DrizzleClient<S extends Schema> = ReturnType<typeof createDb<S>>;

export * as orm from "drizzle-orm";
export * as pg from "drizzle-orm/pg-core";
