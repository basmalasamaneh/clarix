import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import {runtimeConfig} from "./runtime-config";
export {runtimeConfig} from "./runtime-config";

const { Pool } = pg;
if(process.env.NODE_TEST_CONTEXT && !/^clarix_test_[a-f0-9]+$/.test(process.env.CLARIX_TEST_SCHEMA??""))
  throw new Error("Database tests require the isolated pnpm test runner");
if(process.env.CLARIX_TEST_SCHEMA &&
  (!/^clarix_test_[a-f0-9]+$/.test(process.env.CLARIX_TEST_SCHEMA) ||
   process.env.NODE_ENV==="production" || process.env.REPLIT_DEPLOYMENT==="1" ||
   !process.env.PGOPTIONS?.includes(`search_path=${process.env.CLARIX_TEST_SCHEMA}`)))
  throw new Error("Invalid isolated test database configuration");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool(runtimeConfig());
export const db = drizzle(pool, { schema });

export * from "./schema";
