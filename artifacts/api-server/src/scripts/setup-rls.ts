import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { isProduction } from "../lib/permissions";

// Development/post-merge setup only. Publishing owns production migrations.
if (isProduction()) throw new Error("Development schema setup cannot run in production");
try {
  const sql = await readFile(new URL("../../../../lib/db/foundation-rls.sql", import.meta.url), "utf8");
  await pool.query(sql);
} finally {
  await pool.end();
}
