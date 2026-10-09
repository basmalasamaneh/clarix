import { pool } from "@workspace/db";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { assertSeedAllowed } from "../lib/permissions";
import { logger } from "../lib/logger";

assertSeedAllowed();
// Isolated schema: never delete or modify the application's existing accounts.
const schema = `seed_check_${process.pid}`;
const client = await pool.connect();
try {
  await client.query(`CREATE ROLE ${schema} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
  await client.query(`GRANT ${schema} TO CURRENT_USER`);
  await client.query(`GRANT clarix_runtime, clarix_identity TO ${schema}`);
  await client.query(`CREATE SCHEMA ${schema} AUTHORIZATION ${schema}`);
  await client.query(`GRANT USAGE ON SCHEMA ${schema} TO clarix_runtime, clarix_identity`);
  for (const table of ["users", "factories", "memberships", "sessions"]) {
    await client.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
    await client.query(`ALTER TABLE ${schema}.${table} OWNER TO ${schema}`);
  }
  await client.query(`SET search_path TO ${schema}`);
  await client.query(await readFile(new URL("../../../../lib/db/foundation-rls.sql", import.meta.url), "utf8"));
  await client.query("RESET search_path");

  const env = { ...process.env, PGOPTIONS: `-c role=${schema} -c search_path=${schema}`, EXPECT_NON_BYPASS_OWNER: "true", LOG_LEVEL: "silent" };
  // No connection strings or passwords are emitted or persisted.
  for (const script of ["seed:test", "test:foundation"]) {
    const result = spawnSync("pnpm", ["run", script], { env, stdio: "inherit" });
    if (result.status !== 0) throw new Error(`Clean restricted-owner ${script} failed`);
  }
  const state = await client.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND relname IN ('factories','memberships')", [schema]);
  if (state.rows.length !== 2 || state.rows.some((r) => !r.relrowsecurity || !r.relforcerowsecurity)) {
    throw new Error("Seed failed to preserve forced RLS");
  }
  logger.info("Clean non-bypass-owner seed, all five logins, and forced RLS verified");
} finally {
  await client.query("RESET search_path");
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  // RLS setup grants schema usage; drop only this temporary verification role's grants.
  await client.query(`DROP OWNED BY ${schema}`);
  await client.query(`DROP ROLE IF EXISTS ${schema}`);
  client.release();
  await pool.end();
}
