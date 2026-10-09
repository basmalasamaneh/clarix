import { pgTable, text, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./users";
import { factories } from "./factories";

export const memberships = pgTable("memberships", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  factoryId: text("factory_id").notNull().references(() => factories.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["factory_manager", "analyst", "viewer"] }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.factoryId] })]);
export const insertMembershipSchema = createInsertSchema(memberships);
export type Membership = typeof memberships.$inferSelect;
