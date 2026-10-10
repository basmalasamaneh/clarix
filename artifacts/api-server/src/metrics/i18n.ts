import {D} from "@workspace/calculation";
import type {ProductionRun,RunMetric} from "@workspace/api-zod";
// Server-owned bilingual templates. Only engine-derived, display-rounded facts.
export function summary(a:ProductionRun,b:ProductionRun,diffs:RunMetric[]) {
  const delta=diffs.find(m=>m.key==="scrap_rate_pct")!;
  const aa=`${a.orderId} (${a.sourceName})`,bb=`${b.orderId} (${b.sourceName})`;
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
    en:`${bb} had ${v} percentage points more scrap than ${aa}.`,
    ar:`كانت نسبة الهدر في ${bb} أعلى من ${aa} بمقدار ${v} نقاط مئوية.`,
  }:{
    en:`${bb} had ${v} percentage points less scrap than ${aa}.`,
    ar:`كانت نسبة الهدر في ${bb} أقل من ${aa} بمقدار ${v} نقاط مئوية.`,
  };
}
export function questions(a:ProductionRun,b:ProductionRun,diffs:RunMetric[]) {
  const change=diffs.find(m=>m.key==="changeover_min")!;
  const stopA=a.metrics.find(m=>m.key==="downtime_min")!,stopB=b.metrics.find(m=>m.key==="downtime_min")!;
  const aa=`${a.orderId} (${a.sourceName})`,bb=`${b.orderId} (${b.sourceName})`;
  const waste={key:"scrap",metricKey:"scrap_rate_pct",...summary(a,b,diffs)};
  const changeAnswer=change.display===null?{
    en:"Changeover time is not available for this comparison. Review the changeover issues.",
    ar:"زمن تغيير القالب غير متاح لهذه المقارنة. راجع مشكلات تغيير القالب.",
  }:{
    en:`Changeover difference (${bb} minus ${aa}): ${change.display} minutes (${change.hours} hours).`,
    ar:`فرق زمن تغيير القالب (${bb} ناقص ${aa}): ${change.display} دقيقة (${change.hours} ساعة).`,
  };
  const stopAnswer={
    en:`Unplanned downtime: ${aa}: ${stopA.display??"Not available"}${stopA.available?" minutes":""}; ${bb}: ${stopB.display??"Not available"}${stopB.available?" minutes":""}. Recorded separately, never added to changeover.`,
    ar:`التوقف غير المخطط: ${aa}: ${stopA.display??"غير متوفر"}${stopA.available?" دقيقة":""}؛ ${bb}: ${stopB.display??"غير متوفر"}${stopB.available?" دقيقة":""}. مسجّل بشكل منفصل ولا يُضاف إلى زمن تغيير القالب.`,
  };
  return [waste,{key:"changeover",metricKey:"changeover_min",...changeAnswer},{key:"downtime",metricKey:"downtime_min",...stopAnswer}];
}
