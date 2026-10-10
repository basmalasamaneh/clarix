import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import app from "../app";
import {pool} from "@workspace/db/admin";
import {withTenant,closeTenantPools} from "../lib/tenancy";
import {sessionStore} from "../lib/session";
import {verifyRunMetrics} from "./verify-run-metrics";
import {verifySourceDetail} from "./verify-source-detail";
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
    const codes=(await who.a.post(`/api/imports/${u.id}/event-codes`).set("X-CSRF-Token",who.token).send({mapping:u.mapping}).expect(200)).body.items;
    u.mapping.ignored_event_codes=codes.filter((c:any)=>!u.mapping.event_code_map[c.code]).map((c:any)=>c.code);
    await who.a.put(`/api/imports/${u.id}/mapping`).set("X-CSRF-Token",who.token).send({mapping:u.mapping}).expect(200);
    return (await who.a.post(`/api/imports/${u.id}/check`).set("X-CSRF-Token",who.token).expect(200)).body;
  }
  async function approve(who:typeof eth,id:string,count:number) {
    return (await who.a.post(`/api/imports/${id}/approve`).set("X-CSRF-Token",who.token).send({confirmReplacement:true,replacementCount:count,confirmErrors:true}).expect(200)).body;
  }
  // The same approved fixture may already exist from a previous test execution.
  await t.test("sources isolate versions, disambiguate pairs and archive reversibly",async()=>{
    const manager=await login("ethmar.manager@clarix.test");
    const sourceA="source-test-"+randomUUID(),sourceB=sourceA+"-B";
    const mutate=(files:{name:string;bytes:Buffer}[])=>files.forEach(f=>{f.bytes=Buffer.from(f.bytes.toString().replaceAll("E-01",sourceA+"-1").replaceAll("E-02",sourceA+"-2"));});
    const a=await upload(eth,"ethmar-plastics/00_baseline",sourceA,mutate);
    await check(eth,a);await approve(eth,a.id,0);
    const b=await upload(eth,"ethmar-plastics/00_baseline",sourceB,mutate);
    const bc=await check(eth,b);
    assert.equal(bc.duplicateOf,null);assert.equal(bc.replacementCount,0);
    assert.equal(bc.otherSourceOrders.length,2);
    await approve(eth,b.id,0);
    const again=await upload(eth,"ethmar-plastics/00_baseline",sourceA,mutate);
    delete again.mapping.event_code_map.PMT; // unused API-only setting is not a difference
    assert.equal((await check(eth,again)).duplicateReason,"CURRENT_SAME_MAPPING");
    again.mapping.event_code_map.UDT="PLANNED_STOP";
    const changed=await check(eth,again);
    assert.equal(changed.duplicateReason,"MAPPING_DIFFERS");
    assert.ok(changed.settingsDifferences.some((d:any)=>d.path==="event_code_map.UDT"));
    assert.deepEqual(changed.replacementOrders,[sourceA+"-1",sourceA+"-2"]);
    await approve(eth,again.id,2);
    const runs=(await eth.a.get("/api/source-runs").query({search:sourceA}).expect(200)).body;
    assert.equal(runs.total,4);assert.ok(runs.items.every((r:any)=>r.ambiguous));
    const left=runs.items.find((r:any)=>r.sourceName===sourceA),right=runs.items.find((r:any)=>r.sourceName===sourceB && r.orderId===left.orderId);
    const pair=(await viewer.a.get("/api/source-comparison").query({left:left.id,right:right.id}).expect(200)).body;
    const metricsPair=(await viewer.a.get("/api/comparison").query({a:left.id,b:right.id}).expect(200)).body;
    assert.equal(metricsPair.a.orderId,metricsPair.b.orderId);
    assert.notEqual(metricsPair.a.sourceName,metricsPair.b.sourceName);
    assert.equal(pair.left.sourceName,sourceA);assert.equal(pair.right.sourceName,sourceB);
    await najm.a.get("/api/source-comparison").query({left:left.id,right:right.id}).expect(404);
    const archive={sourceName:sourceA,archived:true};
    await eth.a.patch("/api/data-sources/archive").set("X-CSRF-Token",eth.token).send(archive).expect(403);
    await manager.a.patch("/api/data-sources/archive").set("X-CSRF-Token",manager.token).send(archive).expect(200);
    assert.equal((await viewer.a.get("/api/quality").query({source:sourceA}).expect(200)).body.summary.orders.green,0);
    assert.equal((await viewer.a.get("/api/quality").query({source:sourceA,includeArchived:true}).expect(200)).body.summary.orders.green,2);
    assert.equal((await eth.a.get("/api/source-runs").query({search:sourceA}).expect(200)).body.total,2);
    await viewer.a.get("/api/source-comparison").query({left:left.id,right:right.id}).expect(404);
    await viewer.a.get("/api/comparison").query({a:left.id,b:right.id}).expect(404);
    await viewer.a.get(`/api/runs/${left.id}`).expect(404);
    assert.equal((await viewer.a.get("/api/runs").query({source:sourceA}).expect(200)).body.total,0);
    await eth.a.post("/api/imports").set("X-CSRF-Token",eth.token).send({sourceName:sourceA,files:[{name:"orders.csv",size:1,mime:"text/csv"},{name:"events.csv",size:1,mime:"text/csv"}]}).expect(409);
    await manager.a.patch("/api/data-sources/archive").set("X-CSRF-Token",manager.token).send({...archive,archived:false}).expect(200);
    assert.equal((await eth.a.get("/api/source-runs").query({search:sourceA}).expect(200)).body.total,4);
    await viewer.a.get("/api/source-comparison").query({left:left.id,right:right.id}).expect(200);
    await viewer.a.get("/api/comparison").query({a:left.id,b:right.id}).expect(200);
  });
  // Only isolated source orders created on this run are used for replacement checks.
  let first:Awaited<ReturnType<typeof upload>>;
  await t.test("wizard gates, ignored decisions, current mapping duplicates and reversible versions",async()=>{
    const name="mapping-versions-"+randomUUID();
    const mutate=(files:{name:string;bytes:Buffer}[])=>files.forEach(f=>{f.bytes=Buffer.from(f.bytes.toString().replaceAll("E-01",name+"-1").replaceAll("E-02",name+"-2"));});
    const a=await upload(eth,"ethmar-plastics/00_baseline",name,mutate);
    const original=structuredClone(a.mapping);
    a.mapping.event_code_map={};
    await eth.a.put(`/api/imports/${a.id}/mapping`).set("X-CSRF-Token",eth.token).send({mapping:a.mapping}).expect(200);
    const gate=await eth.a.post(`/api/imports/${a.id}/check`).set("X-CSRF-Token",eth.token).expect(422);
    assert.equal(gate.body.error,"EVENT_CHOICES_REQUIRED");
    const inventory=(await eth.a.post(`/api/imports/${a.id}/event-codes`).set("X-CSRF-Token",eth.token).send({mapping:a.mapping}).expect(200)).body;
    assert.equal(inventory.items.find((x:any)=>x.code==="CHG").count,2);
    assert.ok(inventory.items.every((x:any)=>x.sample.cells && x.sample.line && x.refs.length));
    a.mapping=structuredClone(original);
    assert.deepEqual((await check(eth,a)).counts,{info:0,warning:0,error:0});
    a.mapping.event_code_map.UDT="PLANNED_STOP";
    await check(eth,a);await approve(eth,a.id,0);
    const b=await upload(eth,"ethmar-plastics/00_baseline",name,mutate);
    const bCheck=await check(eth,b);
    assert.equal(bCheck.duplicateOf,null);
    assert.equal(bCheck.duplicateReason,"MAPPING_DIFFERS");
    assert.equal(bCheck.replacementOrders.length,2);
    const bApproved=await approve(eth,b.id,2);
    assert.equal(bApproved.replacementCount,2);
    assert.equal(bApproved.replacedOrders.length,2);
    const againA=await upload(eth,"ethmar-plastics/00_baseline",name,mutate);
    againA.mapping.event_code_map.UDT="PLANNED_STOP";
    assert.equal((await check(eth,againA)).duplicateOf,null);
    await approve(eth,againA.id,2);
    const duplicate=await upload(eth,"ethmar-plastics/00_baseline",name,mutate);
    duplicate.mapping.event_code_map.UDT="PLANNED_STOP";
    assert.ok((await check(eth,duplicate)).duplicateOf);
    await eth.a.post(`/api/imports/${duplicate.id}/approve`).set("X-CSRF-Token",eth.token).send({replacementCount:2,confirmReplacement:true}).expect(409);
    const ignored=await upload(eth,"ethmar-plastics/00_baseline",name,mutate);
    delete ignored.mapping.event_code_map.UDT;
    await check(eth,ignored);
    const report=(await eth.a.get(`/api/imports/${ignored.id}/issues/1`).expect(200)).body;
    const entry=report.items.find((i:any)=>i.code==="UNMAPPED_EVENT_CODE").details.eventCodes[0];
    assert.equal(entry.ignored,true);assert.equal(entry.count,1);assert.ok(entry.chosenBy && entry.chosenAt && entry.refs.length);
    ignored.mapping=structuredClone(original);
    assert.deepEqual((await check(eth,ignored)).counts,{info:0,warning:0,error:0});
    assert.equal((await eth.a.get(`/api/imports/${ignored.id}/issues/1`).expect(200)).body.total,0);
    // Different bytes replace the version; the old file set becomes reusable.
    const changed=await upload(eth,"ethmar-plastics/00_baseline",name,files=>{mutate(files);files.forEach(f=>{f.bytes=Buffer.concat([f.bytes,Buffer.from("\n")]);});});
    await check(eth,changed);await approve(eth,changed.id,2);
    const fullyOld=await upload(eth,"ethmar-plastics/00_baseline",name,mutate);
    assert.equal((await check(eth,fullyOld)).duplicateReason,"FULLY_SUPERSEDED");
    await approve(eth,fullyOld.id,2);
    const errorCase=await upload(eth,"ethmar-plastics/07_missing_scrap_value",name+"-error",mutate);
    const checked=await check(eth,errorCase);assert.ok(checked.counts.error>0);
    const deny=await eth.a.post(`/api/imports/${errorCase.id}/approve`).set("X-CSRF-Token",eth.token).send({replacementCount:0,confirmReplacement:false}).expect(409);
    assert.equal(deny.body.error,"ERROR_CONFIRMATION_REQUIRED");assert.ok(deny.body.details.errors.length);
    assert.equal((await approve(eth,errorCase.id,0)).status,"approved");
  });
  await t.test("Ethmar baseline: exact checked numbers and no draft canonical rows",async()=>{
    first=await upload(eth,"ethmar-plastics/00_baseline");
    const r=await check(eth,first);
    assert.equal(r.result.runs["E-01"].volume.scrap_rate_pct,"5");
    assert.equal(r.result.runs["E-02"].changeover.minutes,"360");
    assert.equal(r.result.runs["E-02"].downtime.minutes,"45");
    await withTenant(eth.user,eth.factory,async db=>assert.equal((await db.query("SELECT id FROM orders WHERE source_name=$1",[source])).rowCount,0));
    if(!r.duplicateOf) assert.equal((await approve(eth,first.id,0)).status,"approved");
  });
  await t.test("scenario20 cannot be approved twice; cross-factory visibility denied; viewer denied",async()=>{
    const dupe=await upload(eth,"ethmar-plastics/20_duplicate_file_upload");
    assert.ok((await check(eth,dupe)).duplicateOf);
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
    if(!r.duplicateOf) await approve(najm,u.id,0);
    const sameBytes=await upload(najm,"ethmar-plastics/00_baseline",source+"-cross-factory-bytes");
    const sameChecked=await check(najm,sameBytes);
    if(!sameChecked.duplicateOf) {
      await approve(najm,sameBytes.id,0);
    } else {
      const own=await najm.a.get(`/api/imports/${sameChecked.duplicateOf}`).expect(200);
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
    const qualityEvidence:any[]=[];
    const metricEvidence:any[]=[];
    const sourceEvidence:any[]=[];
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
        assert.equal((await who.a.get("/api/quality").query({source:`${source}-${name}`}).expect(200)).body.total,0,"checked imports excluded");
        assert.equal((await who.a.get("/api/runs").query({source:`${source}-${name}`}).expect(200)).body.total,0);
        for(const key of ["capability_level","runs","comparison","file_issues","formula_like_cells"]) assert.deepEqual(r.result[key],exp[key],`${dataset}/${name}/${key}`);
        if(!r.duplicateOf) {
          const approved=await approve(who,u.id,r.replacementCount);
          assert.deepEqual(approved.result,r.result);
          await withTenant(who.user,who.factory,async db=>{
            const stored=await db.query("SELECT metrics FROM orders WHERE current_import_id=$1",[u.id]);
            assert.equal(stored.rowCount,Object.keys(r.result.runs).length);
          });
        }
        const qp=(await who.a.get("/api/quality").query({source:`${source}-${name}`}).expect(200)).body;
        const expectedStatuses=Object.values(exp.runs).map((run:any)=>run.overall);
        for(const color of ["green","yellow","red"]) assert.equal(qp.summary.orders[color],expectedStatuses.filter(s=>s===color).length);
        const allItems=[...qp.items];
        for(let p=2;(p-1)*20<qp.total;p++) allItems.push(...(await who.a.get("/api/quality").query({source:`${source}-${name}`,page:p}).expect(200)).body.items);
        const issueSet=new Set<string>();
        for(const issue of allItems) {
          issueSet.add(`${issue.code}:${issue.severity}`);
          if(issue.orderId) {
            const run=exp.runs[issue.orderId];
            assert.equal(issue.overallStatus,run.overall);
            for(const group of ["volume","changeover","downtime"]) assert.equal(issue.groupStatuses[group],run[group].status);
          }
          const detail=(await who.a.get(`/api/quality/${issue.id}`).expect(200)).body;
          assert.equal(detail.id,issue.id);
          const other=dataset==="najm-packaging"?eth:najm;
          await other.a.get(`/api/quality/${issue.id}`).expect(404);
          if(dataset==="ethmar-plastics") await viewer.a.get(`/api/quality/${issue.id}`).expect(200);
        }
        const expectedIssues=[...new Set<string>([...Object.values(exp.runs).flatMap((run:any)=>run.issues),...exp.file_issues])].sort();
        assert.deepEqual([...issueSet].sort(),expectedIssues);
        const errors=(await who.a.get("/api/quality").query({source:`${source}-${name}`,severity:"error"}).expect(200)).body;
        assert.equal(errors.total,allItems.filter(i=>i.severity==="error").length);
        assert.ok(errors.items.every((i:any)=>i.severity==="error"));
        qualityEvidence.push({scenario:`${dataset}/${name}`,expected:{issues:expectedIssues,statuses:expectedStatuses},actual:{issues:[...issueSet].sort(),summary:qp.summary,groups:allItems.map(i=>({order:i.orderId,statuses:i.groupStatuses,overall:i.overallStatus}))},status:"PASS"});
        metricEvidence.push(...await verifyRunMetrics(who,dataset==="najm-packaging"?eth:najm,dataset==="ethmar-plastics"?viewer:null,`${source}-${name}`,exp,`${dataset}/${name}`));
        sourceEvidence.push(...await verifySourceDetail(who,dataset==="najm-packaging"?eth:najm,dataset==="ethmar-plastics"?viewer:null,`${source}-${name}`,`${dataset}/${name}`));
      }
    }
    mkdirSync(root+"generated-artifacts/phase5",{recursive:true});
    writeFileSync(root+"generated-artifacts/phase5/scenarios.json",JSON.stringify(qualityEvidence,null,2));
    mkdirSync(root+"generated-artifacts/phase6",{recursive:true});
    writeFileSync(root+"generated-artifacts/phase6/scenario-metrics.json",JSON.stringify(metricEvidence,null,2));
    mkdirSync(root+"generated-artifacts/phase7",{recursive:true});
    writeFileSync(root+"generated-artifacts/phase7/source-metrics.json",JSON.stringify(sourceEvidence,null,2));
  });
});
