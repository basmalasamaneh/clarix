import type {AiAssistInput,AiAssistBlock,AiFact,ProductionRun} from "@workspace/api-zod";
import type {Context} from "../imports/service";
import {ImportError} from "../imports/model";
import {compare,getRuns,listRuns} from "../metrics/service";
import {definitions} from "../metrics/values";
import {overview} from "../imports/overview";
import {snapshotDetail} from "../snapshots/service";
import {qualityBlocks} from "./quality-assistant";
import {issueAdvice} from "./catalogue";
import {buildFacts} from "./facts";
import {minutesText} from "./language";
export const metricLabels:Record<string,[string,string]>={
 scrap_rate_pct:["Scrap rate","نسبة الهدر"],scrap_kg:["Scrap","الهدر"],
 changeover_min:["Changeover time","زمن تغيير القالب"],downtime_min:["Unplanned downtime","التوقف غير المخطط"],
 input_kg:["Input","المدخلات"],good_kg:["Good output","الإنتاج الجيد"],good_rate_pct:["Good output rate","نسبة الإنتاج الجيد"],
 material_balance_kg:["Material balance","ميزان المواد"],
};
const statusLabel=(status:string,ar:boolean)=>status==="red"?(ar?"محجوبة":"Blocked"):status==="yellow"?(ar?"تحتاج إلى تحقق":"Check"):(ar?"مكتملة":"OK");
export function metricBlock(run:ProductionRun,key:string,language:"en"|"ar"):AiAssistBlock{
 const ar=language==="ar",def=definitions.find(d=>d.key===key),m=run.metrics.find(m=>m.key===key);
 if(!def||!m)throw new ImportError("INVALID_INPUT");
 const blocked=run.groups[def.group]==="red",value=blocked||!m.available?null:m.value;
 const fact:AiFact={id:`${run.id}.${key}`,label:`${run.orderId} [${run.sourceName}] — ${metricLabels[key][ar?1:0]}`,
  value,unit:m.unit,status:run.groups[def.group],source:{runId:run.id,metric:key}};
 const unit=m.unit==="pct"?"%":m.unit==="min"?(ar?"دقيقة":"min"):(ar?"كغ":"kg");
 const reasons=run.issues.filter(i=>i.group.split(",").includes(def.group)).map(i=>issueAdvice(i.code,language)[0]);
 return {id:fact.id,type:"FACT",title:fact.label,text:value===null?
  `${ar?"غير متوفر":"Not available"}${reasons.length?`: ${[...new Set(reasons)].join(" ")}`:""}`:
  m.unit==="min"?minutesText(m.display??value,language):`${m.display??value} ${unit}`,facts:[fact],href:blocked?`/quality?order=${encodeURIComponent(run.orderId)}`:`/runs?search=${encodeURIComponent(run.orderId)}`};
}
function statusBlock(run:ProductionRun,language:"en"|"ar"):AiAssistBlock{
 const ar=language==="ar";
 return {id:run.id,type:"FACT",title:`${run.orderId} [${run.sourceName}]`,
  text:`${statusLabel(run.overall,ar)}. ${[...new Set(run.issues.map(i=>issueAdvice(i.code,language)[0]))].join(" ")}`,
  facts:[],href:`/quality?order=${encodeURIComponent(run.orderId)}`};
}
export async function nextBlocks(ctx:Context,language:"en"|"ar"){
 const o=await overview(ctx),ar=language==="ar",blocks:AiAssistBlock[]=[];
 const role=(await ctx.db.query("SELECT role FROM memberships WHERE factory_id=$1 AND user_id=$2",[ctx.factory,ctx.user])).rows[0]?.role;
 const add=(id:string,text:string,href:string)=>blocks.push({id,type:"SUGGESTION",title:ar?"الخطوة التالية":"Next step",text,href,facts:[]});
 if(o.statuses.red)add("blocked",ar?`التشغيلات المحجوبة: ${o.statuses.red}. راجع مشكلاتها.`:`Blocked runs: ${o.statuses.red}. Review their issues.`,"/quality?severity=error");
 if(o.warnings)add("warnings",ar?`التحذيرات: ${o.warnings}. تحقق منها قبل استخدام الأرقام.`:`Warnings: ${o.warnings}. Check them before using the figures.`,"/quality?severity=warning");
 if(o.currentOrders<2)add("import",ar?"تحتاج إلى تشغيلتين للمقارنة. اطلب استيراد بيانات التشغيلة التالية.":"You need two runs to compare. Arrange an import of the next run.",role==="viewer"?"/runs":"/imports");
 else if(o.comparisonRuns.length===2){
  const [a,b]=o.comparisonRuns;
  add("compare",ar?"قارن أحدث تشغيلتين قابلتين للمقارنة.":"Compare the two most recently produced comparable runs.",`/comparison?a=${a.id}&b=${b.id}`);
  if(role!=="viewer")add("snapshot",ar?"احفظ لقطة للمقارنة للاحتفاظ بأرقامها ومصادرها.":"Save a snapshot of the comparison to keep its figures and sources.",`/comparison?a=${a.id}&b=${b.id}`);
 }
 return {blocks:blocks.slice(0,3),page:1,total:Math.min(3,blocks.length)};
}
export async function answerIntent(ctx:Context,input:AiAssistInput){
 const ar=input.language==="ar",page=input.page??1;
 const requireRun=async()=>{if(!input.runId)throw new ImportError("INVALID_INPUT");return (await getRuns(ctx,[input.runId]))[0];};
 let blocks:AiAssistBlock[]=[],total=0;
 switch(input.intent){
  case "compare":{
   if(!input.a||!input.b)throw new ImportError("INVALID_INPUT");
   const d=await compare(ctx,input.a,input.b),data=buildFacts(d,input.language);
   blocks=data.packed.allowedStatements.filter(s=>s.type==="FACT").slice(0,5).map((s,i)=>({id:`comparison-${i}`,type:s.type,title:ar?"مقارنة":"Comparison",text:s.text,facts:data.facts.filter(f=>s.refs.includes(f.id))}));
   break;
  }
  case "metric":blocks=[metricBlock(await requireRun(),input.metric??"scrap_rate_pct",input.language)];break;
  case "status":blocks=[statusBlock(await requireRun(),input.language)];break;
  case "runs":{
   const r=await listRuns(ctx,{page,search:"",status:input.status??"red",sort:"status"});
   blocks=r.items.map(r=>statusBlock(r,input.language));total=r.total;break;
  }
  case "issues":return qualityBlocks(ctx,input);
  case "counts":{
   const o=await overview(ctx);
   blocks=[{id:"counts",type:"FACT",title:ar?"الأعداد الحالية":"Current counts",text:ar?
    `الاستيرادات المعتمدة: ${o.approvedImports}. التشغيلات الحالية: ${o.currentOrders}. مكتملة: ${o.statuses.green}، تحتاج إلى تحقق: ${o.statuses.yellow}، محجوبة: ${o.statuses.red}.`:
    `Approved imports: ${o.approvedImports}. Current runs: ${o.currentOrders}. OK: ${o.statuses.green}; Check: ${o.statuses.yellow}; Blocked: ${o.statuses.red}.`,facts:[],href:"/runs"}];break;
  }
  case "extreme":{
   const key=input.metric??"scrap_rate_pct",def=definitions.find(d=>d.key===key)!;
   // Column/path and direction are from fixed code, never interpolated question text.
   const order=input.direction==="lowest"?"ASC":"DESC";
   const rows=(await ctx.db.query(`SELECT o.id FROM orders o JOIN imports i ON i.id=o.current_import_id AND i.factory_id=o.factory_id
    JOIN factories f ON f.id=o.factory_id WHERE o.factory_id=$1 AND i.status='approved'
    AND NOT coalesce((f.settings->'sourceArchives'->o.source_name->>'archived')::boolean,false)
    AND o.metrics->$2->>'status'!='red' AND o.metrics->$2->>$3 IS NOT NULL
    ORDER BY (o.metrics->$2->>$3)::numeric ${order},o.id LIMIT 1`,[ctx.factory,def.group,def.field])).rows;
   if(rows.length)blocks=[metricBlock((await getRuns(ctx,[rows[0].id]))[0],key,input.language)];
   break;
  }
  case "snapshot_changes":{
   if(!input.snapshotId)throw new ImportError("INVALID_INPUT");
   const s=await snapshotDetail(ctx,input.snapshotId);
   // Report only server-computed metric changes. Other changes are fixed labels,
   // never snapshot notes/titles or user strings presented as model facts.
   const changes=s.changes;
   const current=new Map<string,ProductionRun>();
   for(const run of [s.comparison.a,s.comparison.b]){
    try{current.set(run.id,(await getRuns(ctx,[run.id]))[0]);}
    catch(e){if(!(e instanceof ImportError&&e.status===404))throw e;}
   }
   blocks=changes.slice((page-1)*20,page*20).map((c,i)=>{
    const run=s.comparison[c.side],metric=metricLabels[c.key]?.[ar?1:0];
    const def=definitions.find(d=>d.key===c.key),now=current.get(run.id);
    const before=def&&run.groups[def.group]==="red"?null:c.before;
    const after=def&&(!now||now.groups[def.group]==="red")?null:c.after;
    return {id:`change-${(page-1)*20+i}`,type:"FACT" as const,title:`${ar?(c.side==="a"?"التشغيلة أ":"التشغيلة ب"):`Run ${c.side.toUpperCase()}`} — ${metric??(ar?"حالة البيانات":"Data state")}`,
     text:c.kind==="metric"?`${ar?"المحفوظ":"Saved"}: ${before??(ar?"غير متوفر":"Not available")}; ${ar?"الحالي":"Current"}: ${after??(ar?"غير متوفر":"Not available")}`:
      (ar?"تغير الاستيراد أو حالة البيانات منذ حفظ اللقطة. راجع تفاصيل التغيير.":"The import or data status changed since the snapshot. Review the change details."),
     facts:metric?[{id:`saved.${c.side}.${c.key}`,label:metric,value:before,unit:"",status:def?run.groups[def.group]:run.overall,source:{runId:run.id,metric:c.key,snapshotId:input.snapshotId}},
      ...(now?[{id:`current.${c.side}.${c.key}`,label:ar?`${metric} — الحالي`:`${metric} — current`,value:after,unit:"",status:def?now.groups[def.group]:now.overall,source:{runId:now.id,metric:c.key}}]:[])]:[],
     href:`/snapshots/${input.snapshotId}`};
   });total=changes.length;break;
  }
  case "causal":{
   blocks=[{id:"non-causal",type:"FACT",title:ar?"حقائق وليست أسبابًا":"Facts, not causes",
    text:ar?"يسجّل Clarix الحقائق ولا يفترض الأسباب. الأرقام لا تثبت أن التوقف سبب الهدر.":"Clarix records facts and does not assume causes. The numbers do not prove that a stop caused scrap.",facts:[]}];
   const ids=input.runId?[input.runId]:[input.a,input.b].filter((s):s is string=>!!s);
   for(const run of ids.length?await getRuns(ctx,[...new Set(ids)]):[]){
    blocks.push(metricBlock(run,"scrap_rate_pct",input.language),metricBlock(run,"downtime_min",input.language));
    for(const issue of run.issues.slice(0,2)){
     blocks.push({id:`possible-${issue.id}`,type:"HYPOTHESIS",title:ar?"تفسير محتمل للتحقق":"Possible explanation to check",
      text:issueAdvice(issue.code,input.language)[2],facts:[],href:`/quality?issue=${issue.id}`});
    }
   }break;
  }
  default:throw new ImportError("INVALID_INPUT");
 }
 return {blocks,page,total:total||blocks.length};
}
