import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import {pool} from "@workspace/db";
after(()=>pool.end());
test("application authenticates directly as a non-owner runtime login",async()=>{
  const r=(await pool.query(`SELECT current_user,session_user,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
  assert.equal(r.current_user,"clarix_runtime");
  assert.equal(r.session_user,"clarix_runtime");
  for(const k of ["rolsuper","rolbypassrls","rolcreatedb","rolcreaterole"]) assert.equal(r[k],false);
});
test("every factory_id table has forced RLS and denies context-free access",async()=>{
  const tables=(await pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='factory_id' AND NOT a.attisdropped
    WHERE n.nspname=current_schema() AND c.relkind='r' ORDER BY c.relname`)).rows;
  assert.ok(tables.length>=12);
  for(const t of tables) {
    assert.equal(t.relrowsecurity,true,`${t.relname}: RLS disabled`);
    assert.equal(t.relforcerowsecurity,true,`${t.relname}: RLS not forced`);
    assert.match(t.relname,/^[a-z_]+$/);
    try {
      const r=await pool.query(`SELECT count(*)::int AS n FROM "${t.relname}"`);
      assert.equal(r.rows[0].n,0,`${t.relname}: context-free read leaked rows`);
    } catch(e:any) {if(e.code!=="42501") throw e;}
    console.log(`RLS coverage: ${t.relname}: enabled, forced, context-free access denied`);
  }
});
test("runtime cannot perform persistent DDL, bypass RLS or mutate raw rows",async()=>{
  const client=await pool.connect();
  try {
    for(const sql of [
      "CREATE TABLE runtime_forbidden(id int)",
      "CREATE TEMP TABLE runtime_forbidden(id int)",
      "ALTER TABLE raw_rows ADD COLUMN forbidden int",
      "DROP TABLE raw_rows",
      "ALTER TABLE raw_rows DISABLE ROW LEVEL SECURITY",
      "UPDATE raw_rows SET line_number=0",
      "DELETE FROM raw_rows",
      "TRUNCATE raw_rows",
    ]) {
      await client.query("BEGIN");
      await assert.rejects(client.query(sql),sql);
      await client.query("ROLLBACK");
    }
    await client.query("BEGIN");
    await client.query("SET LOCAL row_security=off");
    await assert.rejects(client.query("SELECT * FROM raw_rows"));
    await client.query("ROLLBACK");
  } finally {await client.query("ROLLBACK");client.release();}
});
