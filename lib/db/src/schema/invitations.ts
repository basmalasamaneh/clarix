import {pgTable,uuid,text,timestamp,index,uniqueIndex} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {createInsertSchema} from "drizzle-zod";
import {users} from "./users";
import {factories} from "./factories";
export const invitations=pgTable("invitations",{
  id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull().references(()=>factories.id),
  email:text("email").notNull(),role:text("role").notNull(),tokenHash:text("token_hash").notNull().unique(),
  // Null is reserved for the once-only deployment invitation: no fake user.
  createdBy:text("created_by").references(()=>users.id),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
  revokedAt:timestamp("revoked_at",{withTimezone:true}),acceptedAt:timestamp("accepted_at",{withTimezone:true}),
},t=>[
  index("invitations_factory_pending").on(t.factoryId,t.createdAt).where(sql`${t.revokedAt} IS NULL AND ${t.acceptedAt} IS NULL`),
  uniqueIndex("invitations_pending_email").on(t.factoryId,t.email).where(sql`${t.revokedAt} IS NULL AND ${t.acceptedAt} IS NULL`),
]);
export const insertInvitationSchema=createInsertSchema(invitations);
export type Invitation=typeof invitations.$inferSelect;
