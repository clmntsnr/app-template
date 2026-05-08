import { schema as analyticsSchema } from "@package-db/analytics";
import { schema as appSchema } from "@package-db/app";
import { createInsertSchema, createSelectSchema } from "drizzle-typebox";

export const UserSelectSchema = createSelectSchema(appSchema.users);
export const UserInsertSchema = createInsertSchema(appSchema.users);

export const EventSelectSchema = createSelectSchema(analyticsSchema.events);
export const EventInsertSchema = createInsertSchema(analyticsSchema.events);

export type { Static } from "@sinclair/typebox";
export { Type } from "@sinclair/typebox";
