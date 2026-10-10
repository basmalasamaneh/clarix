import {Router,type Request,type Response,type NextFunction} from "express";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {SaveAiConsentBody,ExplainAiBody} from "@workspace/api-zod";
import {sessionView} from "../lib/identity";
import {withRequestTenant,TenantAccessError} from "../lib/tenancy";
import {managerTransaction} from "../accounts/context";
import {ImportError} from "../imports/model";
import {explain} from "../ai/service";
import {provider} from "../ai/provider";
const router=Router();
const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 try{
  const view=await sessionView(req);
  if(!view.user)throw new ImportError("UNAUTHENTICATED",401);
  if(view.user.platformAdmin||!view.activeFactoryId)throw new ImportError("FORBIDDEN",403);
  await fn(req,res);
 }catch(e){
  if(e instanceof ImportError){res.status(e.status).json({error:e.code});return;}
  if(e instanceof TenantAccessError){res.status(403).json({error:"FORBIDDEN"});return;}
  if(e instanceof z.ZodError){res.status(400).json({error:"INVALID_INPUT"});return;}
  next(e);
 }
};
router.get("/ai/consent",wrap(async(req,res)=>{
 const enabled=await withRequestTenant(req,async c=>(await c.query("SELECT settings->'aiEnabled' AS enabled FROM factories WHERE id=$1",[req.session.activeFactoryId])).rows[0]?.enabled===true);
 res.json({enabled,configured:provider().configured});
}));
router.put("/ai/consent",wrap(async(req,res)=>{
 const input=SaveAiConsentBody.strict().parse(req.body);
 if(input.enabled&&!input.confirmed)throw new ImportError("AI_CONFIRMATION_REQUIRED");
 await managerTransaction(req,async(c,f,u)=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`ai:${f}`]);
  const old=(await c.query("SELECT settings->'aiEnabled' AS enabled FROM factories WHERE id=$1",[f])).rows[0]?.enabled===true;
  if(old===input.enabled)return;
  await c.query("UPDATE factories SET settings=settings||$2::jsonb WHERE id=$1",[f,JSON.stringify({aiEnabled:input.enabled})]);
  await c.query("INSERT INTO factory_settings_audit(id,factory_id,actor_id,action,old_value,new_value) VALUES($1,$2,$3,'ai_consent_changed',$4,$5)",
   [randomUUID(),f,u,JSON.stringify({enabled:old}),JSON.stringify({enabled:input.enabled,disclosure:"gemini-unpaid-2026-03-23"})]);
 });
 res.json({enabled:input.enabled,configured:provider().configured});
}));
router.post("/ai/explain",wrap(async(req,res)=>{
 const input=ExplainAiBody.strict().parse(req.body);
 if(input.snapshotId?Boolean(input.a||input.b):!(input.a&&input.b))throw new ImportError("INVALID_INPUT");
 const controller=new AbortController();const close=()=>{if(!res.writableEnded)controller.abort();};res.on("close",close);
 try{
  const result=await withRequestTenant(req,async db=>explain({db,factory:req.session.activeFactoryId!,user:req.session.userId!,settings:{}},input,controller.signal));
  if(result.retryAfter)res.setHeader("Retry-After",result.retryAfter);
  res.json(result);
 }finally{res.removeListener("close",close);}
}));
export default router;
