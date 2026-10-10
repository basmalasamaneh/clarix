import {Router,type Request,type Response,type NextFunction} from "express";
import {z} from "zod";
import * as schema from "@workspace/api-zod";
import {pool} from "@workspace/db";
import {sessionView} from "../lib/identity";
import {saveSession} from "../lib/session";
import {ImportError} from "../imports/model";
import {signIn,loginAudit} from "../accounts/auth";
import {factor,securityState,securityAction,listSessions,recover,throttle} from "../accounts/security";
import {isProduction} from "../lib/permissions";
import {getMemberships} from "../lib/tenancy";
const router=Router();
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>async(req:Request,res:Response,next:NextFunction)=>{
 try{await fn(req,res);}catch(e){
  if(e instanceof ImportError){res.status(e.status).json({error:e.code});return;}
  if(e instanceof z.ZodError){res.status(400).json({error:"INVALID_INPUT"});return;}
  next(e);
 }
};
router.post("/auth/second-factor",wrap(async(req,res)=>{
 await throttle("factor-ip",req.ip??"",30,300);
 const input=schema.CompleteSecondFactorBody.strict().parse(req.body),p=req.session.pendingFactor;
 if(!p||Date.now()-p.at>300000)throw new ImportError("INVALID_CREDENTIALS",401);
 const u=(await pool.query("SELECT * FROM users WHERE id=$1",[p.id])).rows[0];
 if(!u||u.session_version!==p.version||(u.test_account&&isProduction())||(!u.platform_admin&&!(await getMemberships(u.id)).length))throw new ImportError("INVALID_CREDENTIALS",401);
 await factor(p.id,input.code);
 await loginAudit(u.id,true);
 res.json(await signIn(req,u.id,u.session_version,undefined,true));
}));
router.post("/auth/recovery",wrap(async(req,res)=>{
 await throttle("recovery-ip",req.ip??"",15,900);
 const input=schema.RecoverAccountBody.strict().parse(req.body);
 await recover(input);
 await new Promise<void>((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));
 res.clearCookie("clarix.sid",{path:"/",httpOnly:true,sameSite:"lax",secure:isProduction()});
 res.status(204).end();
}));
router.use("/auth/security",async(req,res,next)=>{
 try{if(!(await sessionView(req)).user){res.status(401).json({error:"UNAUTHENTICATED"});return;}next();}catch(e){next(e);}
});
router.get("/auth/security",wrap(async(req,res)=>{res.json(schema.GetAccountSecurityResponse.parse(await securityState(req)));}));
router.get("/auth/security/sessions",wrap(async(req,res)=>{
 const page=z.coerce.number().int().min(1).max(1000000).parse(req.query.page??1);
 res.json(schema.GetAccountSessionsResponse.parse(await listSessions(req,page)));
}));
router.post("/auth/security",wrap(async(req,res)=>{
 const input=schema.ChangeAccountSecurityBody.strict().parse(req.body);
 res.json(schema.ChangeAccountSecurityResponse.parse(await securityAction(req,input)));
}));
export const securityEnforcement=async(req:Request,res:Response,next:NextFunction)=>{
 try{
  if(!req.session.userId||req.path.startsWith("/auth/")||req.path==="/preferences"||req.path==="/active-factory"){next();return;}
  const view=await sessionView(req);
  if(view.user&&!view.user.platformAdmin){
   const s=await securityState(req);
   if(s.factoryRequiresMfa&&!s.enrolled&&s.graceUntil&&Date.parse(s.graceUntil)<=Date.now()){
    res.status(423).json({error:"MFA_REQUIRED"});return;
   }
  }
  next();
 }catch(e){next(e);}
};
export default router;
