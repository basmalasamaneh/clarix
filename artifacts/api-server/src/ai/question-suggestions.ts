import type {AiAssistInput,AiQuestionSuggestion} from "@workspace/api-zod";
import {routeCandidates} from "./intents";
import {normalizeQuestion,canonicalWords} from "./question-language";
export function questionSuggestions(question:string,entities:{id:string;orderId:string;sourceName:string}[],context:AiAssistInput){
 const ar=context.language==="ar",base={task:"ask" as const,language:context.language,useAi:false};
 let inferred=entities[0]?routeCandidates(question,entities,{...context,runId:entities[0].id,a:entities[0]?.id,b:entities[1]?.id})?.candidates[0]:null;
 // Suggestions never execute the failed question. Only code-authored topics
 // are used; IDs always come from the scoped current-run list.
 const topic=canonicalWords(normalizeQuestion(question));
 if(!inferred&&entities[0]){
  const sample=/\bcompare\b/.test(topic)?"compare":/\bchangeover|mold\b/.test(topic)?"changeover":
   /\bdowntime\b/.test(topic)?"downtime":/\bscrap\b/.test(topic)?"scrap rate":/\bstatus\b/.test(topic)?"status":null;
  if(sample)inferred=routeCandidates(sample,entities,{...context,runId:entities[0].id,a:entities[0].id,b:entities[1]?.id})?.candidates[0];
 }
 if(inferred?.intent==="compare"&&entities.length>=2){
  const suggestions:AiQuestionSuggestion[]=entities.slice(1,4).map(e=>({
   label:ar?`قارن ${entities[0].orderId} [${entities[0].sourceName}] مع ${e.orderId} [${e.sourceName}]`:
    `Compare ${entities[0].orderId} [${entities[0].sourceName}] with ${e.orderId} [${e.sourceName}]`,
   input:{...base,intent:"compare",a:entities[0].id,b:e.id},
  }));
  return {needsRun:true,suggestions};
 }
 const needsRun=!!inferred&&["metric","status"].includes(inferred.intent!);
 if(needsRun&&inferred){
  const selected=inferred;
  const suggestions:AiQuestionSuggestion[]=entities.slice(0,3).map(e=>{
   const label=`${e.orderId} [${e.sourceName}]`;
   return {label:selected.intent==="status"?(ar?`ما حالة التشغيلة ${label}؟`:`What is the status of run ${label}?`):
    selected.metric==="changeover_min"?(ar?`ما زمن تغيير القالب للتشغيلة ${label}؟`:`What is the changeover time for run ${label}?`):
    selected.metric==="downtime_min"?(ar?`ما زمن التوقف للتشغيلة ${label}؟`:`What is the downtime for run ${label}?`):
    (ar?`ما نسبة الهدر للتشغيلة ${label}؟`:`What is the scrap rate for run ${label}?`),
    input:{...base,intent:selected.intent,metric:selected.metric,runId:e.id}};
  });
  return {needsRun,suggestions};
 }
 const suggestions:AiQuestionSuggestion[]=[
  {label:ar?"كم عدد التشغيلات الحالية؟":"How many current runs?",input:{...base,intent:"counts"}},
  {label:ar?"أي تشغيلة لها أعلى نسبة هدر؟":"Which run has the highest scrap rate?",input:{...base,intent:"extreme",metric:"scrap_rate_pct",direction:"highest"}},
  {label:ar?"ما التشغيلات المحجوبة؟":"Which runs are blocked?",input:{...base,intent:"runs",status:"red"}},
 ];
 return {needsRun:false,suggestions};
}
