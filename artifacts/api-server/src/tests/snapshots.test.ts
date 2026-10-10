import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import app from "../app";
import {pool} from "@workspace/db/admin";
import {closeTenantPools,withTenant} from "../lib/tenancy";
import {sessionStore} from "../lib/session";
after(async()=>{sessionStore.close();await closeTenantPools();await pool.end();});
const root=fileURLToPath(new URL("../../../../",import.meta.url));
async function login(email:string) {
  const a=request.agent(app),s=await a.get("/api/auth/session");
  const r=await a.post("/api/auth/login").set("X-CSRF-Token",s.body.csrfToken).send({email,password:process.env.SEED_TEST_PASSWORD}).expect(200);
  return {a,csrf:r.body.csrfToken,user:r.body.user.id,factory:r.body.activeFactoryId};
}
type Actor=Awaited<ReturnType<typeof login>>;
const post=(u:Actor,path:string,data:object)=>u.a.post("/api"+path).set("X-CSRF-Token",u.csrf).send(data);
async function approve(u:Actor,folder:string,sourceName:string,replacementCount=0) {
  const dir=root+"test-data/"+folder;
  const files=readdirSync(dir).filter(n=>n.endsWith(".csv")).map(name=>({name,bytes:readFileSync(dir+"/"+name)}));
  const draft=(await post(u,"/imports",{sourceName,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))}).expect(201)).body;
  for(const f of files)assert.ok((await fetch(draft.files.find((v:{name:string})=>v.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)})).ok);
  await post(u,`/imports/${draft.id}/finalize`,{}).expect(200);
  const mapping=JSON.parse(readFileSync(dir+"/mapping.json","utf8"));
  const codes=(await post(u,`/imports/${draft.id}/event-codes`,{mapping}).expect(200)).body.items;
  mapping.ignored_event_codes=codes.filter((c:{code:string})=>!mapping.event_code_map[c.code]).map((c:{code:string})=>c.code);
  await u.a.put(`/api/imports/${draft.id}/mapping`).set("X-CSRF-Token",u.csrf).send({mapping}).expect(200);
  await post(u,`/imports/${draft.id}/check`,{}).expect(200);
  await post(u,`/imports/${draft.id}/approve`,{confirmReplacement:true,replacementCount,confirmErrors:true}).expect(200);
  return draft.id;
}
test("Phase14 immutable snapshots, reconciliation and original source gate",async t=>{
  const analyst=await login("ethmar.analyst@clarix.test"),manager=await login("ethmar.manager@clarix.test"),
    viewer=await login("ethmar.viewer@clarix.test"),najm=await login("najm.manager@clarix.test"),admin=await login("platform.admin@clarix.test");
  const source="snapshot-"+randomUUID();
  await approve(analyst,"ethmar-plastics/00_baseline",source);
  const runs=(await analyst.a.get("/api/runs").query({source}).expect(200)).body.items;
  const a=runs.find((r:{orderId:string})=>r.orderId==="E-01").id,b=runs.find((r:{orderId:string})=>r.orderId==="E-02").id;
  const input={a,b,title:"Frozen baseline "+source,note:"Original production report"};
  let saved:any,original:string,sourceOriginal:any,exported:any;
  await t.test("save exact comparison, charts, lineage and initial report atomically",async()=>{
    await post(analyst,"/snapshots",{a,b,title:"Stale view",note:"",expectedImportA:randomUUID()}).expect(409);
    const current=(await analyst.a.get("/api/comparison").query({a,b}).expect(200)).body;
    saved=(await post(analyst,"/snapshots",{...input,figures:{a:{input_kg:"1000",scrap_kg:"50"},b:{scrap_kg:"100.100000000000000001"},origin:"Report"}}).expect(201)).body;
    assert.deepEqual(saved.comparison,current);assert.equal(saved.snapshot.changed,false);
    original=JSON.stringify(saved.comparison);
    const rec=(await viewer.a.get("/api/reconciliations").query({snapshotId:saved.snapshot.id}).expect(200)).body;
    assert.equal(rec.total,1);
    assert.equal(rec.items[0].result.figures.find((r:any)=>r.side==="a"&&r.key==="input_kg").result,"matches");
    assert.equal(rec.items[0].result.figures.find((r:any)=>r.side==="b"&&r.key==="scrap_kg").difference,"0.100000000000000001");
    assert.equal(rec.items[0].result.figures.find((r:any)=>r.key==="good_kg").reported,null);
    const precise=(await post(analyst,"/reconciliation-preview",{a,b,figures:{a:{input_kg:"1000.123456789012345678901234567891"},b:{}}}).expect(200)).body;
    assert.equal(precise.figures.find((r:any)=>r.side==="a"&&r.key==="input_kg").difference,"0.123456789012345678901234567891");
    sourceOriginal=(await viewer.a.get("/api/source-detail").query({snapshot:saved.snapshot.id,kind:"metric",id:a,metric:"scrap_kg"}).expect(200)).body;
    await withTenant(analyst.user,analyst.factory,async c=>{
      assert.ok((await c.query("SELECT count(*)::int n FROM source_row_links WHERE snapshot_id=$1",[saved.snapshot.id])).rows[0].n>0);
      const r=(await c.query("SELECT provenance,definitions_version FROM analysis_snapshots WHERE id=$1",[saved.snapshot.id])).rows[0];
      assert.ok(r.provenance[0].files[0].sha256);assert.ok(r.provenance[0].mapping);assert.equal(r.definitions_version,"clarix-locked-v1");
    });
  });
  await t.test("Phase15 report permissions, exact stored payload, metadata and content-free audit",async()=>{
    for(const actor of [manager,analyst,viewer]) {
      const report=(await post(actor,`/snapshots/${saved.snapshot.id}/report`,{language:"en"}).expect(200)).body;
      assert.deepEqual(report.comparison,saved.comparison);
      assert.equal(report.filename,`clarix-ethmar-plastics-${saved.snapshot.id}-en.pdf`);
      assert.equal(report.reconciliations.length,1);
      assert.equal(report.reconciliations[0].result.figures.find((f:any)=>f.side==="b"&&f.key==="scrap_kg").difference,"0.100000000000000001");
      assert.ok(report.provenance[0].files[0].sha256);
      exported=report;
    }
    const ar=(await post(analyst,`/snapshots/${saved.snapshot.id}/report`,{language:"ar"}).expect(200)).body;
    assert.deepEqual(ar.comparison,exported.comparison);
    await post(admin,`/snapshots/${saved.snapshot.id}/report`,{language:"en"}).expect(403);
    assert.deepEqual((await post(najm,`/snapshots/${saved.snapshot.id}/report`,{language:"en"}).expect(404)).body,
      (await post(najm,`/snapshots/${randomUUID()}/report`,{language:"en"}).expect(404)).body);
    await post(viewer,`/snapshots/${saved.snapshot.id}/report`,{language:"fr"}).expect(400);
    await withTenant(analyst.user,analyst.factory,async c=>{
      const audits=(await c.query("SELECT action FROM snapshot_audit WHERE snapshot_id=$1 AND action LIKE 'report_prepared_%'",[saved.snapshot.id])).rows;
      assert.equal(audits.length,4);assert.ok(audits.some(a=>a.action==="report_prepared_ar"));
    });
  });
  await t.test("Viewer read-only, Platform Admin denial, tenant-safe identical404s on every path",async()=>{
    await viewer.a.get("/api/snapshots").expect(200);
    await viewer.a.get("/api/snapshots/"+saved.snapshot.id).expect(200);
    for(const u of [viewer,admin]) {
      await post(u,"/snapshots",input).expect(403);
      await post(u,`/snapshots/${saved.snapshot.id}/reconciliations`,{a:{},b:{}}).expect(403);
      await post(u,"/reconciliation-preview",{a,b,figures:{a:{},b:{}}}).expect(403);
    }
    for(const path of ["/snapshots",`/snapshots/${saved.snapshot.id}`,`/reconciliations?snapshotId=${saved.snapshot.id}`])await admin.a.get("/api"+path).expect(403);
    const other=randomUUID();
    assert.deepEqual((await najm.a.get("/api/snapshots/"+saved.snapshot.id).expect(404)).body,(await najm.a.get("/api/snapshots/"+other).expect(404)).body);
    assert.deepEqual((await najm.a.get("/api/reconciliations").query({snapshotId:saved.snapshot.id}).expect(404)).body,
      (await najm.a.get("/api/reconciliations").query({snapshotId:other}).expect(404)).body);
    await post(najm,`/snapshots/${saved.snapshot.id}/reconciliations`,{a:{},b:{}}).expect(404);
    await najm.a.get("/api/source-detail").query({snapshot:saved.snapshot.id,kind:"metric",id:a,metric:"scrap_kg"}).expect(404);
    assert.equal((await najm.a.get("/api/snapshots").expect(200)).body.total,0);
    await viewer.a.get("/api/source-detail").query({snapshot:saved.snapshot.id,kind:"metric",id:randomUUID(),metric:"scrap_kg"}).expect(404);
  });
  await t.test("new import changes current values but frozen bytes/charts/source drawer remain identical",async()=>{
    const folder=readdirSync(root+"test-data/ethmar-plastics").find(n=>n.startsWith("07_"))!;
    await approve(analyst,"ethmar-plastics/"+folder,source,2);
    const after=(await viewer.a.get("/api/snapshots/"+saved.snapshot.id).expect(200)).body;
    assert.equal(JSON.stringify(after.comparison),original);
    assert.equal(after.snapshot.changed,true);
    const frozenReport=(await post(analyst,`/snapshots/${saved.snapshot.id}/report`,{language:"ar"}).expect(200)).body;
    assert.deepEqual(frozenReport.comparison,exported.comparison);
    assert.ok(after.changes.some((c:any)=>c.kind==="import"));
    assert.ok(after.changes.some((c:any)=>c.kind==="metric"&&c.key==="scrap_kg"&&c.after===null));
    assert.ok(after.changes.some((c:any)=>c.kind==="status"&&c.after==="red"));
    const detail=(await viewer.a.get("/api/source-detail").query({snapshot:saved.snapshot.id,kind:"metric",id:a,metric:"scrap_kg"}).expect(200)).body;
    assert.deepEqual(detail,sourceOriginal);
    const d=(await viewer.a.get("/api/source-detail").query({snapshot:saved.snapshot.id,kind:"metric",id:a,other:b,metric:"scrap_rate_pct"}).expect(200)).body;
    assert.equal(d.value,"5");
    const list=(await viewer.a.get("/api/snapshots").query({search:"E-01"}).expect(200)).body;
    assert.ok(list.items.find((s:any)=>s.id===saved.snapshot.id).changed);
    await withTenant(analyst.user,analyst.factory,async c=>{
      assert.ok((await c.query("SELECT count(*)::int n FROM orders_history WHERE source_name=$1",[source])).rows[0].n>=2);
    });
  });
  await t.test("red groups block every reconciliation figure without hiding table values",async()=>{
    const result=(await post(analyst,"/reconciliation-preview",{a,b,figures:{a:{input_kg:"1000",scrap_kg:"50"},b:{input_kg:"1000",good_kg:"900",scrap_kg:"100"},origin:""}}).expect(200)).body;
    const current=(await viewer.a.get("/api/comparison").query({a,b}).expect(200)).body;
    const blockedSide=current.a.groups.volume==="red"?"a":"b";
    const v=result.figures.find((f:any)=>f.side===blockedSide&&f.key==="input_kg");
    assert.equal(v.clarix,"1000");assert.equal(v.difference,null);assert.equal(v.result,"unavailable");
    const missing=result.figures.find((f:any)=>f.side===blockedSide&&f.key==="scrap_kg");
    assert.equal(missing.clarix,null);assert.equal(missing.difference,null);
    const blocked=(await post(analyst,"/snapshots",{a,b,title:"=Blocked <script>alert(1)</script>",note:"@Untrusted report",
      figures:{a:{input_kg:"1000"},b:{input_kg:"1000"}}}).expect(201)).body;
    const report=(await post(analyst,`/snapshots/${blocked.snapshot.id}/report`,{language:"en"}).expect(200)).body;
    assert.deepEqual(report.comparison,blocked.comparison);
    assert.ok(report.issues.some((i:any)=>i.refs.length>0));
    const blockedFigure=report.reconciliations[0].result.figures.find((f:any)=>f.side===blockedSide&&f.key==="input_kg");
    assert.equal(blockedFigure.result,"unavailable");assert.equal(blockedFigure.difference,null);
    assert.equal(report.snapshot.title,"=Blocked <script>alert(1)</script>");
    await post(analyst,"/reconciliation-preview",{a,b,figures:{a:{input_kg:"1e3"},b:{}}}).expect(400);
    await post(analyst,"/reconciliation-preview",{a,b,figures:{a:{input_kg:"NaN"},b:{}}}).expect(400);
  });
  await t.test("later records append without changing snapshot; exact negatives and empty values",async()=>{
    const record=(await post(manager,`/snapshots/${saved.snapshot.id}/reconciliations`,{a:{input_kg:"999.99",good_kg:"",scrap_kg:"-5"},b:{},origin:"Later report"}).expect(201)).body;
    assert.equal(record.result.figures.find((f:any)=>f.side==="a"&&f.key==="input_kg").difference,"-0.01");
    assert.equal(record.result.figures.find((f:any)=>f.side==="a"&&f.key==="scrap_kg").difference,"-55");
    assert.equal(record.result.figures.find((f:any)=>f.side==="a"&&f.key==="good_kg").result,"not_provided");
    const after=(await viewer.a.get("/api/snapshots/"+saved.snapshot.id).expect(200)).body;
    assert.equal(JSON.stringify(after.comparison),original);
    assert.equal((await viewer.a.get("/api/reconciliations").query({snapshotId:saved.snapshot.id}).expect(200)).body.total,2);
    const complete=(await post(manager,`/snapshots/${saved.snapshot.id}/report`,{language:"en"}).expect(200)).body;
    assert.equal(complete.reconciliations.length,2);
    assert.equal(complete.reconciliations[1].result.figures.find((f:any)=>f.side==="a"&&f.key==="scrap_kg").difference,"-55");
  });
  await t.test("immutable runtime tables, forced RLS and no mutation APIs",async()=>{
    for(const table of ["analysis_snapshots","reconciliations","source_row_links","snapshot_audit"]) {
      for(const statement of [`UPDATE ${table} SET factory_id=factory_id`,`DELETE FROM ${table}`,`TRUNCATE ${table}`]) {
        await assert.rejects(withTenant(analyst.user,analyst.factory,c=>c.query(statement)));
      }
    }
    const r=await pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND c.relkind='r' AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='factory_id')`);
    assert.ok(r.rows.some(r=>r.relname==="analysis_snapshots"));
    assert.ok(r.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
    await manager.a.patch("/api/snapshots/"+saved.snapshot.id).set("X-CSRF-Token",manager.csrf).send({title:"Changed"}).expect(404);
    await manager.a.delete("/api/snapshots/"+saved.snapshot.id).set("X-CSRF-Token",manager.csrf).expect(404);
    await withTenant(najm.user,najm.factory,async c=>{
      for(const table of ["analysis_snapshots","source_row_links","reconciliations","snapshot_audit"])assert.equal((await c.query(`SELECT * FROM ${table} WHERE factory_id='ethmar'`)).rowCount,0);
    });
  });
  await t.test("report quota is persistent, language-aware and independent between readers",async()=>{
    for(const [actor,action] of [[analyst.user,"report_prepared_en"],[viewer.user,"snapshot_saved"]]) {
      await assert.rejects(withTenant(viewer.user,viewer.factory,c=>c.query(
        "INSERT INTO snapshot_audit(id,factory_id,snapshot_id,actor_id,action) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(),viewer.factory,saved.snapshot.id,actor,action])),{code:"42501"});
    }
    for(let i=0;i<9;i++)await post(viewer,`/snapshots/${saved.snapshot.id}/report`,{language:i%2?"ar":"en"}).expect(200);
    await post(viewer,`/snapshots/${saved.snapshot.id}/report`,{language:"en"}).expect(429);
    await post(manager,`/snapshots/${saved.snapshot.id}/report`,{language:"ar"}).expect(200);
  });
  await t.test("Najm tonne conversions reconcile; list and records paginate",async()=>{
    const sourceName="snapshot-najm-"+randomUUID();
    await approve(najm,"najm-packaging/00_baseline",sourceName);
    const nr=(await najm.a.get("/api/runs").query({source:sourceName}).expect(200)).body.items;
    const ns=(await post(najm,"/snapshots",{a:nr[0].id,b:nr[1].id,title:"Najm saved",note:"",figures:{a:{input_kg:nr[0].metrics.find((m:any)=>m.key==="input_kg").value},b:{}}}).expect(201)).body;
    const rec=(await najm.a.get("/api/reconciliations").query({snapshotId:ns.snapshot.id}).expect(200)).body;
    assert.equal(rec.items[0].result.figures.find((f:any)=>f.side==="a"&&f.key==="input_kg").result,"matches");
    for(let i=0;i<20;i++)await post(manager,"/snapshots",{...input,title:`Page ${i}`}).expect(201);
    const p1=(await viewer.a.get("/api/snapshots").expect(200)).body,p2=(await viewer.a.get("/api/snapshots").query({page:2}).expect(200)).body;
    assert.equal(p1.items.length,20);assert.ok(p2.items.length>0);
    assert.equal(p1.items.some((x:any)=>p2.items.some((y:any)=>x.id===y.id)),false);
    for(let i=0;i<19;i++)await post(manager,`/snapshots/${saved.snapshot.id}/reconciliations`,{a:{},b:{}}).expect(201);
    assert.equal((await viewer.a.get("/api/reconciliations").query({snapshotId:saved.snapshot.id,page:2}).expect(200)).body.items.length,1);
    // Archiving never destroys a saved analysis or its original drawer.
    await manager.a.patch("/api/data-sources/archive").set("X-CSRF-Token",manager.csrf).send({sourceName:source,archived:true}).expect(200);
    const archived=(await viewer.a.get("/api/snapshots/"+saved.snapshot.id).expect(200)).body;
    assert.equal(JSON.stringify(archived.comparison),original);assert.ok(archived.changes.some((c:any)=>c.kind==="unavailable"));
    await viewer.a.get("/api/source-detail").query({snapshot:saved.snapshot.id,kind:"metric",id:a,metric:"input_kg"}).expect(200);
  });
});
