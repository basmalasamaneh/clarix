import assert from "node:assert/strict";
import {D,fmt,displayNumber,minutesToHoursDisplay} from "@workspace/calculation";
import {definitions} from "../metrics/values";
import {verifyCharts} from "./verify-charts";

// Called only inside the guarded real import pipeline suite. No fixture writes.
export async function verifyRunMetrics(who:any,other:any,viewer:any,source:string,exp:any,scenario:string) {
  const list=(await who.a.get("/api/runs").query({source}).expect(200)).body;
  assert.equal(list.total,Object.keys(exp.runs).length,"T1: only this factory/source's current orders");
  const evidence:any[]=[];
  for(const run of list.items) {
    assert.equal(run.sourceName,source);
    const expected=exp.runs[run.orderId];
    assert.ok(expected);
    assert.equal(run.overall,expected.overall);
    const detail=(await who.a.get(`/api/runs/${run.id}`).expect(200)).body;
    assert.deepEqual(detail,run,"T2: list and direct lookup agree");
    await other.a.get(`/api/runs/${run.id}`).expect(404); // T3
    await other.a.get(`/api/imports/${run.importId}`).expect(404); // T4 import
    if(viewer) await viewer.a.get(`/api/runs/${run.id}`).expect(200);
    for(const def of definitions) {
      const actual=run.metrics.find((m:any)=>m.key===def.key);
      const group=expected[def.group];
      const value=def.group!=="volume"&&group.status==="red"?null:group[def.field];
      const display=value===null?null:def.unit==="pct"?displayNumber(value):value;
      assert.equal(actual.value,value,`${scenario}/${run.orderId}/${def.key}`);
      assert.equal(actual.display,display);
      assert.equal(actual.hours,value!==null&&def.unit==="min"?minutesToHoursDisplay(value):null);
      assert.equal(actual.available,value!==null);
      assert.equal(actual.status,group.status);
      for(const ref of actual.refs) {
        assert.equal(ref.importId,run.importId);
        assert.equal(ref.runId,run.id);
        assert.equal(ref.sourceName,source);
        assert.equal(ref.orderId,run.orderId);
        assert.ok(ref.file&&ref.column&&Number.isInteger(ref.line)&&ref.line>=2);
        const lineage=ref.kind==="included"?group.source_lines:ref.kind==="excluded"?group.excluded_source_lines:group.quarantined_source_lines;
        assert.ok(lineage.includes(`${ref.file}:${ref.line}`));
      }
      if(actual.available && actual.value!=="0") assert.ok(actual.refs.length,"every nonzero value has source columns");
      evidence.push({scenario,metric:`${run.orderId} (${source}) / ${def.key}`,expected:display,actual:actual.display,result:"PASS"});
    }
  }
  const [left,right]=exp.comparison.pair.map((orderId:string)=>list.items.find((r:any)=>r.orderId===orderId));
  const result=(await who.a.get("/api/comparison").query({a:left.id,b:right.id}).expect(200)).body;
  const reverse=(await who.a.get("/api/comparison").query({a:right.id,b:left.id}).expect(200)).body;
  verifyCharts(result,exp,scenario);
  verifyCharts(reverse,exp,`${scenario}/reversed`);
  assert.equal(result.a.id,left.id);assert.equal(result.b.id,right.id);
  assert.equal(result.questions.length,3);
  for(const q of result.questions) {
    assert.ok(q.en&&q.ar);
    assert.ok(result.differences.some((m:any)=>m.key===q.metricKey));
  }
  await other.a.get("/api/comparison").query({a:left.id,b:right.id}).expect(404);
  await who.a.get("/api/comparison").query({a:left.id,b:left.id}).expect(400);
  if(viewer) await viewer.a.get("/api/comparison").query({a:left.id,b:right.id}).expect(200);
  const engineKey:Record<string,string>={scrap_rate_pct:"scrap_rate_pp",good_rate_pct:"good_rate_pp",changeover_min:"changeover_min",downtime_min:"downtime_min"};
  for(const def of definitions) {
    const a=exp.runs[left.orderId][def.group],b=exp.runs[right.orderId][def.group];
    const available=(def.group==="volume"&&def.unit!=="pct"||(a.status!=="red"&&b.status!=="red"))&&a[def.field]!==null&&b[def.field]!==null;
    const value=available?fmt(new D(b[def.field]).sub(a[def.field])):null;
    const actual=result.differences.find((m:any)=>m.key===def.key);
    assert.equal(actual.value,value);
    if(engineKey[def.key]) {
      assert.equal(actual.value,exp.comparison.metrics[engineKey[def.key]].value,"locked golden difference");
      assert.equal(actual.available,exp.comparison.metrics[engineKey[def.key]].comparable);
    }
    const rounded=value===null?null:def.unit==="pct"?displayNumber(value):value;
    const display=rounded!==null&&new D(rounded).gt(0)?`+${rounded}`:rounded;
    assert.equal(actual.display,display);
    const reversed=reverse.differences.find((m:any)=>m.key===def.key);
    assert.equal(reversed.value,value===null?null:fmt(new D(value).neg()));
    evidence.push({scenario,metric:`B − A / ${def.key}`,expected:display,actual:actual.display,result:"PASS"});
  }
  assert.equal(result.hasBlockedGroups,Object.values(result.groups).includes("red"));
  assert.equal(result.hasWarnings,[...result.a.issues,...result.b.issues].some((i:any)=>i.severity==="warning"));
  const filtered=(await who.a.get("/api/runs").query({source,status:left.overall,search:left.orderId,sort:"status"}).expect(200)).body;
  assert.ok(filtered.items.every((r:any)=>r.overall===left.overall&&r.orderId.includes(left.orderId)));
  if(scenario==="ethmar-plastics/00_baseline") {
    assert.equal(result.a.metrics.find((m:any)=>m.key==="scrap_rate_pct").display,"5");
    assert.equal(result.b.metrics.find((m:any)=>m.key==="scrap_rate_pct").display,"10");
    assert.equal(result.differences.find((m:any)=>m.key==="scrap_rate_pct").display,"+5");
    assert.equal(result.differences.find((m:any)=>m.key==="changeover_min").display,"+120");
    assert.equal(result.differences.find((m:any)=>m.key==="changeover_min").hours,"+2");
    assert.equal(result.b.metrics.find((m:any)=>m.key==="downtime_min").display,"45");
    assert.ok(result.questions[1].en.includes("+120\u00a0minutes (+2\u00a0hours)"));
    assert.ok(result.questions[2].en.includes("45\u00a0minutes"));
  }
  return evidence;
}
