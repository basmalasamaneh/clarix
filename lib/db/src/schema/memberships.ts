import { pgTable, text, primaryKey, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./users";
import { factories } from "./factories";

export const memberships = pgTable("memberships", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  factoryId: text("factory_id").notNull().references(() => factories.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["factory_manager", "analyst", "viewer"] }).notNull(),
  active: boolean("active").notNull().default(true),
  recoveryRequired: boolean("recovery_required").notNull().default(false),
  lastLogin: timestamp("last_login",{withTimezone:true}),
  loginSuccessCount: integer("login_success_count").notNull().default(0),
  loginFailureCount: integer("login_failure_count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.factoryId] })]);
export const insertMembershipSchema = createInsertSchema(memberships);
export type Membership = typeof memberships.$inferSelect;
