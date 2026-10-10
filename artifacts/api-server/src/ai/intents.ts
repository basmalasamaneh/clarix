import type {AiAssistInput} from "@workspace/api-zod";
export const intentCatalogue=["compare","metric","extreme","runs","issues","status","counts","snapshot_changes","causal"] as const;
type Entity={id:string;orderId:string;sourceName:string};
/** Fail-closed preflight, not model instructions. Replace local identities
 * before sending a question; no real source name leaves the server. */
export function routeCandidates(raw:string,entities:Entity[],context:AiAssistInput){
 if(raw.length>500||/[\u0000-\u0008]|@|https?:|www\.|\b(select|insert|delete|update|drop|union|password|secret|system|prompt|admin|users?|factory|factories|ignore|instructions?|rules)\b|مصنع|مصانع|مستخدم|كلمة مرور|تجاهل|تعليمات|قواعد|نظام|سكربت/i.test(raw))return null;
 const clean=raw.replace(/<[^>]*>/g," ").normalize("NFC").trim();
 if(!clean||/<|>/.test(clean))return null;
 let question=clean,mentioned:Entity[]=[];
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 const uniqueOrders=[...new Set(entities.map(e=>e.orderId))].sort((a,b)=>b.length-a.length);
 for(const order of uniqueOrders){
  const pattern=new RegExp(`(?<![\\p{L}\\p{N}_-])${escape(order)}(?![\\p{L}\\p{N}_-])`,"giu");
  if(!pattern.test(question))continue;
  let matches=entities.filter(e=>e.orderId.toLowerCase()===order.toLowerCase());
  if(matches.length>1)matches=matches.filter(e=>clean.includes(e.sourceName));
  if(matches.length!==1)return null; // Never silently select a same-ID source.
  mentioned.push(matches[0]);question=question.replace(pattern,` r${entities.indexOf(matches[0])} `);
 }
 for(const name of [...new Set(entities.map(e=>e.sourceName))].sort((a,b)=>b.length-a.length)){
  if(name)question=question.replace(new RegExp(escape(name),"gu")," source ");
 }
 // No arbitrary prose/identities is forwarded. Common supported vocabulary,
 // Arabic inflections and documented typos are accepted; unknown text asks
 // the user to rephrase using the chips rather than guessing or leaking it.
 const vocabulary=new Set(("a b run runs order orders source compare comparison between with and versus vs to for of the this these that which what how many much is are was were has have had did does do show me please my data approved current imports count counts total highest lowest most least more less longest shortest high low higher lower scrap scarp rate rates waste changeover chageover mold change time downtime stop stops unplanned input output blocked check warning warnings status issues issue why cause caused because explain since snapshot changed changes recorded separately correctly counted also its longer "+
 "أ ب ا التشغيلة التشغلات التشغيلات تشغيلة تشغيله تشغيلات طلب الطلب الطلبات قارن مقارنة بين مع و أو ام اي أي ما ماذا كم عدد اعرض أظهر لي من في على عن هل هو هي كان كانت هذه هذا ذلك تلك أكثر اكثر أقل اقل أعلى اعلى أدنى ادنى أطول اطول أقصر اقصر نسبة نسب الهدر هدر الخردة تغيير القالب زمن وقت مدة التوقف توقف غير المخطط المحجوبة محجوبة محجوب تحذيرات تحذير تحقق حالة الحالة حالات مشاكل مشكلات المشكلات المشكلة مشكله مشكلة لماذا سبب تسبب بسبب اشرح الاستيراد الاستيرادات المعتمدة معتمد المعتمد الحالية الحالي الحالية الإجمالي اجمالي إجمالي منذ لقطة اللقطة تغير تغيرت التغييرات مسجل مسجلة منفصل منفصلة صحيح صحيحة يحسب محسوب أيضا أيضًا وهل وكم وما وماهي").split(/\s+/));
 const tokens=question.toLowerCase().match(/[\p{L}\p{N}_-]+/gu)??[];
 if(tokens.some(t=>!vocabulary.has(t)&&!/^r\d+$/.test(t)))return null;
 const q=question.toLowerCase(),base={task:"ask" as const,language:context.language};
 const run=mentioned[0]?.id??context.runId;
 const metric=/changeover|chageover|mold|القالب|تغيير/.test(q)?"changeover_min":/downtime|stop|توقف|التوقف/.test(q)?"downtime_min":"scrap_rate_pct";
 let candidate:AiAssistInput;
 if(/why|cause|because|لماذا|سبب|تسبب/.test(q))candidate={...base,intent:"causal",...(run?{runId:run}:{a:context.a,b:context.b})};
 else if(/since|snapshot|لقطة|اللقطة/.test(q)){
  if(!context.snapshotId)return null;candidate={...base,intent:"snapshot_changes",snapshotId:context.snapshotId};
 }else if(/compare|comparison|versus|قارن|مقارنة|between|بين/.test(q)){
  const a=mentioned[0]?.id??context.a,b=mentioned[1]?.id??context.b;
  if(!a||!b||a===b||mentioned.length>2)return null;candidate={...base,intent:"compare",a,b};
 }else if(/highest|lowest|most|least|longest|shortest|أعلى|اعلى|أدنى|ادنى|أطول|اطول|أقصر|اقصر|أكثر|اكثر|أقل|اقل/.test(q)){
  candidate={...base,intent:"extreme",metric,direction:/lowest|least|shortest|أدنى|ادنى|أقصر|اقصر|أقل|اقل/.test(q)?"lowest":"highest"};
 }else if(/count|many|imports|عدد|كم|الاستيراد|الاستيرادات/.test(q))candidate={...base,intent:"counts"};
 else if(/blocked|warning|محجوب|تحذير/.test(q)&&!run)candidate={...base,intent:"runs",status:/warning|تحذير/.test(q)?"yellow":"red"};
 else if(/issues?|مشكل|مشاكل/.test(q)){
  candidate={...base,intent:"issues",...(run?{runId:run}:{})};
 }else if(/status|حالة|الحالة/.test(q)){
  if(!run)return null;candidate={...base,intent:"status",runId:run};
 }else if(/scrap|scarp|rate|changeover|chageover|downtime|stop|الهدر|القالب|التوقف/.test(q)){
  if(!run||mentioned.length>1)return null;candidate={...base,intent:"metric",runId:run,metric};
 }else return null;
 return {question,candidates:[candidate,{...base,intent:undefined}]};
}
