// Development/setup only. Application modules must never import this entry point.
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import * as schema from "./schema";
if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")
  throw new Error("Privileged database entry point is development/setup only");
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
export const db=drizzle(pool,{schema});
