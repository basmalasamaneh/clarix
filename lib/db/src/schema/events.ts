import { pgTable, uuid, text, timestamp, numeric, unique, index, foreignKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { orders } from "./orders";
import { rawRows } from "./raw-rows";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  factoryId: text("factory_id").notNull(),
  sourceName: text("source_name").notNull(),
  eventId: text("event_id").notNull(),
  orderId: uuid("order_id").notNull(),
  eventCode: text("event_code"),
  type: text("type"),
  start: timestamp("start", { withTimezone: false, mode: "string" }),
  end: timestamp("end", { withTimezone: false, mode: "string" }),
  durationMin: numeric("duration_min"),
  reason: text("reason"),
  rawRowId: uuid("raw_row_id").notNull(),
}, (t) => [
  unique().on(t.factoryId, t.sourceName, t.eventId),
  index().on(t.factoryId, t.orderId, t.start),
  index().on(t.factoryId, t.start),
  index().on(t.factoryId, t.rawRowId),
  foreignKey({ columns: [t.factoryId, t.sourceName, t.orderId], foreignColumns: [orders.factoryId, orders.sourceName, orders.id] }),
  foreignKey({ columns: [t.factoryId, t.sourceName, t.rawRowId], foreignColumns: [rawRows.factoryId, rawRows.sourceName, rawRows.id] }),
]);
export const insertEventSchema = createInsertSchema(events);
export type Event = typeof events.$inferSelect;
