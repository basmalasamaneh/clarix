import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { isProduction } from "../lib/permissions";

// Development/post-merge setup only. Publishing owns production migrations.
if (isProduction()) throw new Error("Development schema setup cannot run in production");
try {
  const sql = await readFile(new URL("../../../../lib/db/foundation-rls.sql", import.meta.url), "utf8");
  await pool.query(sql);
  await pool.query(await readFile(new URL("../../../../lib/db/import-migration.sql",import.meta.url),"utf8"));
  const canonical = await readFile(new URL("../../../../lib/db/canonical-rls.sql", import.meta.url), "utf8");
  await pool.query(canonical);
  await pool.query(await readFile(new URL("../../../../lib/db/history-rls.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../../../../lib/db/run-indexes.sql",import.meta.url),"utf8"));
} finally {
  await pool.end();
}
