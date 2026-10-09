import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

// connect-pg-simple's schema; migrations, never server startup, create this table.
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => [index("sessions_expire_idx").on(t.expire)]);
