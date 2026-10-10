import { pgTable, uuid, text, jsonb, timestamp, index, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders } from "./orders";
import { imports } from "./imports";
import { rawRows } from "./raw-rows";

// Separate append-only tables preserve the original canonical source ID keys.
// Payload is the original canonical row, not a replacement or recomputation.
function history(name:string) {
  return pgTable(name,{
    id:uuid("id").primaryKey().defaultRandom(),
    factoryId:text("factory_id").notNull(),
    sourceName:text("source_name").notNull(),
    sourceId:text("source_id").notNull(),
    orderId:uuid("order_id").notNull(),
    originalImportId:uuid("original_import_id").notNull(),
    rawRowId:uuid("raw_row_id"),
    supersededByImportId:uuid("superseded_by_import_id").notNull(),
    supersededAt:timestamp("superseded_at",{mode:"string"}).notNull().defaultNow(),
    status:text("status").notNull().default("superseded"),
    payload:jsonb("payload").notNull(),
  },t=>[
    index().on(t.factoryId,t.sourceName,t.sourceId),
    index().on(t.factoryId,t.orderId,t.supersededAt),
    index().on(t.factoryId,t.supersededByImportId),
    index().on(t.factoryId,t.originalImportId),
    foreignKey({columns:[t.factoryId,t.sourceName,t.orderId],foreignColumns:[orders.factoryId,orders.sourceName,orders.id]}),
    foreignKey({columns:[t.factoryId,t.sourceName,t.originalImportId],foreignColumns:[imports.factoryId,imports.sourceName,imports.id]}),
    foreignKey({columns:[t.factoryId,t.sourceName,t.supersededByImportId],foreignColumns:[imports.factoryId,imports.sourceName,imports.id]}),
    foreignKey({columns:[t.factoryId,t.originalImportId,t.rawRowId],foreignColumns:[rawRows.factoryId,rawRows.importId,rawRows.id]}),
    check(`${name}_superseded`,sql`${t.status} = 'superseded'`),
  ]);
}
export const ordersHistory=history("orders_history");
export const productionRecordsHistory=history("production_records_history");
export const eventsHistory=history("events_history");
