import assert from "node:assert/strict";
import type {AiAssistInput,ProductionRun} from "@workspace/api-zod";
import {definitions} from "../metrics/values";
export async function verifyAiIntents(who:any,other:any,source:string,expected:any){
 const call=async(input:Partial<AiAssistInput>)=>(await who.a.post("/api/ai/assist").set("X-CSRF-Token",who.token)
  .send({task:"ask",language:"en",...input}).expect(200)).body;
 const runs:ProductionRun[]=(await who.a.get("/api/runs").query({source}).expect(200)).body.items;
 for(const severity of [undefined,"error","warning","info"] as const){
  const guidance=await call({task:"quality",source,severity});
  const list=(await who.a.get("/api/quality").query({source,...(severity?{severity}:{})}).expect(200)).body;
  assert.equal(guidance.total,list.total,"quality guidance respects the current source and severity");
  if(guidance.total<=20)assert.deepEqual(new Set(guidance.blocks.map((b:any)=>b.id)),new Set(list.items.map((i:any)=>i.id)));
 }
 for(const run of runs){
  const exp=expected.runs[run.orderId];assert.ok(exp);
  for(const metric of ["scrap_rate_pct","scrap_kg","changeover_min","downtime_min"] as const){
   const def=definitions.find(d=>d.key===metric)!;
   const wanted=exp[def.group].status==="red"?null:exp[def.group][def.field];
   for(const language of ["en","ar"] as const){
    const r=await call({intent:"metric",runId:run.id,metric,language});
    assert.equal(r.status,"code");assert.equal(r.blocks[0].facts[0].value,wanted);
    if(wanted===null)assert.match(r.blocks[0].text,/Not available|غير متوفر/);
   }
  }
  const status=await call({intent:"status",runId:run.id});assert.equal(status.blocks.length,1);
  const issues=await call({intent:"issues",runId:run.id});
  for(const b of issues.blocks)assert.ok(b.text.includes("What to check:"));
  const causal=await call({intent:"causal",runId:run.id});
  assert.match(causal.blocks[0].text,/does not assume causes/);
  assert.ok(causal.blocks.filter((b:any)=>b.type==="HYPOTHESIS").every((b:any)=>b.title==="Possible explanation to check"));
  await other.a.post("/api/ai/assist").set("X-CSRF-Token",other.token).send({task:"ask",language:"en",intent:"metric",runId:run.id}).expect(404);
 }
 if(runs.length>=2){
  const r=await call({intent:"compare",a:runs[0].id,b:runs[1].id});
  for(const fact of r.blocks.flatMap((b:any)=>b.facts)){
   if(!/^[ab]\./.test(fact.id))continue;
   const [side,key]=fact.id.split("."),run=runs[side==="a"?0:1],def=definitions.find(d=>d.key===key)!;
   assert.equal(fact.value,expected.runs[run.orderId][def.group].status==="red"?null:expected.runs[run.orderId][def.group][def.field]);
  }
 }
 const counts=await call({intent:"counts"}),o=(await who.a.get("/api/overview").expect(200)).body;
 assert.ok(counts.blocks[0].text.includes(`Approved imports: ${o.approvedImports}.`));
 assert.ok(counts.blocks[0].text.includes(`Current runs: ${o.currentOrders}.`));
 for(const status of ["red","yellow"] as const){
  const result=await call({intent:"runs",status}),list=(await who.a.get("/api/runs").query({status,sort:"status"}).expect(200)).body;
  assert.equal(result.total,list.total);assert.deepEqual(result.blocks.map((b:any)=>b.id),list.items.map((r:any)=>r.id));
 }
 const next=await call({task:"next"});assert.ok(next.blocks.length<=3);
 for(const direction of ["highest","lowest"] as const){
  const extreme=await call({intent:"extreme",direction,metric:"scrap_rate_pct"});
  assert.ok(extreme.blocks.length<=1);
  if(extreme.blocks.length){assert.notEqual(extreme.blocks[0].facts[0].status,"red");assert.notEqual(extreme.blocks[0].facts[0].value,null);}
 }
}
