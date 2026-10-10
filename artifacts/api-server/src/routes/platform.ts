import {Router,type Request,type Response} from "express";
import * as s from "@workspace/api-zod";
import {sessionView} from "../lib/identity";
import {ImportError} from "../imports/model";
import {managerTransaction} from "../accounts/context";
import {platformTransaction,factories,createFactory,updateFactory,invitationAction} from "../platform/service";
import {getPreferences,savePreferences,managementAudit} from "../platform/settings";
const router=Router();
const page=(r:Request)=>{const n=Number(r.query.page??1);if(!Number.isSafeInteger(n)||n<1)throw new ImportError("INVALID_INPUT");return n;};
const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response)=>{
  try{await fn(req,res);}catch(e){
    if(e instanceof ImportError){res.status(e.status).json({error:e.code,...e.details});return;}
    if(e instanceof Error&&e.name==="ZodError"){res.status(400).json({error:"INVALID_INPUT"});return;}
    if((e as {code?:string})?.code==="23505"){res.status(409).json({error:"CONFLICT"});return;}
    throw e;
  }
};
router.use("/platform",async(req,res,next)=>{
  const view=await sessionView(req);
  if(!view.user||!view.user.platformAdmin){res.status(403).json({error:"FORBIDDEN"});return;}
  res.locals.platformUser=view.user.id;
  next();
});
// Middleware must advance only after the platform identity check.
router.get("/platform/factories",wrap(async(req,res)=>res.json(await platformTransaction(res.locals.platformUser,c=>factories(c,page(req))))));
router.post("/platform/factories",wrap(async(req,res)=>res.status(201).json(await platformTransaction(res.locals.platformUser,c=>createFactory(c,res.locals.platformUser,s.CreatePlatformFactoryBody.strict().parse(req.body))))));
router.patch("/platform/factories/:id",wrap(async(req,res)=>res.json(await platformTransaction(res.locals.platformUser,c=>updateFactory(c,String(req.params.id),res.locals.platformUser,s.UpdatePlatformFactoryBody.strict().parse(req.body))))));
router.post("/platform/factories/:id/invitation",wrap(async(req,res)=>res.json(await platformTransaction(res.locals.platformUser,c=>invitationAction(c,String(req.params.id),res.locals.platformUser,s.ManagePlatformInvitationBody.strict().parse(req.body).action)))));
router.get("/platform/audit",wrap(async(req,res)=>res.json(await platformTransaction(res.locals.platformUser,c=>managementAudit(c,page(req))))));
router.use("/factory-settings",async(req,res,next)=>{
  const view=await sessionView(req);
  if(!view.user){res.status(401).json({error:"UNAUTHENTICATED"});return;}
  if(view.user.platformAdmin||!view.memberships.some(m=>m.factoryId===view.activeFactoryId&&m.role==="factory_manager")){
    res.status(403).json({error:"FORBIDDEN"});return;
  }
  next();
});
router.get("/factory-settings",wrap(async(req,res)=>res.json(await managerTransaction(req,(c,f)=>getPreferences(c,f)))));
router.put("/factory-settings",wrap(async(req,res)=>res.json(await managerTransaction(req,(c,f,u)=>savePreferences(c,f,u,s.SaveFactorySettingsBody.strict().parse(req.body))))));
router.get("/factory-settings/audit",wrap(async(req,res)=>res.json(await managerTransaction(req,(c,f)=>managementAudit(c,page(req),f)))));
export default router;
