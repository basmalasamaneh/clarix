import { pgTable, uuid, text, jsonb, timestamp, unique, uniqueIndex, integer, boolean, index, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { factories } from "./factories";
import { users } from "./users";
import { columnMappings } from "./column-mappings";

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  factoryId: text("factory_id").notNull().references(() => factories.id),
  sourceName: text("source_name").notNull(),
  fileNames: jsonb("file_names").$type<string[]>().notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("draft"),
  files: jsonb("files").notNull().default([]),
  mapping: jsonb("mapping"),
  result: jsonb("result"),
  counts: jsonb("counts"),
  progress: integer("progress").notNull().default(0),
  finalized: boolean("finalized").notNull().default(false),
  approvedAt: timestamp("approved_at", { mode:"string" }),
  uploadedBy: text("uploaded_by").notNull().references(() => users.id),
  mappingId: uuid("mapping_id"),
  createdAt: timestamp("created_at", { withTimezone: false, mode: "string" }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.factoryId, t.id),
  unique().on(t.factoryId, t.sourceName, t.id),
  uniqueIndex("imports_approved_hash_unique").on(t.factoryId,t.contentHash).where(sql`${t.status} = 'approved'`),
  index().on(t.factoryId, t.status, t.createdAt),
  foreignKey({ columns: [t.factoryId, t.sourceName, t.mappingId], foreignColumns: [columnMappings.factoryId, columnMappings.sourceName, columnMappings.id] }),
]);
export const insertImportSchema = createInsertSchema(imports);
export type Import = typeof imports.$inferSelect;
