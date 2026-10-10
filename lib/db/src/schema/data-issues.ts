import { pgTable, uuid, text, index, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { orders } from "./orders";
import { imports } from "./imports";

export const dataIssues = pgTable("data_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  factoryId: text("factory_id").notNull(),
  importId: uuid("import_id").notNull(),
  code: text("code").notNull(),
  severity: text("severity").notNull(),
  orderId: uuid("order_id"),
  sourceOrderId: text("source_order_id"),
  group: text("group").notNull(),
  rawRowIds: uuid("raw_row_ids").array().notNull().default(sql`'{}'::uuid[]`),
  status: text("status").notNull().default("new"),
  note: text("note"),
}, (t) => [
  index().on(t.factoryId, t.importId),
  index().on(t.factoryId, t.orderId),
  index().on(t.factoryId, t.status, t.severity),
  foreignKey({ columns: [t.factoryId, t.importId], foreignColumns: [imports.factoryId, imports.id] }),
  foreignKey({ columns: [t.factoryId, t.orderId], foreignColumns: [orders.factoryId, orders.id] }),
  check("issue_severity_valid", sql`${t.severity} IN ('info','warning','error')`),
  check("issue_status_valid", sql`${t.status} IN ('new','reviewed','accepted-with-note')`),
]);
export const insertDataIssueSchema = createInsertSchema(dataIssues);
export type DataIssue = typeof dataIssues.$inferSelect;
