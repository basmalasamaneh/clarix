import {pgTable,text,boolean,jsonb,timestamp,integer,bigint,uuid,index,foreignKey} from "drizzle-orm/pg-core";
import {memberships} from "./memberships";
import {users} from "./users";
import {factories} from "./factories";
export const accountSecurity=pgTable("account_security",{
 userId:text("user_id").primaryKey().references(()=>users.id),
 secret:text("secret"),pendingSecret:text("pending_secret"),pendingUntil:timestamp("pending_until",{withTimezone:true}),
 pendingConfirmed:boolean("pending_confirmed").notNull().default(false),pendingStep:bigint("pending_step",{mode:"number"}),enabled:boolean("enabled").notNull().default(false),
 recoveryHashes:jsonb("recovery_hashes").notNull().default([]),pendingHashes:jsonb("pending_hashes").notNull().default([]),
 recoveryKeyHash:text("recovery_key_hash").unique(),lastStep:bigint("last_step",{mode:"number"}).notNull().default(-1),
 lastSignIn:timestamp("last_sign_in",{withTimezone:true}),
});
export const passwordResets=pgTable("password_resets",{
 id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull().references(()=>factories.id),
 userId:text("user_id").notNull().references(()=>users.id),issuedBy:text("issued_by").notNull().references(()=>users.id),
 tokenHash:text("token_hash").notNull().unique(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),revokedAt:timestamp("revoked_at",{withTimezone:true}),
 completedAt:timestamp("completed_at",{withTimezone:true}),
},t=>[index("reset_factory_user").on(t.factoryId,t.userId,t.createdAt),foreignKey({columns:[t.factoryId,t.userId],foreignColumns:[memberships.factoryId,memberships.userId],name:"password_resets_factory_id_user_id_fkey"})]);
export const securityAudit=pgTable("security_audit",{
 id:uuid("id").primaryKey(),userId:text("user_id").notNull().references(()=>users.id),action:text("action").notNull(),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("security_audit_user_date").on(t.userId,t.createdAt)]);
export const securityLimits=pgTable("security_limits",{
 key:text("key").primaryKey(),hits:integer("hits").notNull(),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
});
export const revokedSessions=pgTable("revoked_sessions",{
 id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>users.id),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("revoked_sessions_user").on(t.userId)]);
