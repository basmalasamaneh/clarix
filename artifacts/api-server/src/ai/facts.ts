import {z} from "zod";
import {relationStatements} from "./relations";
import type {AiFact,AiStatement,RunComparison,ReconciliationResult} from "@workspace/api-zod";
export type Lang="en"|"ar";
export type FactsPackage={language:Lang;facts:Omit<AiFact,"source">[];orderIds:string[];issueCodes:string[];allowedStatements:AiStatement[]};
const labels:Record<string,[string,string]>={
 input_kg:["Input","المدخلات"],good_kg:["Good output","الإنتاج الجيد"],scrap_kg:["Scrap","الهدر"],
 scrap_rate_pct:["Scrap rate","نسبة الهدر"],good_rate_pct:["Good rate","نسبة الإنتاج الجيد"],material_balance_kg:["Material balance","ميزان المواد"],
 changeover_min:["Changeover","تغيير القالب"],downtime_min:["Unplanned downtime","التوقف غير المخطط"],
};
const group=(key:string)=>key==="changeover_min"?"changeover":key==="downtime_min"?"downtime":"volume";
export function buildFacts(d:RunComparison,language:Lang,snapshotId?:string){
  const ar=language==="ar",facts:AiFact[]=[],allowedStatements:AiStatement[]=[];
  for(const side of ["a","b"] as const){
    const run=d[side];
    for(const m of run.metrics){
      if(!labels[m.key])continue;
      // AI must not endorse a red-group value even where the comparison table
      // retains a historical non-null value (scenario 05). Engine unchanged.
      const status=run.groups[group(m.key)];
      const value=status==="red"||!m.available?null:m.value;
      if(value!==null&&!/^[+-]?\d+(?:\.\d+)?$/.test(value))continue;
      const label=`${ar?(side==="a"?"التشغيلة أ":"التشغيلة ب"):`Run ${side.toUpperCase()}`} — ${labels[m.key][ar?1:0]}`;
      facts.push({id:`${side}.${m.key}`,label,value,unit:m.unit,status,
        source:{runId:run.id,metric:m.key,...(snapshotId?{snapshotId}:{})}});
    }
  }
  for(const m of d.differences){
    if(!labels[m.key])continue;
    const value=d.groups[group(m.key)]==="red"||!m.available?null:m.value;
    if(value!==null&&!/^[+-]?\d+(?:\.\d+)?$/.test(value))continue;
    facts.push({id:`difference.${m.key}`,label:`${ar?"الفرق":"Difference"} — ${labels[m.key][ar?1:0]}`,
      value,unit:m.unit,status:d.groups[group(m.key)],source:{runId:d.b.id,metric:m.key,...(snapshotId?{snapshotId}:{})}});
  }
  const show=(f:AiFact)=>{
    if(f.value===null)return ar?"غير متوفر":"Not available";
    const [side,key]=f.id.split(".");
    const metric=(side==="difference"?d.differences:d[side as "a"|"b"].metrics).find(m=>m.key===key)!;
    const unit=f.unit==="pct"?"%":f.unit==="pp"?(ar?"نقطة مئوية":"pp"):f.unit==="min"?(ar?"دقيقة":"min"):(ar?"كغ":"kg");
    return `${metric.display??f.value} ${unit}`;
  };
  for(const key of ["scrap_rate_pct","changeover_min","downtime_min","input_kg","good_kg","scrap_kg"]){
    const selected=facts.filter(f=>[`${"a"}.${key}`,`${"b"}.${key}`,`difference.${key}`].includes(f.id));
    if(!selected.length)continue;
    let text=selected.map(f=>`${f.label}: ${show(f)}`).join(ar?"؛ ": "; ")+".";
    allowedStatements.push({type:"FACT",text,refs:selected.map(f=>f.id)});
  }
  const usable=facts.find(f=>f.value!==null);
  allowedStatements.push(...relationStatements(facts,language));
  if(usable){
    allowedStatements.push({type:"HYPOTHESIS",text:ar?
      "تفسير محتمل للتحقق: قد تختلف ظروف التشغيل. افحص الصفوف المصدر للتشغيلتين؛ البيانات لا تثبت سبب الفرق.":
      "Possible explanation to check: operating conditions may differ. Check the source rows for both runs; the data does not establish the cause of the difference.",refs:[usable.id]});
    allowedStatements.push({type:"SUGGESTION",text:ar?"تحقق من الصفوف المصدر وملاحظات جودة البيانات قبل اتخاذ قرار.":"Check the source rows and data-quality notes before making a decision.",refs:[usable.id]});
  }
  const packed:FactsPackage={language,facts:facts.map(({source,...f})=>f),
    // Identifiers are the sole user-originated label allowed out. Anything
    // that could be a sentence, address, URL or instruction is omitted.
    orderIds:[d.a.orderId,d.b.orderId].filter(id=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(id)),
    issueCodes:[...new Set([...d.a.issues,...d.b.issues].map(i=>i.code).filter(c=>/^[A-Z][A-Z_]{1,79}$/.test(c)))],
    allowedStatements};
  return {packed,facts,fallback:d.questions.map(q=>q[language]).join(" ")};
}
/** Foundation builders for later tasks; no quality-assistant UI or extra query
 * endpoint. Copy only existing summary/result fields, never reason/sentence text. */
