import { pgTable, uuid, text, date, numeric, unique, index, foreignKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { orders } from "./orders";
import { rawRows } from "./raw-rows";

export const productionRecords = pgTable("production_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  factoryId: text("factory_id").notNull(),
  sourceName: text("source_name").notNull(),
  recordId: text("record_id").notNull(),
  orderId: uuid("order_id").notNull(),
  shift: text("shift"),
  date: date("date", { mode: "string" }),
  input: numeric("input"),
  good: numeric("good"),
  scrap: numeric("scrap"),
  unit: text("unit"),
  rawRowId: uuid("raw_row_id").notNull(),
}, (t) => [
  unique().on(t.factoryId, t.sourceName, t.recordId),
  index().on(t.factoryId, t.orderId),
  index().on(t.factoryId, t.shift, t.date),
  index().on(t.factoryId, t.date),
  index().on(t.factoryId, t.rawRowId),
  foreignKey({ columns: [t.factoryId, t.sourceName, t.orderId], foreignColumns: [orders.factoryId, orders.sourceName, orders.id] }),
  foreignKey({ columns: [t.factoryId, t.sourceName, t.rawRowId], foreignColumns: [rawRows.factoryId, rawRows.sourceName, rawRows.id] }),
]);
export const insertProductionRecordSchema = createInsertSchema(productionRecords);
export type ProductionRecord = typeof productionRecords.$inferSelect;
