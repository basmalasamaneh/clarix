import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const factories = pgTable("factories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  defaultLanguage: text("default_language").notNull().default("ar"),
  settings: jsonb("settings").notNull().default({ timeZone: "Asia/Hebron" }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at",{withTimezone:true}),
  lastApprovedAt: timestamp("last_approved_at",{withTimezone:true}),
});
export const insertFactorySchema = createInsertSchema(factories);
export type Factory = typeof factories.$inferSelect;
