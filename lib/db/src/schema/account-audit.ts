import {pgTable,uuid,text,timestamp,integer,index} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {users} from "./users";
import {factories} from "./factories";
export const accountAudit=pgTable("account_audit",{
  id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull().references(()=>factories.id),
  actorId:text("actor_id").references(()=>users.id),subjectId:text("subject_id").references(()=>users.id),
  action:text("action").notNull(),role:text("role"),eventCount:integer("event_count").notNull().default(1),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("account_audit_factory_date").on(t.factoryId,t.createdAt)]);
export const insertAccountAuditSchema=createInsertSchema(accountAudit);
export type AccountAudit=typeof accountAudit.$inferSelect;
