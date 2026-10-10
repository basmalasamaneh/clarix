import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(0),
  platformAdmin: boolean("platform_admin").notNull().default(false),
  language: text("language").notNull().default("en"),
  theme: text("theme").notNull().default("system"),
  tourCompleted: boolean("tour_completed").notNull().default(false),
  testAccount: boolean("test_account").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertUserSchema = createInsertSchema(users);
export type User = typeof users.$inferSelect;
