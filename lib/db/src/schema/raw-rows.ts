import { pgTable, uuid, text, integer, jsonb, unique, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { imports } from "./imports";

export const rawRows = pgTable("raw_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  factoryId: text("factory_id").notNull(),
  sourceName: text("source_name").notNull(),
  importId: uuid("import_id").notNull(),
  file: text("file").notNull(),
  lineNumber: integer("line_number").notNull(),
  cells: jsonb("cells").notNull(),
}, (t) => [
  unique().on(t.factoryId, t.id),
  unique().on(t.factoryId, t.sourceName, t.id),
  unique().on(t.factoryId, t.importId, t.file, t.lineNumber),
  foreignKey({ columns: [t.factoryId, t.sourceName, t.importId], foreignColumns: [imports.factoryId, imports.sourceName, imports.id] }),
  check("raw_line_positive", sql`${t.lineNumber} > 0`),
]);
export const insertRawRowSchema = createInsertSchema(rawRows);
export type RawRow = typeof rawRows.$inferSelect;
