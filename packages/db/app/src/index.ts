import { createDb, type DrizzleClient } from "@package-core/db";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL_APP ?? "postgres://localhost:5432/app";

export const db = createDb(connectionString, schema);
export type AppDb = DrizzleClient<typeof schema>;
export { schema };
