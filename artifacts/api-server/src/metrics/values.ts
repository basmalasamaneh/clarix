import {D,fmt,displayNumber,minutesToHoursDisplay,type Run,type Mapping,type Group,type Status} from "@workspace/calculation";
import type {RunMetric,MetricReference,ProductionRun} from "@workspace/api-zod";
import {worstStatus} from "../imports/quality";

export const definitions=[
  {key:"input_kg",group:"volume",field:"input_kg",unit:"kg",columns:["input","unit"]},
  {key:"good_kg",group:"volume",field:"good_kg",unit:"kg",columns:["good","unit"]},
  {key:"scrap_kg",group:"volume",field:"scrap_kg",unit:"kg",columns:["scrap","unit"]},
  {key:"scrap_rate_pct",group:"volume",field:"scrap_rate_pct",unit:"pct",columns:["input","scrap","unit"]},
  {key:"good_rate_pct",group:"volume",field:"good_rate_pct",unit:"pct",columns:["input","good","unit"]},
  {key:"material_balance_kg",group:"volume",field:"material_balance_kg",unit:"kg",columns:["input","good","scrap","unit"]},
  {key:"changeover_min",group:"changeover",field:"minutes",unit:"min",columns:["start","end","event_code"]},
  {key:"downtime_min",group:"downtime",field:"minutes",unit:"min",columns:["start","end","event_code"]},
] as const;
// Use the approved engine output, including quarantine/exclusion lineage. Never
// recalculate a source with a different import's mapping or merge colliding IDs.
export function references(runId:string,importId:string,mapping:Mapping,lines:readonly string[],columns:readonly string[],kind:MetricReference["kind"],identity:{sourceName:string;orderId:string}):MetricReference[] {
  // List/detail responses carry a bounded reference preview. The Source Drawer
  // reads the complete stored engine references and pages original rows; metric
  // calculation and complete traceability are unchanged.
  return lines.slice(0,20).flatMap(ref=>{
    const match=/^(.*):(\d+)$/.exec(ref);
    if(!match) throw new Error("Invalid stored source reference");
    const spec=Object.values(mapping.files).find(s=>s?.file===match[1]);
    if(!spec) throw new Error("Missing source mapping");
    return [...new Set(columns.map(c=>spec.columns[c]).filter(Boolean))].map(column=>({
      runId,importId,sourceName:identity.sourceName,orderId:identity.orderId,file:match[1],line:Number(match[2]),column,kind,
    }));
  });
}
export function formatted(value:string|null,unit:string,signed=false) {
  if(value===null) return null;
  const s=unit==="pct"||unit==="pp"?displayNumber(value,1):fmt(value)!;
  return signed && new D(s).gt(0)?`+${s}`:s;
}
export function runMetrics(runId:string,importId:string,run:Run,mapping:Mapping,identity:{sourceName:string;orderId:string}):RunMetric[] {
  return definitions.map(def=>{
    const group=run[def.group];
    const raw=(group as unknown as Record<string,unknown>)[def.field] as string|null;
    // Volume availability is per metric: preserve the approved engine's nulls
    // without hiding valid input/output just because another metric is invalid.
    const value=def.group==="volume"?raw:group.status==="red"?null:raw;
    let cols:readonly string[]=def.columns;
    if(mapping.capability_level===1 && def.group!=="volume") {
      cols=def.group==="changeover"?["changeover_hours"]:["downtime_min"];
    }
    const refs=[
      ...references(runId,importId,mapping,group.source_lines,cols,"included",identity),
      ...references(runId,importId,mapping,group.excluded_source_lines,cols,"excluded",identity),
      ...references(runId,importId,mapping,group.quarantined_source_lines,cols,"quarantined",identity),
    ];
    const alternatives=Object.entries(group.alternatives).map(([key,alt])=>{
      const v=typeof alt==="object" && alt!==null ? (alt as Record<string,string|null>)[def.field]??null : alt as string|null;
      return {key,display:formatted(v,def.unit)};
    });
    return {key:def.key,group:def.group,unit:def.unit,status:group.status,value,
      display:formatted(value,def.unit),hours:value!==null&&def.unit==="min"?minutesToHoursDisplay(value):null,
      available:value!==null,noEvents:def.group==="downtime"&&run.downtime.event_count===0&&value==="0",
      refs,alternatives};
  });
}
export function differences(a:ProductionRun,b:ProductionRun):RunMetric[] {
  return definitions.map((def,index)=>{
    const left=a.metrics[index],right=b.metrics[index];
    // Preserve golden rate-comparison refusal even when individual run values
    // remain available; displaying a value is not a claim of comparability.
    const comparable=def.unit!=="pct"||(left.status!=="red"&&right.status!=="red");
    const value=comparable&&left.value!==null&&right.value!==null?fmt(new D(right.value).sub(left.value)):null;
    const unit=def.unit==="pct"?"pp":def.unit;
    const hours=value!==null&&unit==="min"?minutesToHoursDisplay(value):null;
    return {key:def.key,group:def.group,unit,status:worstStatus([left.status,right.status]),
      value,display:formatted(value,unit,true),
      hours:hours!==null&&new D(hours).gt(0)?`+${hours}`:hours,
      available:value!==null,noEvents:false,refs:[...left.refs,...right.refs],alternatives:[]};
  });
}
export function groupStatuses(a:Run["volume"]["status"],b:Status) {return worstStatus([a,b]);}
export const groups:Group[]=["volume","changeover","downtime"];
