import {createHash,randomUUID} from "node:crypto";
import type {Context} from "../imports/service";
import type {AiExplanation,AiExplanationInput,RunComparison} from "@workspace/api-zod";
import {ImportError} from "../imports/model";
import {compare} from "../metrics/service";
import {buildFacts,validateAnswer,reconciliationFacts} from "./facts";
import {provider,ProviderError,type AIProvider} from "./provider";
export function config(){
 const n=(key:string,fallback:number,max:number)=>{const v=Number(process.env[key]);return Number.isSafeInteger(v)&&v>0?Math.min(v,max):fallback;};
 return {daily:n("AI_DAILY_CAP",50,10000),minute:n("AI_USER_PER_MINUTE",3,60),timeout:n("AI_TIMEOUT_MS",12000,30000),
  cache:n("AI_CACHE_SECONDS",300,3600),failures:n("AI_BREAKER_FAILURES",3,20),cooldown:n("AI_BREAKER_SECONDS",60,3600)};
}
export async function loadFacts(ctx:Context,input:AiExplanationInput){
 let comparison:RunComparison;
 if(input.snapshotId){
  const row=(await ctx.db.query("SELECT payload FROM analysis_snapshots WHERE factory_id=$1 AND id=$2",[ctx.factory,input.snapshotId])).rows[0];
  if(!row)throw new ImportError("NOT_FOUND",404);
  comparison=row.payload;
 }else{
  if(!input.a||!input.b)throw new ImportError("INVALID_INPUT");
  comparison=await compare(ctx,input.a,input.b);
 }
 const result=buildFacts(comparison,input.language,input.snapshotId);
 if(input.snapshotId){
  const row=(await ctx.db.query("SELECT payload AS result FROM reconciliations WHERE factory_id=$1 AND snapshot_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",[ctx.factory,input.snapshotId])).rows[0];
  if(row){
   const extra=reconciliationFacts(row.result,input.language,input.snapshotId);
   result.facts.push(...extra);result.packed.facts.push(...extra.map(({source,...f})=>f));
  }
 }
 return result;
}
export async function explain(ctx:Context,input:AiExplanationInput,signal?:AbortSignal,internalQuestion?:string){
 const data=await loadFacts(ctx,input),p=provider(),cfg=config(),started=Date.now();
 const result=(status:AiExplanation["status"],retryAfter=0):AiExplanation=>({
  status,statements:[],facts:data.facts,fallback:data.fallback,retryAfter,cached:false,
 });
 // The consent writer takes this same lock. Do not lock factories FOR SHARE:
 // PostgreSQL would also apply its manager-only UPDATE policy to readers.
 // Other factories and ordinary read pages remain available.
 if(!(await ctx.db.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) ok",[`ai:${ctx.factory}`])).rows[0].ok)return result("quota",2);
 const f=(await ctx.db.query("SELECT settings FROM factories WHERE id=$1",[ctx.factory])).rows[0];
 if(f?.settings?.aiEnabled!==true)return result("off");
 if(!p.configured)return result("unavailable");
 const counts=(await ctx.db.query(`SELECT count(*) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int daily,
 count(*) FILTER(WHERE actor_id=$2 AND created_at>now()-interval '1 minute')::int AS "minute" FROM ai_usage WHERE factory_id=$1 AND created_at>now()-interval '1 day'`,
 [ctx.factory,ctx.user])).rows[0];
 if(counts.daily>=cfg.daily||counts.minute>=cfg.minute)return result("quota",counts.daily>=cfg.daily?86400:60);
 await ctx.db.query("INSERT INTO ai_state(factory_id,state) VALUES($1,'{}') ON CONFLICT DO NOTHING",[ctx.factory]);
 const state=(await ctx.db.query("SELECT state FROM ai_state WHERE factory_id=$1 FOR UPDATE",[ctx.factory])).rows[0].state;
 const now=Date.now();
 if(state.openUntil>now)return result("unavailable",Math.ceil((state.openUntil-now)/1000));
 const question=(internalQuestion??"").slice(0,1000); // Internal tests only, never selects any record.
 const key=createHash("sha256").update(JSON.stringify([ctx.factory,input.snapshotId?"snapshot":"comparison",p.model,data.packed,question])).digest("hex");
 const audit=async(status:string,tokens?:number)=>ctx.db.query(
  "INSERT INTO ai_usage(id,factory_id,actor_id,task,status,model,latency,tokens) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
  [randomUUID(),ctx.factory,ctx.user,input.snapshotId?"snapshot":"comparison",status,p.model,Date.now()-started,tokens??null]);
 if(state.cache?.key===key&&state.cache.expires>now){
  const valid=validateAnswer({statements:state.cache.statements},data.packed);
  if(valid){await audit("cached");return {...result("verified"),statements:valid,cached:true};}
 }
 const controller=new AbortController(),abort=()=>controller.abort();
 signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(abort,cfg.timeout);
 let tokens:number|undefined;
 try{
  let valid=null;
  for(let attempt=0;attempt<2;attempt++){
   const r=await abortable(p,{facts:data.packed,language:input.language,question,corrective:attempt>0},controller.signal);
   if(r.tokens!==undefined)tokens=(tokens??0)+r.tokens;
   valid=validateAnswer(r.output,data.packed);if(valid)break;
  }
  if(!valid)throw new ProviderError("unavailable");
  await ctx.db.query("UPDATE ai_state SET state=$2 WHERE factory_id=$1",[ctx.factory,JSON.stringify({
    failures:0,cache:{key,expires:Date.now()+cfg.cache*1000,statements:valid}})]);
  await audit("verified",tokens);
  return {...result("verified"),statements:valid};
 }catch(e){
  const error=e instanceof ProviderError?e:new ProviderError("network");
  const failures=(state.failures??0)+1;
  await ctx.db.query("UPDATE ai_state SET state=$2 WHERE factory_id=$1",[ctx.factory,JSON.stringify({
   failures,openUntil:failures>=cfg.failures?Date.now()+cfg.cooldown*1000:0,
  })]);
  await audit(error.kind,tokens);
  return result(error.kind==="quota"?"quota":error.kind==="unavailable"?"unavailable":"error",error.retryAfter);
 }finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);}
}
export async function abortable(p:AIProvider,input:Parameters<AIProvider["generate"]>[0],signal:AbortSignal){
 if(signal.aborted)throw new ProviderError("timeout");
 let cancel:()=>void=()=>{};
 const timeout=new Promise<never>((_,reject)=>{cancel=()=>reject(new ProviderError("timeout"));signal.addEventListener("abort",cancel,{once:true});});
 try{return await Promise.race([p.generate(input,signal),timeout]);}finally{signal.removeEventListener("abort",cancel);}
}
