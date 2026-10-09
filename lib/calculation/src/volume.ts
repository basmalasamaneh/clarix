import { D, fmt, type Dec } from "./decimal";
import { Issues, byLine, groupsBy, lines } from "./issues";
import type { Mapping, Volume, WorkingRecord } from "./types";

const signature = (r: WorkingRecord, complete: boolean) => JSON.stringify([
  r.order,r.shift,r.date,...(complete ? [r.machine,r.mold]:[]),fmt(r.input),fmt(r.good),fmt(r.scrap),r.unit,
]);
export function processRecords(rows: WorkingRecord[], issues: Issues): void {
  for(const r of rows) if(!r.rid || !r.order) {
    r.state="quarantined";
    if(r.order) issues.add(r.order,"MISSING_REQUIRED_FIELD","error",["volume"]);
    else issues.file.add("MISSING_REQUIRED_FIELD:error");
  }
  for(const group of groupsBy(rows.filter((r)=>r.state==="ok"),(r)=>r.rid)) {
    if(group.length<2) continue;
    const identical=group.every((r)=>signature(r,true)===signature(group[0],true));
    for(const r of identical ? group.slice(1):group) {
      r.state=identical ? "excluded":"quarantined";
      issues.add(r.order, identical ? "DUPLICATE_RECORD_ID_IDENTICAL":"DUPLICATE_RECORD_ID_CONFLICT",identical ? "warning":"error",["volume"]);
    }
  }
  const seen=new Set<string>();
  for(const r of rows.filter((r)=>r.state==="ok").sort(byLine)) {
    const key=signature(r,false);
    if(seen.has(key)) { r.suspected=true; issues.add(r.order,"SUSPECTED_DUPLICATE_RECORD","error",["volume"]); }
    seen.add(key);
  }
}
export function volumeValues(rows: WorkingRecord[], mapping: Mapping, blocked=false) {
  const flags={incompatible:false,converted:false,missing:false};
  const sums: Record<"input"|"good"|"scrap",Dec|null>={input:null,good:null,scrap:null};
  if(!rows.length || blocked) return {sums,flags};
  const factors=new Map(Object.entries(mapping.unit_factors_to_kg).map(([k,v])=>[k.toLowerCase(),new D(v)]));
  flags.incompatible=rows.some((r)=>!factors.has(r.unit));
  flags.converted=rows.some((r)=>factors.has(r.unit) && !factors.get(r.unit)!.eq(1));
  for(const field of ["input","good","scrap"] as const) {
    if(rows.some((r)=>r[field]===null)) flags.missing=true;
    else if(!flags.incompatible) sums[field]=rows.reduce((acc,r)=>acc.add(r[field]!.mul(factors.get(r.unit)!)),new D(0));
  }
  return {sums,flags};
}
export function analyzeVolume(order:string, rows:WorkingRecord[], mapping:Mapping, issues:Issues): Volume {
  const mine=rows.filter((r)=>r.order===order);
  const included=mine.filter((r)=>r.state==="ok").sort(byLine);
  const quarantine=mine.filter((r)=>r.state==="quarantined");
  const excluded=mine.filter((r)=>r.state==="excluded");
  const {sums,flags}=volumeValues(included,mapping,quarantine.length>0);
  if(!mine.length) issues.add(order,"NO_PRODUCTION_RECORDS","error",["volume"]);
  if(flags.incompatible) issues.add(order,"INCOMPATIBLE_UNIT","error",["volume"]);
  if(flags.missing) issues.add(order,"MISSING_VALUE","error",["volume"]);
  if(flags.converted && !flags.incompatible) issues.add(order,"UNIT_CONVERTED","info",["volume"]);
  const {input,good,scrap}=sums;
  if(input?.isZero()) issues.add(order,"ZERO_INPUT","error",["volume"]);
  const rate=(value:Dec|null) => input?.gt(0) && value!==null ? value.div(input).mul(100):null;
  const balance=input!==null && good!==null && scrap!==null ? input.sub(good).sub(scrap):null;
  if(balance!==null && input!==null) {
    if(input.gt(0)) {
      const pct=balance.abs().div(input).mul(100);
      if(pct.gt(mapping.tolerances.imbalance_error_pct)) issues.add(order,"MATERIAL_IMBALANCE","error",["volume"]);
      else if(pct.gt(mapping.tolerances.imbalance_warn_pct)) issues.add(order,"MATERIAL_IMBALANCE","warning",["volume"]);
    } else if(!balance.isZero()) issues.add(order,"MATERIAL_IMBALANCE","error",["volume"]);
  }
  const alternatives: Volume["alternatives"]={};
  if(included.some((r)=>r.suspected)) {
    const {sums:alt}=volumeValues(included.filter((r)=>!r.suspected),mapping);
    alternatives.exclude_suspected={
      input_kg:fmt(alt.input),good_kg:fmt(alt.good),scrap_kg:fmt(alt.scrap),
      scrap_rate_pct:fmt(alt.input!==null && !alt.input.isZero() && alt.scrap!==null ? alt.scrap.div(alt.input).mul(100):null),
    };
  }
  return {input_kg:fmt(input),good_kg:fmt(good),scrap_kg:fmt(scrap),scrap_rate_pct:fmt(rate(scrap)),
    good_rate_pct:fmt(rate(good)),material_balance_kg:fmt(balance),record_ids:included.map((r)=>r.rid),
    source_lines:lines(included),excluded_source_lines:lines(excluded),quarantined_source_lines:lines(quarantine),alternatives};
}
