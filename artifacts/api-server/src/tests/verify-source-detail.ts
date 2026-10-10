import assert from "node:assert/strict";
import {D,fmt,parseCsv,decodeBytes,detectDelimiter} from "@workspace/calculation";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
export async function verifySourceDetail(who:any,other:any,viewer:any,source:string,scenario:string) {
  const runs=(await who.a.get("/api/runs").query({source}).expect(200)).body.items;
  const evidence:any[]=[];
  for(const run of runs) for(const metric of run.metrics) {
    const query={kind:"metric",id:run.id,metric:metric.key};
    const d=(await who.a.get("/api/source-detail").query(query).expect(200)).body;
    assert.equal(d.value,metric.value);assert.equal(d.display,metric.display);
    assert.equal(d.imports[0].id,run.importId);assert.equal(d.imports[0].sourceName,source);
    if(metric.value!==null&&["input_kg","good_kg","scrap_kg","changeover_min","downtime_min"].includes(metric.key)) {
      let rows=[...d.rows];
      for(let p=2;rows.length<d.total;p++) rows.push(...(await who.a.get("/api/source-detail").query({...query,page:p}).expect(200)).body.rows);
      const included=rows.filter((r:any)=>r.kind==="included").flatMap((r:any)=>r.contributions.filter((c:any)=>c.key===metric.key));
      assert.ok(included.every((c:any)=>c.value!==null),`${scenario}/${run.orderId}/${metric.key}: contributing row must not be null`);
      assert.equal(fmt(included.reduce((s:any,c:any)=>s.add(c.value),new D(0))),metric.value,`${scenario} ${run.orderId} ${metric.key}: exact row sum`);
    }
    for(const row of d.rows) {
      assert.equal(row.importId,run.importId);
      assert.ok(row.cells.length);
      assert.ok(row.line>=2);
      const bytes=readFileSync(fileURLToPath(new URL(`../../../../test-data/${scenario}/${row.file}`,import.meta.url)));
      const decoded=decodeBytes(bytes,"auto");
      const original=parseCsv(decoded,detectDelimiter(decoded)).rows.find(r=>r.line===row.line);
      assert.ok(original,`${row.file}:${row.line} must be an original physical CSV line`);
      assert.deepEqual(Object.fromEntries(row.cells.map((c:any)=>[c.column,c.value])),original.cells);
      assert.ok(metric.refs.some((ref:any)=>ref.file===row.file&&ref.line===row.line)||d.issues.length>0);
    }
    if(scenario.includes("07_missing")&&run.orderId==="E-02"&&metric.key==="scrap_kg") {
      assert.equal(d.value,null);
      assert.ok(d.rows.some((r:any)=>r.cells.some((c:any)=>c.column==="scrap"&&c.value===""&&c.highlighted)));
    }
    if(scenario.includes("05_suspected")&&run.orderId==="E-02"&&metric.key==="input_kg") {
      assert.ok(d.duplicatePairs.length);
      assert.notEqual(d.duplicatePairs[0].original.id,d.duplicatePairs[0].suspected.id);
      assert.ok(d.alternatives.some((a:any)=>a.key==="exclude_suspected"));
    }
    await other.a.get("/api/source-detail").query(query).expect(404);
    if(viewer) await viewer.a.get("/api/source-detail").query(query).expect(200);
    evidence.push({scenario,order:run.orderId,metric:metric.key,value:d.value,rows:d.total,status:"PASS"});
  }
  if(runs.length>=2) {
    const pair={a:runs[0].id,b:runs[1].id};
    const cmp=(await who.a.get("/api/comparison").query(pair).expect(200)).body;
    for(const metric of cmp.differences) {
      const q={kind:"metric",id:pair.a,other:pair.b,metric:metric.key};
      const d=(await who.a.get("/api/source-detail").query(q).expect(200)).body;
      assert.equal(d.value,metric.value);
      assert.equal(d.imports.length,2);
      await other.a.get("/api/source-detail").query(q).expect(404);
      evidence.push({scenario,order:"B − A",metric:metric.key,value:d.value,rows:d.total,status:"PASS"});
    }
  }
  const issues=(await who.a.get("/api/quality").query({source}).expect(200)).body.items;
  for(const issue of issues) {
    const query={kind:"issue",id:issue.id};
    const detail=(await who.a.get("/api/source-detail").query(query).expect(200)).body;
    assert.ok(detail.issues.some((i:any)=>i.id===issue.id));
    const legacy=(await who.a.get(`/api/quality/${issue.id}`).expect(200)).body;
    for(const row of legacy.rows) {
      const found=detail.rows.find((r:any)=>r.file===row.file&&r.line===row.line);
      if(found) assert.deepEqual(Object.fromEntries(found.cells.map((c:any)=>[c.column,c.value])),row.cells);
    }
    await other.a.get("/api/source-detail").query(query).expect(404);
    if(viewer) await viewer.a.get("/api/source-detail").query(query).expect(200);
  }
  return evidence;
}
