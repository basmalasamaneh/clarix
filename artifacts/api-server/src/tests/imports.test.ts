import {test,after} from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import app from "../app";
import {pool} from "@workspace/db";
import {withTenant,closeTenantPools} from "../lib/tenancy";
import {sessionStore} from "../lib/session";
after(async()=>{sessionStore.close();await closeTenantPools();await pool.end();});
const root=fileURLToPath(new URL("../../../../",import.meta.url));
async function login(email:string) {
  const a=request.agent(app),s=await a.get("/api/auth/session");
  const r=await a.post("/api/auth/login").set("X-CSRF-Token",s.body.csrfToken).send({email,password:process.env.SEED_TEST_PASSWORD}).expect(200);
  return {a,token:r.body.csrfToken,user:r.body.user.id,factory:r.body.activeFactoryId};
}
test("real API import/approval, isolation, originals, replacement history and unsafe input",async(t)=>{
  const eth=await login("ethmar.analyst@clarix.test"),najm=await login("najm.manager@clarix.test"),viewer=await login("ethmar.viewer@clarix.test");
  const source=`API verification ${randomUUID()}`;
  async function upload(who:typeof eth,folder:string,sourceName=source,mutate?:(files:{name:string;bytes:Buffer}[])=>void) {
    const dir=root+"test-data/"+folder;
    const files=readdirSync(dir).filter(n=>n.endsWith(".csv")).map(name=>({name,bytes:readFileSync(dir+"/"+name)}));
    mutate?.(files);
    const input={sourceName,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))};
    const draft=await who.a.post("/api/imports").set("X-CSRF-Token",who.token).send(input).expect(201);
    for(const f of files) {
      const response=await fetch(draft.body.files.find((r:{name:string})=>r.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)});
      assert.equal(response.ok,true,"direct object storage upload");
    }
    const ready=await who.a.post(`/api/imports/${draft.body.id}/finalize`).set("X-CSRF-Token",who.token).expect(200);
    return {id:draft.body.id,ready:ready.body,mapping:JSON.parse(readFileSync(dir+"/mapping.json","utf8"))};
  }
  async function check(who:typeof eth,u:Awaited<ReturnType<typeof upload>>) {
    await who.a.put(`/api/imports/${u.id}/mapping`).set("X-CSRF-Token",who.token).send({mapping:u.mapping}).expect(200);
    return (await who.a.post(`/api/imports/${u.id}/check`).set("X-CSRF-Token",who.token).expect(200)).body;
  }
  async function approve(who:typeof eth,id:string,count:number) {
    return (await who.a.post(`/api/imports/${id}/approve`).set("X-CSRF-Token",who.token).send({confirmReplacement:true,replacementCount:count}).expect(200)).body;
  }
  // The same approved fixture may already exist from a previous test execution.
  // Only isolated source orders created on this run are used for replacement checks.
  let first:Awaited<ReturnType<typeof upload>>;
  await t.test("Ethmar baseline: exact checked numbers and no draft canonical rows",async()=>{
    first=await upload(eth,"ethmar-plastics/00_baseline");
    const r=await check(eth,first);
    assert.equal(r.result.runs["E-01"].volume.scrap_rate_pct,"5");
    assert.equal(r.result.runs["E-02"].changeover.minutes,"360");
    assert.equal(r.result.runs["E-02"].downtime.minutes,"45");
    await withTenant(eth.user,eth.factory,async db=>assert.equal((await db.query("SELECT id FROM orders WHERE source_name=$1",[source])).rowCount,0));
    if(!first.ready.duplicateOf) assert.equal((await approve(eth,first.id,0)).status,"approved");
  });
  await t.test("scenario20 cannot be approved twice; cross-factory visibility denied; viewer denied",async()=>{
    const dupe=await upload(eth,"ethmar-plastics/20_duplicate_file_upload");
    assert.ok(dupe.ready.duplicateOf);
    await check(eth,dupe);
    const r=await eth.a.post(`/api/imports/${dupe.id}/approve`).set("X-CSRF-Token",eth.token).send({confirmReplacement:true,replacementCount:0}).expect(409);
    assert.equal(r.body.error,"DUPLICATE_FILE");
    await najm.a.get(`/api/imports/${first.id}`).expect(404);
    await viewer.a.get("/api/imports").expect(403);
    await viewer.a.post("/api/imports").set("X-CSRF-Token",viewer.token).send({}).expect(403);
  });
  await t.test("Najm mapping reproduces exact units and numbers",async()=>{
    const u=await upload(najm,"najm-packaging/00_baseline"),r=await check(najm,u);
    assert.equal(r.result.runs["E-01"].volume.input_kg,"2500");
    assert.equal(r.result.runs["B-102"].downtime.minutes,"20");
    if(!u.ready.duplicateOf) await approve(najm,u.id,0);
    const sameBytes=await upload(najm,"ethmar-plastics/00_baseline",source+"-cross-factory-bytes");
    if(!sameBytes.ready.duplicateOf) {
      await check(najm,sameBytes);await approve(najm,sameBytes.id,0);
    } else {
      const own=await najm.a.get(`/api/imports/${sameBytes.ready.duplicateOf}`).expect(200);
      assert.equal(own.body.status,"approved","duplicate link stays in Najm, never Ethmar");
    }
  });
  await t.test("scenario21 Arabic and scenario19 totals-only",async()=>{
    const ar=await upload(eth,"ethmar-plastics/21_arabic_cp1256"),r=await check(eth,ar);
    assert.equal(r.result.event_reasons["EV-2002"],"توقف غير مخطط - انقطاع التغذية");
    const totals=await upload(eth,"ethmar-plastics/19_totals_only_level1");
    assert.equal(totals.ready.mapping.capability_level,1);
    assert.equal((await check(eth,totals)).result.capability_level,1);
  });
  await t.test("wrong type, oversize and unreadable number",async()=>{
    for(const [name,size] of [["bad.exe",1],["huge.csv",100000000]] as const) {
      const r=await eth.a.post("/api/imports").set("X-CSRF-Token",eth.token).send({sourceName:source,files:[{name,size,mime:"text/csv"},{name:"other.csv",size:1,mime:"text/csv"}]});
      assert.ok([400,413].includes(r.status));
    }
    const u=await upload(eth,"ethmar-plastics/00_baseline",source,files=>{
      const f=files.find(f=>f.name==="production_records.csv")??files.find(f=>f.name.includes("records"))!;
      f.bytes=Buffer.from(f.bytes.toString().replace(",600,",",not-a-number,"));
    });
    const r=await eth.a.put(`/api/imports/${u.id}/mapping`).set("X-CSRF-Token",eth.token).send({mapping:u.mapping}).expect(422);
    assert.equal(r.body.error,"UNREADABLE_NUMBER");assert.ok(r.body.details.file && r.body.details.line && r.body.details.column);
    const fake=await eth.a.post("/api/imports").set("X-CSRF-Token",eth.token).send({sourceName:source,
      files:[{name:"fake.csv",size:4,mime:"text/csv"},{name:"other.csv",size:8,mime:"text/csv"}]}).expect(201);
    for(const f of fake.body.files) {
      const bytes=f.name==="fake.csv"?new Uint8Array([0,1,2,3]):new TextEncoder().encode("a,b\n1,2\n");
      assert.ok((await fetch(f.uploadUrl,{method:"PUT",body:bytes})).ok);
    }
    const invalid=await eth.a.post(`/api/imports/${fake.body.id}/finalize`).set("X-CSRF-Token",eth.token).expect(400);
    assert.equal(invalid.body.error,"INVALID_FILE_TYPE");
  });
  await t.test("replacement history is append-only and invisible across factories",async()=>{
    const unique=`history-${randomUUID()}`;
    const change=(suffix:string)=>(files:{name:string;bytes:Buffer}[])=>files.forEach(f=>{f.bytes=Buffer.from(f.bytes.toString().replaceAll("E-01",unique).replaceAll("E-02",unique+"-2")+suffix);});
    const u=await upload(eth,"ethmar-plastics/00_baseline",unique,change(""));await check(eth,u);await approve(eth,u.id,0);
    const v=await upload(eth,"ethmar-plastics/00_baseline",unique,change("\n"));const checked=await check(eth,v);
    assert.equal(checked.replacementCount,2);
    await eth.a.post(`/api/imports/${v.id}/approve`).set("X-CSRF-Token",eth.token).send({confirmReplacement:false,replacementCount:2}).expect(409);
    await approve(eth,v.id,2);
    for(const table of ["orders_history","production_records_history","events_history"]) {
      const ids=await withTenant(eth.user,eth.factory,async db=>(await db.query(`SELECT id,superseded_by_import_id,superseded_at FROM ${table} WHERE source_name=$1`,[unique])).rows);
      assert.ok(ids.length);assert.ok(ids.every(r=>r.superseded_by_import_id===v.id && r.superseded_at));
      const policy=(await pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",[table])).rows[0];
      assert.ok(policy.relrowsecurity && policy.relforcerowsecurity);
      await withTenant(najm.user,najm.factory,async db=>assert.equal((await db.query(`SELECT id FROM ${table} WHERE id=ANY($1::uuid[])`,[ids.map(r=>r.id)])).rowCount,0));
      for(const verb of [`UPDATE ${table} SET payload='{}'`,`DELETE FROM ${table}`]) {
        await assert.rejects(withTenant(eth.user,eth.factory,async db=>db.query(`${verb} WHERE id=$1`,[ids[0].id])));
      }
      const c=await pool.connect();
      try {
        await c.query("BEGIN");await c.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
        await assert.rejects(c.query(`UPDATE ${table} SET payload='{}' WHERE id=$1`,[ids[0].id]),(e:unknown)=>(e as {code:string}).code==="55000");
      } finally {await c.query("ROLLBACK");c.release();}
      await assert.rejects(withTenant(najm.user,najm.factory,db=>db.query(`INSERT INTO ${table}(factory_id,source_name,source_id,order_id,original_import_id,superseded_by_import_id,payload) VALUES($1,'forged','x',$2,$3,$3,'{}')`,[eth.factory,randomUUID(),u.id])));
      await assert.rejects(withTenant(eth.user,eth.factory,db=>db.query(`INSERT INTO ${table}(factory_id,source_name,source_id,order_id,original_import_id,superseded_by_import_id,payload)
        SELECT factory_id,source_name,source_id,order_id,$2,superseded_by_import_id,payload FROM ${table} WHERE id=$1`,
        [ids[0].id,randomUUID()])),(e:unknown)=>(e as {code:string}).code==="23503");
    }
  });
  await t.test("every golden folder through the real API pipeline",async()=>{
    const expected=JSON.parse(readFileSync(root+"expected/expected_results.json","utf8")).datasets;
    const merge=(a:any,b:any):any=>{
      const out=structuredClone(a);
      for(const [k,v] of Object.entries(b)) out[k]=v && typeof v==="object" && !Array.isArray(v) && out[k] && typeof out[k]==="object" ? merge(out[k],v):v;
      return out;
    };
    for(const [dataset,scenarios] of Object.entries(expected) as [string,any][]) {
      const resolve=(name:string):any=>scenarios[name].extends?merge(resolve(scenarios[name].extends),scenarios[name]):scenarios[name];
      for(const name of Object.keys(scenarios)) {
        const who=dataset==="najm-packaging"?najm:eth;
        const u=await upload(who,`${dataset}/${name}`,`${source}-${name}`);
        const r=await check(who,u),exp=resolve(name);
        for(const key of ["capability_level","runs","comparison","file_issues","formula_like_cells"]) assert.deepEqual(r.result[key],exp[key],`${dataset}/${name}/${key}`);
        if(!u.ready.duplicateOf) {
          const approved=await approve(who,u.id,r.replacementCount);
          assert.deepEqual(approved.result,r.result);
          await withTenant(who.user,who.factory,async db=>{
            const stored=await db.query("SELECT metrics FROM orders WHERE current_import_id=$1",[u.id]);
            assert.equal(stored.rowCount,Object.keys(r.result.runs).length);
          });
        }
      }
    }
  });
});
