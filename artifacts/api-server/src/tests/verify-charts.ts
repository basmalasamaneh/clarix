import assert from "node:assert/strict";
import {D} from "@workspace/calculation";
import type {RunComparison,Overview} from "@workspace/api-zod";
import {definitions} from "../metrics/values";
import {differences} from "../metrics/values";
import {comparisonCharts} from "../metrics/charts";

// Called for every golden fixture only after real isolated import + approval.
export function verifyCharts(result:RunComparison,expected:any,scenario:string) {
  assert.deepEqual(result.chart_spec.map(c=>c.key),["scrap_rate_pct","changeover_min"]);
  assert.deepEqual(result.indicators.map(c=>c.key),["scrap_rate_pct","good_rate_pct","changeover_min","downtime_min"]);
  for(const spec of [...result.chart_spec,...result.indicators]) {
    const def=definitions.find(d=>d.key===spec.key)!;
    assert.deepEqual(spec.difference,result.differences.find(m=>m.key===spec.key),"chart/table difference parity");
    assert.ok(spec.caption.en&&spec.caption.ar&&spec.howToRead.en&&spec.howToRead.ar);
    assert.ok(spec.axisMax>=1);
    for(const [i,run] of [result.a,result.b].entries()) {
      const p=spec.series[i],table=run.metrics.find(m=>m.key===spec.key)!;
      const group=expected.runs[run.orderId][def.group];
      const golden=def.group!=="volume"&&group.status==="red"?null:group[def.field];
      assert.equal(p.value,golden,`${scenario}/${run.orderId}/${spec.key}: chart = golden`);
      assert.equal(p.value,table.value,`${scenario}: chart = table`);
      assert.equal(p.display,table.display);assert.equal(p.hours,table.hours);
      assert.deepEqual(p.refs,table.refs);
      assert.equal(p.runId,run.id);assert.equal(p.sourceName,run.sourceName);
      assert.equal(p.available,table.available&&table.status!=="red");
      if(!p.available) {
        assert.equal(p.plotValue,null,"unavailable must NEVER plot as zero");
        assert.equal(p.width,null);
        assert.deepEqual(p.frames,[]);
        assert.ok(p.reason.en&&p.reason.ar);
      } else {
        assert.equal(p.plotValue,new D(golden).toNumber());
        assert.ok(new D(p.width!).gte(0)&&new D(p.width!).lte(100));
        assert.equal(p.frames.length,16);assert.equal(p.frames[15],table.display);
      }
    }
  }
  if(scenario.endsWith("/reversed"))return;
  const scrap=result.chart_spec[0],change=result.chart_spec[1];
  if(scenario.endsWith("/00_baseline")&&scenario.startsWith("ethmar")) {
    assert.deepEqual(scrap.series.map(p=>p.value),["5","10"]);
    assert.equal(scrap.difference?.display,"+5");assert.equal(scrap.direction,"higher");
    assert.deepEqual(change.series.map(p=>p.value),["240","360"]);
    assert.deepEqual(change.series.map(p=>p.hours),["4","6"]);
    const stops=result.indicators.find(c=>c.key==="downtime_min")!;
    assert.equal(stops.series[1].value,"45");assert.equal(stops.series[0].value,"0");
    assert.equal(stops.series[0].available,true,"real recorded absence is distinct from missing");
    // Synthetic presentation case: do not silently clamp a legitimate signed
    // stored value just because all golden chart examples are nonnegative.
    const negative=structuredClone(result.a);
    Object.assign(negative.metrics.find(m=>m.key==="scrap_rate_pct")!,{value:"-5",display:"-5"});
    const signed=comparisonCharts(negative,result.b,differences(negative,result.b)).chart_spec[0];
    assert.equal(signed.axisMin,-5);assert.equal(signed.axisMax,10);
    assert.equal(signed.series[0].plotValue,-5);
    assert.ok(new D(signed.series[0].width!).gte(0));
    assert.equal(signed.difference?.value,"15");
  }
  if(/\/(05|07|10)_/.test(scenario)) {
    assert.equal(scrap.series[1].plotValue,null);
    assert.equal(scrap.series[1].available,false);
    if(scenario.includes("/05_"))assert.equal(scrap.series[1].value,"10","preserve approved raw/table value");
    assert.ok(change.series.every(p=>p.available),"unaffected changeover still drawn");
  }
  if(scenario.includes("/23_")) {
    assert.equal(change.series[1].plotValue,null);assert.equal(change.difference?.available,false);
    assert.ok(result.indicators.find(c=>c.key==="downtime_min")!.series.every(p=>p.available));
  }
}

export function verifyOverviewCharts(o:Overview) {
  assert.equal(o.chart_spec.length,1);
  const s=o.chart_spec[0];assert.equal(s.kind,"status_stack");
  for(const p of s.series)assert.equal(p.value,String(o.statuses[p.key as keyof typeof o.statuses]));
  assert.equal(o.indicators.length,o.comparisonRuns.length===2?4:0);
  for(const spec of o.indicators)for(const [index,run] of o.comparisonRuns.entries()) {
    const point=spec.series[index],metric=run.metrics.find(m=>m.key===spec.key)!;
    assert.equal(point.value,metric.value);assert.deepEqual(point.refs,metric.refs);
  }
}
