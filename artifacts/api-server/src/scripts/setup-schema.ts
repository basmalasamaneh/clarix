import {pool} from "@workspace/db";
import {spawnSync} from "node:child_process";
import {isProduction} from "../lib/permissions";
if(isProduction()) throw new Error("Development migration cannot run in production");
try {
  const exists=(await pool.query("SELECT to_regclass('public.imports') AS name")).rows[0].name;
  // Drizzle push can try to drop referenced composite unique constraints on an
  // existing Phase2 schema. Never CASCADE them: use additive SQL migrations.
  if(!exists) {
    const r=spawnSync("pnpm",["--filter","@workspace/db","run","push"],{stdio:"inherit"});
    if(r.status!==0) throw new Error("Initial schema setup failed");
  }
} finally {await pool.end();}
