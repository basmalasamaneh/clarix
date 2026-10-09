import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { closeTenantPools, withTenant, withRequestTenant } from "../lib/tenancy";
import type { Request } from "express";

after(async () => { await closeTenantPools(); await pool.end(); });
const tables = ["column_mappings", "imports", "raw_rows", "orders", "production_records", "events", "data_issues"] as const;

test("canonical schema isolation on real PostgreSQL, synthetic rows only", async (t) => {
  const c = await pool.connect();
  const a = `synthetic-a-${randomUUID()}`, b = `synthetic-b-${randomUUID()}`;
  const ua = `user-${a}`, ub = `user-${b}`, viewer = `viewer-${a}`;
  const ids = [Object.fromEntries(tables.map((name) => [name, randomUUID()])),
    Object.fromEntries(tables.map((name) => [name, randomUUID()]))];
  const context = async (factory: string, user: string) => {
    await c.query("SELECT set_config('app.factory_id',$1,true), set_config('app.user_id',$2,true)", [factory, user]);
  };
  const fails = async (sql: string, params: unknown[], code: string) => {
    await c.query("SAVEPOINT failure");
    try {
      await assert.rejects(c.query(sql, params), (e: unknown) => (e as {code: string}).code === code);
    } finally { await c.query("ROLLBACK TO SAVEPOINT failure"); await c.query("RELEASE SAVEPOINT failure"); }
  };
  try {
    await c.query("BEGIN");
    await c.query("ALTER TABLE factories NO FORCE ROW LEVEL SECURITY");
    await c.query("ALTER TABLE memberships NO FORCE ROW LEVEL SECURITY");
    await c.query("INSERT INTO factories(id,name) VALUES ($1,'Synthetic A'),($2,'Synthetic B')", [a,b]);
    for (const id of [ua, ub, viewer]) {
      // No usable credential: synthetic identity exists only inside rollback.
      await c.query("INSERT INTO users(id,email,name,password_hash) VALUES ($1,$2,'Synthetic test','disabled')", [id, `${id}@invalid.test`]);
    }
    await c.query("INSERT INTO memberships(user_id,factory_id,role) VALUES ($1,$2,'factory_manager'),($3,$4,'analyst'),($5,$2,'viewer')", [ua,a,ub,b,viewer]);
    await c.query("ALTER TABLE factories FORCE ROW LEVEL SECURITY");
    await c.query("ALTER TABLE memberships FORCE ROW LEVEL SECURITY");
    await c.query("SET LOCAL ROLE clarix_runtime");

    await t.test("runtime is non-owner and has no superuser/BYPASSRLS; all seven tables FORCE RLS", async () => {
      const role = (await c.query("SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.equal(role.role, "clarix_runtime");
      assert.equal(role.rolsuper, false);
      assert.equal(role.rolbypassrls, false);
      const rows = await c.query("SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner)=current_user AS owns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[])", [tables]);
      assert.equal(rows.rowCount, 7);
      for (const row of rows.rows) { assert.equal(row.owns,false); assert.equal(row.relrowsecurity,true); assert.equal(row.relforcerowsecurity,true); }
    });
    await t.test("T6/T7: same source order, record, event IDs and identical hash are accepted in both factories", async () => {
      for (const [i, factory, user] of [[0,a,ua],[1,b,ub]] as const) {
        const r = ids[i];
        await context(factory, user);
        await c.query("INSERT INTO column_mappings(id,factory_id,source_name,version,mapping) VALUES ($1,$2,'erp',1,'{}')", [r.column_mappings,factory]);
        await c.query("INSERT INTO imports(id,factory_id,source_name,file_names,content_hash,uploaded_by,mapping_id) VALUES ($1,$2,'erp','[\"synthetic.csv\"]','same-synthetic-hash',$3,$4)", [r.imports,factory,user,r.column_mappings]);
        await c.query("INSERT INTO raw_rows(id,factory_id,source_name,import_id,file,line_number,cells) VALUES ($1,$2,'erp',$3,'synthetic.csv',2,'{\"value\":\"0.1\",\"formula\":\"=untouched\"}')", [r.raw_rows,factory,r.imports]);
        await c.query("INSERT INTO orders(id,factory_id,source_name,source_order_id,machine,mold) VALUES ($1,$2,'erp','E-01','M1','Mold1')", [r.orders,factory]);
        await c.query("INSERT INTO production_records(id,factory_id,source_name,record_id,order_id,input,good,scrap,raw_row_id) VALUES ($1,$2,'erp','PR-5001',$3,0.1,0.2,NULL,$4)", [r.production_records,factory,r.orders,r.raw_rows]);
        await c.query("INSERT INTO events(id,factory_id,source_name,event_id,order_id,duration_min,raw_row_id) VALUES ($1,$2,'erp','1',$3,0.3,$4)", [r.events,factory,r.orders,r.raw_rows]);
        await c.query("INSERT INTO data_issues(id,factory_id,import_id,code,severity,\"group\",raw_row_ids) VALUES ($1,$2,$3,'SYNTHETIC','info','file',$4)", [r.data_issues,factory,r.imports,[r.raw_rows]]);
      }
    });
    await t.test("A cannot read, update, delete or reassign B rows in any new table (and vice versa)", async () => {
      for (const [i,factory,user] of [[0,a,ua],[1,b,ub]] as const) {
        await context(factory,user);
        for (const table of tables) {
          const own = ids[i][table], other = ids[1-i][table];
          assert.equal((await c.query(`SELECT id FROM ${table} WHERE id=$1`, [own])).rowCount,1);
          assert.equal((await c.query(`SELECT id FROM ${table} WHERE id=$1`, [other])).rowCount,0);
          assert.equal((await c.query(`UPDATE ${table} SET factory_id=factory_id WHERE id=$1`, [other])).rowCount,0);
          assert.equal((await c.query(`DELETE FROM ${table} WHERE id=$1`, [other])).rowCount,0);
          if (table !== "raw_rows") await fails(`UPDATE ${table} SET factory_id=$1 WHERE id=$2`, [i===0 ? b:a,own], table === "data_issues" ? "23503" : "42501");
        }
      }
    });
    await t.test("T8: no factory context returns zero rows in every new table, even with a valid user", async () => {
      await context("",ua);
      for (const table of tables) assert.equal((await c.query(`SELECT id FROM ${table}`)).rowCount,0);
      await context(a,"");
      for (const table of tables) assert.equal((await c.query(`SELECT id FROM ${table}`)).rowCount,0);
      await context(b,ua);
      for (const table of tables) assert.equal((await c.query(`SELECT id FROM ${table}`)).rowCount,0);
    });
    await t.test("raw_rows blocks UPDATE, DELETE and TRUNCATE; cells and physical line retained", async () => {
      await context(a,ua);
      await fails("UPDATE raw_rows SET cells='{}' WHERE id=$1",[ids[0].raw_rows],"55000");
      await fails("DELETE FROM raw_rows WHERE id=$1",[ids[0].raw_rows],"55000");
      await fails("TRUNCATE raw_rows",[],"42501");
      await c.query("RESET ROLE");
      await fails("UPDATE raw_rows SET cells='{}' WHERE id=$1",[ids[0].raw_rows],"55000");
      await fails("DELETE FROM raw_rows WHERE id=$1",[ids[0].raw_rows],"55000");
      await c.query("SET LOCAL ROLE clarix_runtime");
      const r = (await c.query("SELECT file,line_number,cells FROM raw_rows WHERE id=$1",[ids[0].raw_rows])).rows[0];
      assert.deepEqual(r,{file:"synthetic.csv",line_number:2,cells:{value:"0.1",formula:"=untouched"}});
    });
    await t.test("numeric stays exact and missing quantities stay NULL", async () => {
      const r = (await c.query("SELECT input+good AS total, scrap FROM production_records WHERE id=$1",[ids[0].production_records])).rows[0];
      assert.equal(r.total,"0.3"); assert.equal(r.scrap,null);
      const fields = await c.query("SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND ((table_name='production_records' AND column_name IN ('input','good','scrap')) OR (table_name='events' AND column_name='duration_min'))");
      assert.equal(fields.rowCount,4);
      assert.ok(fields.rows.every((r) => r.data_type==="numeric"));
    });
    await t.test("same-factory duplicates rejected; different sources can reuse external order IDs", async () => {
      await fails("INSERT INTO imports(factory_id,source_name,file_names,content_hash,uploaded_by) VALUES ($1,'other','[]','same-synthetic-hash',$2)",[a,ua],"23505");
      await fails("INSERT INTO orders(factory_id,source_name,source_order_id) VALUES ($1,'erp','E-01')",[a],"23505");
      await c.query("INSERT INTO orders(factory_id,source_name,source_order_id) VALUES ($1,'other','E-01')",[a]);
    });
    await t.test("cross-factory foreign references and forged inserts are rejected", async () => {
      await fails("INSERT INTO orders(factory_id,source_name,source_order_id) VALUES ($1,'erp','forged')",[b],"42501");
      await fails("UPDATE imports SET mapping_id=$1 WHERE id=$2",[ids[1].column_mappings,ids[0].imports],"23503");
      await fails("UPDATE production_records SET order_id=$1 WHERE id=$2",[ids[1].orders,ids[0].production_records],"23503");
      await fails("UPDATE events SET raw_row_id=$1 WHERE id=$2",[ids[1].raw_rows,ids[0].events],"23503");
      await fails("UPDATE data_issues SET raw_row_ids=$1 WHERE id=$2",[[ids[1].raw_rows],ids[0].data_issues],"23503");
    });
    await t.test("viewer cannot write; unaffiliated identity cannot see tenant rows", async () => {
      await context(a,viewer);
      assert.equal((await c.query("SELECT id FROM orders")).rowCount,2);
      await fails("INSERT INTO orders(factory_id,source_name,source_order_id) VALUES ($1,'erp','viewer')",[a],"42501");
      assert.equal((await c.query("UPDATE orders SET product='forbidden'")).rowCount,0);
      assert.equal((await c.query("DELETE FROM orders")).rowCount,0);
      await context(a,`unaffiliated-${a}`);
      for (const table of tables) assert.equal((await c.query(`SELECT id FROM ${table}`)).rowCount,0);
    });
  } finally { await c.query("ROLLBACK"); c.release(); }
});

test("shared helper fails closed without authenticated context", async () => {
  let ran = false;
  await assert.rejects(withTenant("", "", async () => { ran=true; }));
  await assert.rejects(withRequestTenant({session:{},body:{factoryId:"najm"},params:{factoryId:"najm"}} as unknown as Request, async () => { ran=true; }));
  assert.equal(ran,false);
});
