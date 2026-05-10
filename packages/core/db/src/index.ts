import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle({ client });
}

export type DrizzleClient = ReturnType<typeof createDb>;

export * as orm from "drizzle-orm";
export * as pg from "drizzle-orm/pg-core";
