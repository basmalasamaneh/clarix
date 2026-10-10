import {D,displayNumber} from "@workspace/calculation";
import type {ChartSpec,ChartPoint,ProductionRun,RunMetric,ChartText} from "@workspace/api-zod";
import {runLabels} from "./i18n";
import {NBSP,unitWord} from "./number-format";

const text=(en:string,ar:string):ChartText=>({en,ar});
const titles:Record<string,ChartText>={
  scrap_rate_pct:text("Scrap rate","نسبة الهدر"),
  good_rate_pct:text("Good output rate","نسبة الإنتاج الجيد"),
  changeover_min:text("Changeover time","زمن تغيير القالب"),
  downtime_min:text("Unplanned downtime","التوقف غير المخطط"),
};
const reasons:Record<string,ChartText>={
  SUSPECTED_DUPLICATE_RECORD:text("A production record may be duplicated. Comparison is blocked until reviewed.","قد يكون أحد سجلات الإنتاج مكرراً. المقارنة غير متاحة قبل مراجعته."),
  DUPLICATE_RECORD_ID_CONFLICT:text("Records with the same ID disagree.","تختلف قيم سجلات تحمل المعرّف نفسه."),
  INCOMPATIBLE_UNIT:text("The recorded unit cannot be converted.","لا يمكن تحويل الوحدة المسجلة."),
  MISSING_VALUE:text("A required quantity is missing.","إحدى الكميات المطلوبة مفقودة."),
  ZERO_INPUT:text("Input is zero, so a rate cannot be calculated.","المدخلات صفر، لذلك لا يمكن حساب النسبة."),
  NO_PRODUCTION_RECORDS:text("No production records are available.","لا توجد سجلات إنتاج."),
  NO_CHANGEOVER_EVENT:text("No changeover event is recorded.","لا يوجد حدث مسجل لتغيير القالب."),
  INVALID_TIME_RANGE:text("An event ends before or at its start.","ينتهي أحد الأحداث قبل بدايته أو عندها."),
  DUPLICATE_EVENT_ID_CONFLICT:text("Events with the same ID disagree.","تختلف بيانات أحداث تحمل المعرّف نفسه."),
  MISSING_REQUIRED_FIELD:text("A required source field is missing.","حقل مطلوب في المصدر مفقود."),
  MATERIAL_IMBALANCE:text("Recorded input and output do not balance within the allowed tolerance.","المدخلات والمخرجات المسجلة لا تتوازن ضمن حد السماح."),
};
function reason(run:ProductionRun,m:RunMetric,available:boolean) {
  if(available)return text("","");
  const affected=run.issues.filter(i=>i.group===m.group&&(i.severity==="error"||i.code==="NO_CHANGEOVER_EVENT"));
  const messages=affected.map(i=>reasons[i.code]).filter(Boolean);
  return messages.length?text([...new Set(messages.map(x=>x.en))].join(" "),[...new Set(messages.map(x=>x.ar))].join(" ")):
    text("This value is not available. Review Data Quality.","هذه القيمة غير متاحة. راجع جودة البيانات.");
}
function point(run:ProductionRun,m:RunMetric,key:string,label:string):ChartPoint {
  // Approved Phase12 exception: raw table value survives (e.g. scenario05=10),
  // but a blocked group's chart glyph must be absent, never a zero or hatched bar.
  const available=m.available&&m.status!=="red";
  return {key,label,value:m.value,display:m.display,hours:m.hours,available,status:m.status,
    plotValue:available?new D(m.value!).toNumber():null,width:null,reason:reason(run,m,available),
    refs:m.refs,runId:run.id,sourceName:run.sourceName,noEvents:m.noEvents,
    frames:available?Array.from({length:16},(_,i)=>i===15?m.display!:displayNumber(new D(m.value!).mul(i).div(15).toFixed(),m.unit==="pct"?1:2)):[]};
}
export function comparisonCharts(a:ProductionRun,b:ProductionRun,diffs:RunMetric[]) {
  const labels=runLabels(a,b);
  const indicators=Object.keys(titles).map((key):ChartSpec=>{
    const ma=a.metrics.find(m=>m.key===key)!,mb=b.metrics.find(m=>m.key===key)!;
    const difference=diffs.find(m=>m.key===key)!;
    const unit=ma.unit==="pct"?"pct":"min";
    const series=[point(a,ma,"a",labels[0]),point(b,mb,"b",labels[1])];
    const values=series.filter(p=>p.available).map(p=>new D(p.value!));
    const max=D.max(1,...values),min=D.min(0,...values);
    for(const p of series) p.width=p.available?new D(p.value!).abs().div(max.sub(min)).mul(100).toFixed(6):null;
    const delta=difference.display===null?null:new D(difference.display);
    const direction=delta===null?"unavailable":delta.isZero()?"same":delta.gt(0)?"higher":"lower";
    const uk=unit==="pct"?"pp" as const:"min" as const;
    const dd=difference.display??"0",absTxt=delta===null?"0":delta.abs().toFixed();
    const u=text(unitWord(dd,uk,"en"),unitWord(dd,uk,"ar"));
    const changeText=delta===null?text("Not available","غير متاح"):direction==="same"?
      text(`${difference.display}${NBSP}${u.en} · same as Run A at the displayed precision`,`${difference.display}${NBSP}${u.ar} · مثل التشغيلة أ وفق دقة العرض`):
      text(`${difference.display}${NBSP}${u.en} ${direction} than Run A`,
        `${difference.display}${NBSP}${u.ar} ${direction==="higher"?"أعلى":"أقل"} من التشغيلة أ`);
    const caption=delta===null?text("These values cannot be compared; review the unavailable value's reason.","لا يمكن مقارنة القيمتين؛ راجع سبب عدم توفر القيمة."):
      direction==="same"?text(`${labels[0]} and ${labels[1]} have the same displayed ${titles[key].en.toLowerCase()}.`,
        `قيمة ${titles[key].ar} المعروضة متساوية في ${labels[0]} و${labels[1]}.`):
      text(`${labels[1]} has ${absTxt}${NBSP}${unitWord(absTxt,uk,"en",{style:"long"})} ${direction==="higher"?"more":"less"} ${titles[key].en.toLowerCase()} than ${labels[0]}.`,
        `${titles[key].ar} في ${labels[1]} ${direction==="higher"?"أعلى":"أقل"} بمقدار ${absTxt}${NBSP}${unitWord(absTxt,uk,"ar",{case:"gen"})} من ${labels[0]}.`);
    return {key,kind:"indicator",title:titles[key],unit,status:difference.status,series,difference,direction,changeText,caption,
      axisMin:min.toNumber(),axisMax:max.toNumber(),howToRead:text("Bars start at zero. A and B use the same scale. Select a value to see its source rows.",
        "تبدأ الأعمدة من الصفر وبالمقياس نفسه للتشغيلتين أ وب. اختر قيمة لعرض صفوف مصدرها.")};
  });
  return {indicators,chart_spec:indicators.filter(s=>["scrap_rate_pct","changeover_min"].includes(s.key)).map(s=>({...s,kind:"bars" as const}))};
}

