import { pgTable, uuid, text, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { factories } from "./factories";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  factoryId: text("factory_id").notNull().references(() => factories.id),
  sourceName: text("source_name").notNull(),
  sourceOrderId: text("source_order_id").notNull(),
  product: text("product"),
  line: text("line"),
  machine: text("machine"),
  mold: text("mold"),
}, (t) => [
  unique().on(t.factoryId, t.sourceName, t.sourceOrderId),
  unique().on(t.factoryId, t.sourceName, t.id),
  unique().on(t.factoryId, t.id),
  index().on(t.factoryId, t.machine),
  index().on(t.factoryId, t.mold),
  index().on(t.factoryId, t.line),
]);
export const insertOrderSchema = createInsertSchema(orders);
export type Order = typeof orders.$inferSelect;
