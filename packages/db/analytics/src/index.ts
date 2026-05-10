import { createDb, type DrizzleClient } from "@package-core/db";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL_ANALYTICS ?? "postgres://localhost:5432/analytics";

export const db = createDb(connectionString);
export type AnalyticsDb = DrizzleClient;
export { schema };
