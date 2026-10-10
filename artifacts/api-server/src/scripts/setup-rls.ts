import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db/admin";
import { isProduction } from "../lib/permissions";

// Development/post-merge setup only. Publishing owns production migrations.
if (isProduction()) throw new Error("Development schema setup cannot run in production");
try {
  await pool.query(await readFile(new URL("../../../../lib/db/accounts-migration.sql",import.meta.url),"utf8"));
  const sql = await readFile(new URL("../../../../lib/db/foundation-rls.sql", import.meta.url), "utf8");
  await pool.query(sql);
  await pool.query(await readFile(new URL("../../../../lib/db/import-migration.sql",import.meta.url),"utf8"));
  const canonical = await readFile(new URL("../../../../lib/db/canonical-rls.sql", import.meta.url), "utf8");
  await pool.query(canonical);
  await pool.query(await readFile(new URL("../../../../lib/db/history-rls.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../../../../lib/db/run-indexes.sql",import.meta.url),"utf8"));
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clarix_accounts') THEN
      CREATE ROLE clarix_accounts NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
  END $$;
  GRANT clarix_accounts TO CURRENT_USER;
  GRANT USAGE ON SCHEMA public TO clarix_accounts;`);
  await pool.query(await readFile(new URL("../../../../lib/db/accounts-rls.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../../../../lib/db/runtime-grants.sql",import.meta.url),"utf8"));
} finally {
  await pool.end();
}
