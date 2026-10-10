import {D} from "@workspace/calculation";
import type {ProductionRun,RunMetric} from "@workspace/api-zod";
import {NBSP,unitWord} from "./number-format";
export function runLabels(a:ProductionRun,b:ProductionRun) {
  const qualify=a.sourceName!==b.sourceName;
  return [a,b].map(r=>qualify?`${r.orderId} [${r.sourceName}]`:r.orderId);
}
// Server-owned bilingual templates. Only engine-derived, display-rounded facts.
export function summary(a:ProductionRun,b:ProductionRun,diffs:RunMetric[]) {
  const delta=diffs.find(m=>m.key==="scrap_rate_pct")!;
  const [aa,bb]=runLabels(a,b);
  if(delta.display===null) return {
    en:"Scrap rates cannot be compared. Review the volume issues; unaffected groups remain available.",
    ar:"لا يمكن مقارنة نسب الهدر. راجع مشكلات الكميات؛ تبقى المجموعات غير المتأثرة متاحة.",
  };
  const n=new D(delta.display),v=n.abs().toFixed();
  if(n.isZero()) return {
    en:`${bb} and ${aa} have the same scrap rate at the displayed precision.`,
    ar:`نسبة الهدر في ${bb} و${aa} متساوية وفق دقة العرض.`,
  };
  return n.gt(0)?{
    en:`${bb} had ${v}${NBSP}${unitWord(v,"pp","en",{style:"long"})} more scrap than ${aa}.`,
    ar:`كانت نسبة الهدر في ${bb} أعلى من ${aa} بمقدار ${v}${NBSP}${unitWord(v,"pp","ar",{case:"gen"})}.`,
  }:{
    en:`${bb} had ${v}${NBSP}${unitWord(v,"pp","en",{style:"long"})} less scrap than ${aa}.`,
    ar:`كانت نسبة الهدر في ${bb} أقل من ${aa} بمقدار ${v}${NBSP}${unitWord(v,"pp","ar",{case:"gen"})}.`,
  };
}
export function questions(a:ProductionRun,b:ProductionRun,diffs:RunMetric[]) {
  const change=diffs.find(m=>m.key==="changeover_min")!;
  const stopA=a.metrics.find(m=>m.key==="downtime_min")!,stopB=b.metrics.find(m=>m.key==="downtime_min")!;
  const [aa,bb]=runLabels(a,b);
  const waste={key:"scrap",metricKey:"scrap_rate_pct",...summary(a,b,diffs)};
  const changeAnswer=change.display===null?{
    en:"Changeover time is not available for this comparison. Review the changeover issues.",
    ar:"زمن تغيير القالب غير متاح لهذه المقارنة. راجع مشكلات تغيير القالب.",
  }:{
    en:`Changeover difference (${bb} minus ${aa}): ${change.display}${NBSP}${unitWord(change.display,"min","en",{style:"long"})} (${change.hours}${NBSP}${unitWord(change.hours??"","h","en",{style:"long"})}).`,
    ar:`فرق زمن تغيير القالب (${bb} ناقص ${aa}): ${change.display}${NBSP}${unitWord(change.display,"min","ar")} (${change.hours}${NBSP}${unitWord(change.hours??"","h","ar")}).`,
  };
  const stopAnswer={
    en:`Unplanned downtime: ${aa}: ${stopA.display??"Not available"}${stopA.available?NBSP+unitWord(stopA.display??"","min","en",{style:"long"}):""}; ${bb}: ${stopB.display??"Not available"}${stopB.available?NBSP+unitWord(stopB.display??"","min","en",{style:"long"}):""}. Recorded separately, never added to changeover.`,
    ar:`التوقف غير المخطط: ${aa}: ${stopA.display??"غير متوفر"}${stopA.available?NBSP+unitWord(stopA.display??"","min","ar"):""}؛ ${bb}: ${stopB.display??"غير متوفر"}${stopB.available?NBSP+unitWord(stopB.display??"","min","ar"):""}. مسجّل بشكل منفصل ولا يُضاف إلى زمن تغيير القالب.`,
  };
  return [waste,{key:"changeover",metricKey:"changeover_min",...changeAnswer},{key:"downtime",metricKey:"downtime_min",...stopAnswer}];
}
