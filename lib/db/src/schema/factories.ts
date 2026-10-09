import { pgTable, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const factories = pgTable("factories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  defaultLanguage: text("default_language").notNull().default("ar"),
  settings: jsonb("settings").notNull().default({ timeZone: "Asia/Hebron" }),
  status: text("status").notNull().default("active"),
});
export const insertFactorySchema = createInsertSchema(factories);
export type Factory = typeof factories.$inferSelect;
