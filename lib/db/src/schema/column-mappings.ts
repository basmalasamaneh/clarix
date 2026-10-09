import { pgTable, uuid, text, integer, jsonb, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { factories } from "./factories";

export const columnMappings = pgTable("column_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  factoryId: text("factory_id").notNull().references(() => factories.id),
  sourceName: text("source_name").notNull(),
  version: integer("version").notNull(),
  mapping: jsonb("mapping").notNull(),
}, (t) => [
  unique().on(t.factoryId, t.sourceName, t.version),
  unique().on(t.factoryId, t.sourceName, t.id),
  check("mapping_version_positive", sql`${t.version} > 0`),
]);
export const insertColumnMappingSchema = createInsertSchema(columnMappings);
export type ColumnMapping = typeof columnMappings.$inferSelect;
