import {Router,type Request,type Response,type NextFunction} from "express";
import {rateLimit} from "express-rate-limit";
import {z} from "zod";
import * as schema from "@workspace/api-zod";
import {sessionView} from "../lib/identity";
import {isProduction} from "../lib/permissions";
import {ImportError} from "../imports/model";
import {managerTransaction} from "../accounts/context";
import * as members from "../accounts/members";
import * as invites from "../accounts/invitations";
import {changePassword,logoutEverywhere,loginAudit,signIn} from "../accounts/auth";
const router=Router();
const acceptanceLimit=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:"draft-8",legacyHeaders:false,message:{error:"TOO_MANY_ATTEMPTS"}});
const detailsLimit=rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:"draft-8",legacyHeaders:false,message:{error:"TOO_MANY_ATTEMPTS"}});
const passwordLimit=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:"draft-8",legacyHeaders:false,message:{error:"TOO_MANY_ATTEMPTS"}});
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try {await fn(req,res);}
  catch(e){
    if(e instanceof ImportError){res.status(e.status).json({error:e.code});return;}
    if(e instanceof z.ZodError){res.status(400).json({error:"INVALID_INPUT"});return;}
    next(e);
  }
};
router.get("/auth/invitation",detailsLimit,wrap(async(req,res)=>{
  const token=typeof req.query.token==="string"?req.query.token:"";
  res.json(schema.GetInvitationDetailsResponse.parse(await invites.invitationDetails(token)));
}));
router.post("/auth/invitation",acceptanceLimit,wrap(async(req,res)=>{
  const input=schema.AcceptInvitationBody.refine(v=>Array.from(v.password).length>=12).safeParse(req.body);
  if(!input.success){res.status(400).json({error:"INVITATION_UNAVAILABLE"});return;}
  const name=input.data.name.trim();
  if(!name){res.status(400).json({error:"INVALID_INPUT"});return;}
  const account=await invites.acceptInvitation({...input.data,name});
  await loginAudit(account.id,true);
  res.json(await signIn(req,account.id,account.version,account.factory));
}));
router.post("/auth/password",passwordLimit,wrap(async(req,res)=>{
  const view=await sessionView(req);
  if(!view.user){res.status(401).json({error:"UNAUTHENTICATED"});return;}
  const input=schema.ChangePasswordBody.refine(v=>Array.from(v.newPassword).length>=12).parse(req.body);
  res.json(await changePassword(req,input));
}));
router.post("/auth/logout-everywhere",wrap(async(req,res)=>{
  const view=await sessionView(req);
  if(!view.user){res.status(401).json({error:"UNAUTHENTICATED"});return;}
  await logoutEverywhere(req);
  res.clearCookie("clarix.sid",{path:"/",httpOnly:true,sameSite:"lax",secure:isProduction()});
  res.status(204).end();
}));
// Scope this middleware to /members only; public auth routes must remain reachable.
router.use("/members",async(req,res,next)=>{
  try {
  const view=await sessionView(req);
  if(!view.user){res.status(401).json({error:"UNAUTHENTICATED"});return;}
  if(view.user.platformAdmin||!view.memberships.some(m=>m.factoryId===view.activeFactoryId&&m.role==="factory_manager")){
    res.status(403).json({error:"FORBIDDEN"});return;
  }
  next();
  } catch(e){next(e);}
});
const page=(req:Request)=>z.coerce.number().int().min(1).max(1000000).parse(req.query.page??1);
router.get("/members",wrap(async(req,res)=>{
  res.json(schema.GetMembersResponse.parse(await managerTransaction(req,(c,f)=>members.listMembers(c,f,page(req)))));
}));
router.get("/members/invitations",wrap(async(req,res)=>{
  res.json(schema.GetInvitationsResponse.parse(await managerTransaction(req,(c,f)=>invites.listInvitations(c,f,page(req)))));
}));
router.post("/members/invitations",wrap(async(req,res)=>{
  // Zod strips client-supplied factory_id/identity; scope always comes from session.
  const input=schema.CreateInvitationBody.parse(req.body);
  res.status(201).json(schema.CreateInvitationResponse.parse(await managerTransaction(req,(c,f,u)=>invites.createInvitation(c,f,u,input))));
}));
router.post("/members/invitations/:id/revoke",wrap(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  await managerTransaction(req,(c,f,u)=>invites.revokeInvitation(c,f,u,id));
  res.status(204).end();
}));
router.post("/members/invitations/:id/reissue",wrap(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  res.status(201).json(schema.ReissueInvitationResponse.parse(await managerTransaction(req,(c,f,u)=>invites.reissueInvitation(c,f,u,id))));
}));
router.get("/members/audit",wrap(async(req,res)=>{
  res.json(schema.GetMemberAuditResponse.parse(await managerTransaction(req,(c,f)=>members.memberAudit(c,f))));
}));
router.patch("/members/:id",wrap(async(req,res)=>{
  const id=z.string().min(1).max(100).parse(req.params.id),input=schema.UpdateMemberBody.parse(req.body);
  if(!Object.keys(input).length){res.status(400).json({error:"INVALID_INPUT"});return;}
  res.json(schema.UpdateMemberResponse.parse(await managerTransaction(req,(c,f,u)=>members.updateMember(c,f,u,id,input))));
}));
export default router;
