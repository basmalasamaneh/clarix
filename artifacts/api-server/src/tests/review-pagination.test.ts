import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import app from "../app";
import {sessionStore} from "../lib/session";
import {closeTenantPools,withTenant} from "../lib/tenancy";
import {insertCanonicalBatch} from "../imports/canonical-batch";
after(async()=>{sessionStore.close();await closeTenantPools();});
const mapping=JSON.parse(readFileSync(fileURLToPath(new URL("../../../../test-data/ethmar-plastics/00_baseline/mapping.json",import.meta.url)),"utf8"));
async function login(email:string) {
  const a=request.agent(app),s=await a.get("/api/auth/session");
  const r=await a.post("/api/auth/login").set("X-CSRF-Token",s.body.csrfToken).send({email,password:process.env.SEED_TEST_PASSWORD}).expect(200);
  return {a,token:r.body.csrfToken,user:r.body.user.id,factory:r.body.activeFactoryId};
}
function synthetic(scrap=5) {
  const orders=["order_id,product_code,line_id,machine_id,mold_id"];
  const records=["record_id,order_id,machine_id,mold_id,shift,record_date,material_input,good_output,scrap,unit"];
  const events=["event_id,order_id,machine_id,mold_id,shift,event_code,start_time,end_time,duration_min,recorded_reason"];
  for(let i=1;i<=25;i++){
    const order=`E-${String(i).padStart(2,"0")}`;
    orders.push(`${order},P,L,M,D`);
    records.push(`COLLISION-${i},${order},M,D,S,2026-01-01,100,${100-scrap},${scrap},kg`);
    events.push(`COLLISION-EVENT-${i},${order},M,D,S,CHG,2026-01-01 08:00,2026-01-01 09:00,60,Change`);
  }
  // 25 explicit ignored codes, with 25 rows for the first code.
  for(let i=0;i<25;i++)for(let n=0;n<(i===0?25:1);n++)
    events.push(`IGN-${i}-${n},E-01,M,D,${n},IGN-${String(i).padStart(2,"0")},2026-01-01 10:00,2026-01-01 10:01,1,Ignored`);
  return [orders,records,events].map((lines,i)=>({name:["orders.csv","production_records.csv","events.csv"][i],bytes:Buffer.from(lines.join("\n")+"\n")}));
}
test("canonical INSERT batches have a hard 1000-row maximum and keep decimal strings",async()=>{
  const calls:any[]=[];
  const ctx:any={factory:"f",db:{query:async(...args:any[])=>{calls.push(args);return {rows:[]};}}};
  await insertCanonicalBatch(ctx,"s","o","records",Array.from({length:2001},()=>({input:"0.123456789123456789"})));
  assert.deepEqual(calls.map(c=>JSON.parse(c[1][3]).length),[1000,1000,1]);
  assert.equal(JSON.parse(calls[0][1][3])[0].input,"0.123456789123456789");
});
test("bounded review pages, stable complete traversal and actual HTTP cross-factory record collisions",async()=>{
  const eth=await login("ethmar.manager@clarix.test"),najm=await login("najm.manager@clarix.test");
  const source="phase9b-review-collisions";
  const configured={...mapping,ignored_event_codes:Array.from({length:25},(_,i)=>`IGN-${String(i).padStart(2,"0")}`)};
  async function upload(w:typeof eth,scrap=5,sourceName=source){
    const files=synthetic(scrap);
    const d=(await w.a.post("/api/imports").set("X-CSRF-Token",w.token).send({sourceName,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))}).expect(201)).body;
    for(const f of files)assert.equal((await fetch(d.files.find((x:any)=>x.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)})).ok,true);
    await w.a.post(`/api/imports/${d.id}/finalize`).set("X-CSRF-Token",w.token).expect(200);
    await w.a.put(`/api/imports/${d.id}/mapping`).set("X-CSRF-Token",w.token).send({mapping:configured}).expect(200);
    return (await w.a.post(`/api/imports/${d.id}/check`).set("X-CSRF-Token",w.token).expect(200)).body;
  }
  async function page(w:typeof eth,id:string,kind:string,p=1,extra:Record<string,unknown>={}){
    const data=(await w.a.post(`/api/imports/${id}/review-page`).set("X-CSRF-Token",w.token).send({kind,page:p,...extra}).expect(200)).body;
    assert.ok(data.items.length<=20,`${kind}: hard maximum`);assert.equal(data.pageSize,20);return data;
  }
  async function approve(w:typeof eth,d:any){
    return (await w.a.post(`/api/imports/${d.id}/approve`).set("X-CSRF-Token",w.token).send({confirmReplacement:true,replacementCount:d.replacementCount,confirmErrors:true}).expect(200)).body;
  }
  const first=await upload(eth);
  assert.equal(Object.keys(first.result.runs).length,20);
  const codes=await page(eth,first.id,"eventCodes"),codes2=await page(eth,first.id,"eventCodes",2);
  assert.equal(codes.total,26);assert.equal(codes2.items.length,6);
  assert.equal(new Set([...codes.items,...codes2.items].map(x=>x.code)).size,26);
  assert.equal((await page(eth,first.id,"eventCodeRefs",2,{code:"IGN-00"})).items.length,5);
  const outer=(await eth.a.get(`/api/imports/${first.id}/issues/1`).expect(200)).body;
  for(const item of outer.items){assert.ok(item.refs.length<=20);assert.ok(item.details.rows.length<=20);assert.ok(item.details.eventCodes.length<=20);}
  const warning=outer.items.find((x:any)=>x.code==="UNMAPPED_EVENT_CODE");
  assert.ok(warning?.id);
  const rows=await page(eth,first.id,"issueRows",1,{issueId:warning.id}),rows2=await page(eth,first.id,"issueRows",2,{issueId:warning.id});
  assert.ok(rows.total>20);assert.equal(rows2.items.length,20);
  assert.equal(new Set([...rows.items,...rows2.items].map(x=>`${x.file}:${x.line}`)).size,40);
  assert.equal((await page(eth,first.id,"issueCodes",2,{issueId:warning.id})).items.length,5);
  assert.equal((await page(eth,first.id,"issueCodeRefs",2,{issueId:warning.id,code:"IGN-00"})).items.length,5);
  for(const bad of [0,-1,1000001])await eth.a.post(`/api/imports/${first.id}/review-page`).set("X-CSRF-Token",eth.token).send({kind:"eventCodes",page:bad}).expect(400);
  await approve(eth,first);
  const before=(await eth.a.get("/api/runs").query({source}).expect(200)).body;
  const a=before.items.find((x:any)=>x.orderId==="E-01"),b=before.items.find((x:any)=>x.orderId==="E-02");
  const comparison=(await eth.a.get("/api/comparison").query({a:a.id,b:b.id}).expect(200)).body;
  const other=await upload(najm,10);await approve(najm,other);
  assert.deepEqual((await eth.a.get("/api/runs").query({source}).expect(200)).body,before);
  assert.deepEqual((await eth.a.get("/api/comparison").query({a:a.id,b:b.id}).expect(200)).body,comparison);
  const own=(await najm.a.get("/api/runs").query({source}).expect(200)).body;
  assert.equal(own.total,25);assert.equal(before.total,25);
  const otherRun=own.items.find((x:any)=>x.orderId==="E-01");
  await eth.a.get("/api/comparison").query({a:a.id,b:otherRun.id}).expect(404);
  await najm.a.post(`/api/imports/${first.id}/review-page`).set("X-CSRF-Token",najm.token).send({kind:"issueRows",issueId:warning.id}).expect(404);
  await najm.a.post(`/api/imports/${other.id}/review-page`).set("X-CSRF-Token",najm.token).send({kind:"issueRows",issueId:warning.id}).expect(404);
  const recordSets=[];
  for(const w of [eth,najm])recordSets.push(await withTenant(w.user,w.factory,async db=>(await db.query("SELECT record_id FROM production_records WHERE factory_id=$1 AND source_name=$2 ORDER BY record_id",[w.factory,source])).rows.map(r=>r.record_id)));
  assert.equal(recordSets[0].length,25);assert.deepEqual(recordSets[0],recordSets[1]);
  const replacement=await upload(eth,6);
  assert.equal(replacement.replacementCount,25);assert.equal(replacement.replacementOrders.length,20);
  assert.equal((await page(eth,replacement.id,"replacementOrders",2)).items.length,5);
  const approved=await approve(eth,replacement);
  assert.equal(approved.replacedOrders.length,20);
  assert.equal(approved.reviewCounts.replacedOrders,25);
  assert.equal((await page(eth,replacement.id,"replacedOrders",2)).items.length,5);
  assert.equal((await page(eth,replacement.id,"resultRuns",2)).items.length,5);
  const refs=await page(eth,replacement.id,"resultRefs",2,{path:["runs","E-01","downtime","excluded_source_lines"]});
  assert.ok(refs.total>20);assert.equal(refs.items.length,20);
  const separate=await upload(eth,6,source+"-separate");
  assert.equal(separate.otherSourceOrders.length,20);
  assert.equal(separate.reviewCounts.otherSourceOrders,25);
  assert.equal((await page(eth,separate.id,"otherSourceOrders",2)).items.length,5);
  const differences=await upload(eth,6);
  const changed={...configured,ignored_event_codes:[],event_code_map:{...configured.event_code_map,...Object.fromEntries(configured.ignored_event_codes.map((code:string)=>[code,"PLANNED_STOP"]))}};
  await eth.a.put(`/api/imports/${differences.id}/mapping`).set("X-CSRF-Token",eth.token).send({mapping:changed}).expect(200);
  const checked=(await eth.a.post(`/api/imports/${differences.id}/check`).set("X-CSRF-Token",eth.token).expect(200)).body;
  assert.equal(checked.settingsDifferences.length,20);
  assert.equal(checked.reviewCounts.settingsDifferences,25);
  assert.equal((await page(eth,differences.id,"settingsDifferences",2)).items.length,5);
});
