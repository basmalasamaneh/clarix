import {pgTable,uuid,text,jsonb,timestamp,index,unique,foreignKey} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {factories} from "./factories";
import {users} from "./users";
import {rawRows} from "./raw-rows";
export const analysisSnapshots=pgTable("analysis_snapshots",{
  id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull().references(()=>factories.id),
  createdBy:text("created_by").notNull().references(()=>users.id),author:text("author").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  title:text("title").notNull(),note:text("note").notNull(),orderSearch:text("order_search").notNull(),
  payload:jsonb("payload").notNull(),provenance:jsonb("provenance").notNull(),definitionsVersion:text("definitions_version").notNull(),
},t=>[unique().on(t.factoryId,t.id),index().on(t.factoryId,t.createdAt),index().on(t.factoryId,t.orderSearch)]);
export const reconciliations=pgTable("reconciliations",{
  id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull(),snapshotId:uuid("snapshot_id").notNull(),
  createdBy:text("created_by").notNull().references(()=>users.id),author:text("author").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),payload:jsonb("payload").notNull(),
},t=>[foreignKey({columns:[t.factoryId,t.snapshotId],foreignColumns:[analysisSnapshots.factoryId,analysisSnapshots.id]}),
  index().on(t.factoryId,t.snapshotId,t.createdAt)]);
export const sourceRowLinks=pgTable("source_row_links",{
  id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull(),snapshotId:uuid("snapshot_id").notNull(),
  importId:uuid("import_id").notNull(),rawRowId:uuid("raw_row_id").notNull(),refs:jsonb("refs").notNull(),
},t=>[foreignKey({columns:[t.factoryId,t.snapshotId],foreignColumns:[analysisSnapshots.factoryId,analysisSnapshots.id]}),
  foreignKey({columns:[t.factoryId,t.importId,t.rawRowId],foreignColumns:[rawRows.factoryId,rawRows.importId,rawRows.id]}),
  index().on(t.factoryId,t.snapshotId),index().on(t.factoryId,t.importId,t.rawRowId)]);
export const snapshotAudit=pgTable("snapshot_audit",{
  id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull(),snapshotId:uuid("snapshot_id").notNull(),
  actorId:text("actor_id").notNull().references(()=>users.id),action:text("action").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[foreignKey({columns:[t.factoryId,t.snapshotId],foreignColumns:[analysisSnapshots.factoryId,analysisSnapshots.id]}),
  index().on(t.factoryId,t.snapshotId,t.createdAt)]);
export const insertAnalysisSnapshotSchema=createInsertSchema(analysisSnapshots);
export const insertReconciliationSchema=createInsertSchema(reconciliations);
export const insertSourceRowLinkSchema=createInsertSchema(sourceRowLinks);
export const insertSnapshotAuditSchema=createInsertSchema(snapshotAudit);
