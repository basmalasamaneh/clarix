import {pgTable,uuid,text,timestamp,jsonb,index} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {factories} from "./factories";
import {users} from "./users";
export const platformAudit=pgTable("platform_audit",{
  id:uuid("id").primaryKey(),factoryId:text("factory_id").references(()=>factories.id),
  actorId:text("actor_id").references(()=>users.id),action:text("action").notNull(),
  oldValue:jsonb("old_value"),newValue:jsonb("new_value"),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("platform_audit_factory_created").on(t.factoryId,t.createdAt)]);
export const factorySettingsAudit=pgTable("factory_settings_audit",{
  id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull().references(()=>factories.id),
  actorId:text("actor_id").notNull().references(()=>users.id),action:text("action").notNull(),
  oldValue:jsonb("old_value"),newValue:jsonb("new_value"),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("factory_settings_audit_factory_created").on(t.factoryId,t.createdAt)]);
export const platformInvitations=pgTable("platform_invitations",{
  id:uuid("id").primaryKey(),email:text("email").notNull(),
  tokenHash:text("token_hash").notNull().unique(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
  acceptedAt:timestamp("accepted_at",{withTimezone:true}),
});
export const insertPlatformAuditSchema=createInsertSchema(platformAudit);
export const insertFactorySettingsAuditSchema=createInsertSchema(factorySettingsAudit);
export const insertPlatformInvitationSchema=createInsertSchema(platformInvitations);
