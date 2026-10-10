import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
/** Explicit privileged migration, never imported by application startup. */
export async function prepareProductionSchema(c:PoolClient){
  const role=(await c.query("SELECT rolsuper OR rolbypassrls AS allowed FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(!role?.allowed)throw new Error("Production setup requires a privileged connection");
  const base=new URL("../../../../lib/db/",import.meta.url);
  const initial=await readFile(new URL("drizzle/0000_production-foundation.sql",base),"utf8");
  const hash=createHash("sha256").update(initial).digest("hex");
  await c.query("BEGIN");
  try{
    await c.query("SELECT pg_advisory_xact_lock(190010)");
    await c.query("SET LOCAL search_path=public");
    await c.query("CREATE TABLE IF NOT EXISTS clarix_schema_versions(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    const installed=(await c.query("SELECT checksum FROM clarix_schema_versions WHERE version='foundation'")).rows[0];
    if(installed&&installed.checksum!==hash)throw new Error("Migration checksum mismatch");
    if(!installed){
      if((await c.query("SELECT to_regclass('public.users') AS present")).rows[0].present)
        throw new Error("Existing unmanaged schema: review a migration baseline before production setup");
      await c.query(initial);
      await c.query("INSERT INTO clarix_schema_versions(version,checksum) VALUES('foundation',$1)",[hash]);
    }
    await c.query(await readFile(new URL("platform-migration.sql",base),"utf8"));
    await c.query(await readFile(new URL("snapshot-migration.sql",base),"utf8"));
    await c.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clarix_platform') THEN
        CREATE ROLE clarix_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clarix_accounts') THEN
        CREATE ROLE clarix_accounts NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END $$; GRANT clarix_accounts,clarix_platform TO CURRENT_USER; GRANT USAGE ON SCHEMA public TO clarix_accounts,clarix_platform;`);
    for(const file of ["foundation-rls.sql","canonical-rls.sql","history-rls.sql","run-indexes.sql","accounts-rls.sql","runtime-grants.sql","platform-rls.sql","snapshot-rls.sql"])
      await c.query(await readFile(new URL(file,base),"utf8"));
    await c.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC',current_database()); END $$;`);
    await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK");throw e;}
}