export function qualityFacts(summary:{errors:number;warnings:number},language:Lang){
 return (["errors","warnings"] as const).map(key=>({
  id:`quality.${key}`,label:language==="ar"?(key==="errors"?"الأخطاء":"التحذيرات"):(key==="errors"?"Errors":"Warnings"),
  value:Number.isSafeInteger(summary[key])&&summary[key]>=0?String(summary[key]):null,unit:"issues",
  status:summary[key]===0?"green":key==="errors"?"red":"yellow",source:{page:"data-quality",severity:key==="errors"?"error":"warning"},
 }));
}
export function reconciliationFacts(result:ReconciliationResult,language:Lang,snapshotId:string):AiFact[]{
 return result.figures.filter(f=>labels[f.key]).flatMap(f=>(["clarix","reported","difference"] as const).map(field=>({
  id:`reconciliation.${f.side}.${f.key}.${field}`,
  label:`${language==="ar"?"المطابقة":"Reconciliation"} — ${language==="ar"?(f.side==="a"?"أ":"ب"):f.side.toUpperCase()} — ${labels[f.key][language==="ar"?1:0]} — ${language==="ar"?{clarix:"قيمة Clarix",reported:"قيمة التقرير",difference:"الفرق"}[field]:field}`,
  value:f.result==="unavailable"||f[field]===null||!/^[+-]?\d+(?:\.\d+)?$/.test(f[field]!)?null:f[field],
  unit:f.unit,status:f.result==="unavailable"?"red" as const:f.result==="differs"?"yellow" as const:"green" as const,
  source:{runId:f.runId,metric:f.key,snapshotId},
 })));
}
const answer=z.object({statements:z.array(z.object({
  type:z.enum(["FACT","HYPOTHESIS","SUGGESTION"]),text:z.string().min(1).max(1800),refs:z.array(z.string()).min(1).max(12),
}).strict()).min(3).max(5)}).strict();
const normal=(s:string)=>s.normalize("NFC").replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776))
  .replace(/\u066b/g,".").replace(/\u066a/g,"%").replace(/\u2212/g,"-").replace(/\u00a0/g," ")
  .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,v=>v.replaceAll(",",""))
  .replace(/\b\d+\.\d+\b/g,v=>v.replace(/0+$/,"").replace(/\.$/,""))
  .replace(/\s*%/g,"%").replace(/[ \t]+/g," ").trim();
/** Closed-language validation is deliberate: arbitrary paraphrase cannot be
 * proven non-causal by regex/another LLM. The model selects/order statements;
 * only code-authored phrasings whose relations and values are already true
 * survive. No "number appears somewhere in facts" shortcut is used. */
export function validateAnswer(raw:unknown,p:FactsPackage):AiStatement[]|null{
  const parsed=answer.safeParse(raw);if(!parsed.success)return null;
  const texts=new Set<string>();
  for(const s of parsed.data.statements){
    if(texts.has(normal(s.text)))return null;texts.add(normal(s.text));
    const candidate=p.allowedStatements.find(c=>c.type===s.type&&normal(c.text)===normal(s.text));
    if(!candidate||s.refs.length!==new Set(s.refs).size||[...s.refs].sort().join("|")!==[...candidate.refs].sort().join("|"))return null;
  }
  // Return canonical wording, not even validated raw model strings.
  return parsed.data.statements.map(s=>p.allowedStatements.find(c=>c.type===s.type&&normal(c.text)===normal(s.text))!);
}