export function orderStatusChart(statuses:{green:number;yellow:number;red:number}):ChartSpec {
  const entries=Object.entries(statuses),total=entries.reduce((n,[,v])=>n.add(v),new D(0));
  const series=entries.map(([key,value]):ChartPoint=>({key,label:key,value:String(value),display:String(value),hours:null,
    plotValue:value,width:total.isZero()?"0":new D(value).div(total).mul(100).toFixed(6),available:true,
    status:key as ChartPoint["status"],reason:text("",""),refs:[],runId:null,sourceName:null,noEvents:false,frames:[]}));
  const status=statuses.red?"red":statuses.yellow?"yellow":"green";
  return {key:"order_status",kind:"status_stack",unit:"count",title:text("Current orders by status","التشغيلات الحالية حسب الحالة"),
    status,series,axisMin:0,axisMax:D.max(1,total).toNumber(),direction:"unavailable",changeText:text("",""),
    caption:text(`${statuses.green} OK, ${statuses.yellow} Check, ${statuses.red} Blocked. Archived sources are excluded.`,
      `${statuses.green} سليم، ${statuses.yellow} للمراجعة، ${statuses.red} محظور. المصادر المؤرشفة مستبعدة.`),
    howToRead:text("Each segment counts current orders in one status. Labels give the exact counts.",
      "يمثل كل جزء عدد التشغيلات الحالية في حالة واحدة. تعرض التسميات الأعداد الدقيقة.")};
}
