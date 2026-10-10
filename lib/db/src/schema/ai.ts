import {pgTable,text,jsonb,timestamp,uuid,index,integer} from "drizzle-orm/pg-core";
import {factories} from "./factories";
import {users} from "./users";
export const aiState=pgTable("ai_state",{
 factoryId:text("factory_id").primaryKey().references(()=>factories.id),
 state:jsonb("state").notNull().default({}),
});
export const aiUsage=pgTable("ai_usage",{
 id:uuid("id").primaryKey(),factoryId:text("factory_id").notNull().references(()=>factories.id),
 actorId:text("actor_id").notNull().references(()=>users.id),
 task:text("task").notNull(),status:text("status").notNull(),model:text("model").notNull(),
 latency:integer("latency").notNull(),tokens:integer("tokens"),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index().on(t.factoryId,t.createdAt),index().on(t.factoryId,t.actorId,t.createdAt)]);
