import {z} from "zod";
import type {AiAssistInput,AiAssistResult,AiStatement} from "@workspace/api-zod";
import type {Context} from "../imports/service";
import {getRuns} from "../metrics/service";
import {loadSnapshot} from "../snapshots/service";
import {ImportError} from "../imports/model";
import {explain} from "./service";
import {routeCandidates} from "./intents";
import {questionSuggestions} from "./question-suggestions";
import {answerIntent,nextBlocks} from "./answers";
import {qualityBlocks} from "./quality-assistant";
import type {FactsPackage} from "./facts";
const choiceSchema=z.object({choice:z.number().int().min(0)}).strict();
const rankSchema=z.object({ids:z.array(z.string()).max(20)}).strict();
export function validateChoice(raw:unknown,length:number){const p=choiceSchema.safeParse(raw);return p.success&&p.data.choice<length?p.data.choice:null;}
export function validateRank(raw:unknown,ids:string[]){
 const p=rankSchema.safeParse(raw);if(!p.success||p.data.ids.length!==ids.length||new Set(p.data.ids).size!==ids.length||p.data.ids.some(id=>!ids.includes(id)))return null;
 return p.data.ids;
}
export async function assist(ctx:Context,input:AiAssistInput,signal?:AbortSignal):Promise<AiAssistResult>{
 const ar=input.language==="ar";
 const base:AiAssistResult={status:"code",intent:input.intent??input.task,blocks:[],message:"",retryAfter:0,page:input.page??1,total:0};
 let localEntities:{id:string;orderId:string;sourceName:string}[]=[];
 const unsupported=():AiAssistResult=>{
  const s=questionSuggestions(input.question??"",localEntities,input);
  return {...base,status:"unsupported",suggestions:s.suggestions,message:s.needsRun?
   (ar?"أي تشغيلة تقصد؟ اختر تشغيلة من مصنعك.":"Which run do you mean? Choose a run from your factory."):
   (ar?"لا أستطيع الإجابة عن ذلك من بيانات Clarix.":"I can't answer that from Clarix data.")};
 };
 // Validate supplied local identifiers even if the chosen intent would not use
 // them. Foreign and unknown IDs have the identical NOT_FOUND response.
 const runIds=[...new Set([input.runId,input.a,input.b].filter((s):s is string=>!!s))];
 if(runIds.length)await getRuns(ctx,runIds);
 if(input.snapshotId)await loadSnapshot(ctx,input.snapshotId);
 const settings=(await ctx.db.query("SELECT settings FROM factories WHERE id=$1",[ctx.factory])).rows[0]?.settings;
 const gate=():AiAssistResult["status"]|null=>settings?.aiEnabled!==true?"off":settings.aiConsentVersion!==2?"consent_needed":null;
 let request={...input};
 if(input.task==="ask"&&input.question!==undefined){
  if(input.intent)return unsupported();
  if(gate())return {...base,status:gate()!};
  const entities=(await ctx.db.query(`SELECT o.id,o.source_order_id AS "orderId",o.source_name AS "sourceName"
   FROM orders o JOIN imports i ON i.id=o.current_import_id AND i.factory_id=o.factory_id JOIN factories f ON f.id=o.factory_id
   WHERE o.factory_id=$1 AND i.status='approved' AND NOT coalesce((f.settings->'sourceArchives'->o.source_name->>'archived')::boolean,false)
   ORDER BY o.id LIMIT 2001`,[ctx.factory])).rows;
  if(entities.length>2000)return unsupported(); // Explicit bounded natural-language context.
  localEntities=entities;
  let text=input.question,context=input;
  const snapshotToken=/(?:snapshot|لقطة|اللقطة)\s+([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i.exec(text);
  if(snapshotToken){
   await loadSnapshot(ctx,snapshotToken[1]);
   context={...input,snapshotId:snapshotToken[1]};text=text.replace(snapshotToken[1],"");
  }
  const routed=routeCandidates(text,entities,context);if(!routed)return unsupported();
  const statements:AiStatement[]=routed.candidates.map((c,i)=>({type:"FACT",text:JSON.stringify(c),refs:[`choice-${i}`]}));
  const packed:FactsPackage={language:input.language,facts:[],orderIds:[],issueCodes:[],allowedStatements:statements};
  const r=await explain(ctx,{language:input.language},signal,routed.question,{
   task:`ask:${routed.candidates[0].intent}`,mode:"intent",data:{packed,facts:[],fallback:""},
   payload:{candidates:routed.candidates.map((c,i)=>({choice:i,intent:c.intent??"unsupported",parameters:c}))},
   validate:raw=>{const n=validateChoice(raw,statements.length);return n===null?null:[statements[n]];},
  });
  if(r.status!=="verified")return {...base,status:r.status,retryAfter:r.retryAfter};
  request=JSON.parse(r.statements[0].text);if(!request.intent)return unsupported();
  base.status="verified";base.intent=request.intent;
 }
 const data=input.task==="quality"?await qualityBlocks(ctx,input):input.task==="next"?await nextBlocks(ctx,input.language):
  request.intent?await answerIntent(ctx,request):null;
 if(!data)return unsupported();
 Object.assign(base,{blocks:data.blocks,total:data.total,page:data.page});
 if(!base.blocks.length)base.message=ar?"لا توجد بيانات متاحة لهذا السؤال حاليًا.":"No data is available for this question yet.";
 if(input.task!=="ask"&&input.useAi&&base.blocks.length){
  if(gate())return {...base,status:gate()!};
  const ids=base.blocks.map(b=>b.id);
  const packed:FactsPackage={language:input.language,facts:[],orderIds:[],issueCodes:[],allowedStatements:[]};
  // Rank only opaque block IDs + catalogue metadata; filenames/line references,
  // source names and issue text remain local.
  const payload={ids,items:"ranking" in data?data.ranking:ids.map(id=>({id}))};
  const r=await explain(ctx,{language:input.language},signal,undefined,{task:input.task,mode:"rank",data:{packed,facts:[],fallback:""},payload,
   validate:raw=>{const ranked=validateRank(raw,ids);return ranked?.map(id=>({type:"SUGGESTION",text:id,refs:[id]}))??null;}});
  base.status=r.status;base.retryAfter=r.retryAfter;
  if(r.status==="verified")base.blocks=r.statements.map(s=>base.blocks.find(b=>b.id===s.text)!);
 }
 return base;
}
