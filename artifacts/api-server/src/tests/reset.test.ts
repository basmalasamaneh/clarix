import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import {pool} from "@workspace/db/admin";
import {resetFactory,guardReset,fingerprint,importedTables,securityTables,requireUnfilteredObserver} from "../maintenance/reset";
import pg from "pg";
import {randomUUID} from "node:crypto";
after(()=>pool.end());
const args=["--factory","ethmar","--confirm","ethmar"],env={NODE_ENV:"test",SEED_TEST_USERS:"true"};
test("reset refuses missing guards and malformed targets",()=>{
 for(const e of [{...env,NODE_ENV:"production"},{...env,REPLIT_DEPLOYMENT:"1"},{NODE_ENV:"test"},{...env,SEED_TEST_USERS:"false"}]) assert.throws(()=>guardReset(args,e));
 for(const a of [[],["--factory","ethmar"],["--factory","ethmar","--confirm","najm"],["--factory","*","--confirm","*"]]) assert.throws(()=>guardReset(a,env));
 assert.equal(guardReset(args,env),"ethmar");
});
test("fingerprints bind parameters only for factory-filtered queries",async()=>{
 const calls:{sql:string;parameters:unknown[]}[]=[];
 const fake={query:async(sql:string,parameters:unknown[])=>{
  calls.push({sql,parameters});
  assert.equal(parameters.length,sql.includes("$1")?1:0);
  return {rows:[{count:0,hash:"empty"}]};
 }};
 await fingerprint(fake as unknown as pg.PoolClient,"public","ethmar");
 for(const table of ["users","sessions"]) assert.equal(calls.find(c=>c.sql.includes(`"${table}"`))!.parameters.length,0);
 assert.equal(calls.find(c=>c.sql.includes('"imports"'))!.parameters[0],"ethmar");
});
test("privileged reset scope, rollback, protected rows and immutable runtime",async()=>{
 const c=await pool.connect();
 try {
  const schema=process.env.CLARIX_TEST_SCHEMA!;
  // Add minimal nonempty data in each isolated tenant, independent of other tests.
  await c.query("BEGIN");
  for(const t of [...importedTables,"factories","memberships","invitations","account_audit",...securityTables]) await c.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`);
  for(const [factory,user] of [["ethmar","test-manager"],["najm","test-najm"]]) {
   const id=randomUUID();
   await c.query("INSERT INTO imports(id,factory_id,source_name,file_names,content_hash,uploaded_by) VALUES($1::uuid,$2,'reset-proof','[]',$1::text,$3)",[id,factory,user]);
   await c.query("INSERT INTO raw_rows(factory_id,source_name,import_id,file,line_number,cells) VALUES($1,'reset-proof',$2,'test.csv',1,'{}')",[factory,id]);
  }
  const other=await fingerprint(c,schema,"najm"),protectedBefore=await fingerprint(c,schema,undefined,true);
  for(const t of [...importedTables,"factories","memberships","invitations","account_audit",...securityTables]) await c.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
  await c.query("COMMIT");
  // Observe nonempty FORCE-RLS test tables using the same privileged connection
  // configuration as the harness, never inserting a sentinel into dev tables.
  const observerPool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:"-c row_security=off"});
  const observer=await observerPool.connect();
  try {
    await requireUnfilteredObserver(observer);
    const visible=await fingerprint(observer,schema,"najm");
    assert.equal(visible.factories.count,1);
    assert.ok(visible.imports.count>0 && visible.raw_rows.count>0);
    assert.deepEqual(visible,other);
  } finally {observer.release();await observerPool.end();}
  await assert.rejects(resetFactory(c,["--factory","missing","--confirm","missing"],env),/Unknown/);
  await c.query("SET ROLE clarix_runtime");
  await assert.rejects(requireUnfilteredObserver(c),/BYPASSRLS/);
  await assert.rejects(resetFactory(c,args,env),/Privileged/);
  await c.query("RESET ROLE");
  // Force a mid-delete failure to prove trigger/DDL restoration on rollback.
  await c.query("CREATE FUNCTION reset_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced rollback'; END $$");
  await c.query("CREATE TRIGGER reset_test_failure BEFORE DELETE ON imports FOR EACH ROW EXECUTE FUNCTION reset_test_fail()");
  await assert.rejects(resetFactory(c,args,env),/forced rollback/);
  assert.ok((await c.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='raw_rows'::regclass AND tgname='raw_rows_immutable'")).rows.every(r=>r.tgenabled==="O"));
  await c.query("DROP TRIGGER reset_test_failure ON imports");await c.query("DROP FUNCTION reset_test_fail()");
  const result=await resetFactory(c,args,env);
  assert.ok(result.otherFactoriesUnchanged&&result.protectedUnchanged);
  for(const t of importedTables) assert.equal(result.after[t].count,0);
  await c.query("BEGIN");
  for(const t of [...importedTables,"factories","memberships","invitations","account_audit",...securityTables]) await c.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`);
  assert.deepEqual(await fingerprint(c,schema,"najm"),other);
  const protectedAfter=await fingerprint(c,schema,undefined,true);
  for(const t of ["users","factories","memberships","sessions"]) assert.deepEqual(protectedAfter[t],protectedBefore[t]);
  await c.query("ROLLBACK");
  for(const sql of ["UPDATE raw_rows SET cells='{}' WHERE factory_id='najm'","DELETE FROM raw_rows WHERE factory_id='najm'","TRUNCATE raw_rows","DELETE FROM orders_history","UPDATE events_history SET payload='{}'","TRUNCATE production_records_history"]) {
   await c.query("BEGIN");await c.query("SET LOCAL ROLE clarix_runtime");
   await c.query("SELECT set_config('app.user_id','test-najm',true),set_config('app.factory_id','najm',true)");
   await assert.rejects(c.query(sql));await c.query("ROLLBACK");
  }
 } finally {await c.query("ROLLBACK");c.release();}
});
