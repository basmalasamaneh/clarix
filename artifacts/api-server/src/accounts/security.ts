import type {Request} from "express";
import type {PoolClient} from "pg";
import type {SecurityActionInput} from "@workspace/api-zod";
import {pool} from "@workspace/db";
import {randomUUID} from "node:crypto";
import argon2 from "argon2";
import {accountTransaction,scope,audit,managerTransaction} from "./context";
import {digest,token,encrypt,decrypt,newTotp,totp,validStep,passwordAllowed} from "./security-crypto";
import {notifications} from "./notifications";
import {ImportError} from "../imports/model";
import {isProduction} from "../lib/permissions";
import {saveSession} from "../lib/session";

export const adminMfaRequired=()=>process.env.CLARIX_REQUIRE_ADMIN_MFA===undefined?isProduction():process.env.CLARIX_REQUIRE_ADMIN_MFA!=="false";
const unavailable=()=>new ImportError("RECOVERY_UNAVAILABLE",400);
export async function state(c:PoolClient,id:string,lock=false){
 await scope(c,"",id);
 await c.query("INSERT INTO account_security(user_id) VALUES($1) ON CONFLICT DO NOTHING",[id]);
 return (await c.query(`SELECT * FROM account_security WHERE user_id=$1 ${lock?"FOR UPDATE":""}`,[id])).rows[0];
}
export async function securityEvent(c:PoolClient,id:string,action:string){
 await scope(c,"",id);
 await c.query("INSERT INTO security_audit(id,user_id,action) VALUES($1,$2,$3)",[randomUUID(),id,action]);
 const memberships=(await c.query("SELECT factory_id FROM memberships WHERE user_id=$1",[id])).rows;
 for(const m of memberships){await scope(c,m.factory_id,id);await audit(c,m.factory_id,id,id,action);}
 await scope(c,"",id);
}
// This is deliberately its own committed transaction. Failure counters must not
// roll back along with a rejected password/code or reset request.
export async function throttle(kind:string,value:string,limit:number,seconds=900){
 const key=digest(kind+":"+value);
 const hits=await accountTransaction(async c=>{
  await c.query("SELECT set_config('app.rate_key',$1,true)",[key]);
  return (await c.query(`INSERT INTO security_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second')
   ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN security_limits.expires_at<now() THEN 1 ELSE security_limits.hits+1 END,
   expires_at=CASE WHEN security_limits.expires_at<now() THEN now()+$2*interval '1 second' ELSE security_limits.expires_at END RETURNING hits`,[key,seconds])).rows[0].hits;
 });
 if(hits>limit)throw new ImportError("TOO_MANY_ATTEMPTS",429);
}
export async function clearLimit(kind:string,value:string){
 const key=digest(kind+":"+value);
 await accountTransaction(async c=>{await c.query("SELECT set_config('app.rate_key',$1,true)",[key]);await c.query("UPDATE security_limits SET hits=0 WHERE key=$1",[key]);});
}
export async function needsFactor(id:string){
 return accountTransaction(async c=>{
  await scope(c,"",id);
  const s=(await c.query("SELECT enabled FROM account_security WHERE user_id=$1",[id])).rows[0];
  const u=(await c.query("SELECT platform_admin FROM users WHERE id=$1",[id])).rows[0];
  return !!s?.enabled&&!(u?.platform_admin&&!adminMfaRequired());
 });
}
export async function factor(id:string,code:string){
 await throttle("factor",id,5,300);
 const valid=await accountTransaction(async c=>{
  const s=await state(c,id,true);
  if(!s.enabled)return false;
  const hash=digest(code.trim().toUpperCase()),codes=s.recovery_hashes as string[];
  if(codes.includes(hash)){
   await c.query("UPDATE account_security SET recovery_hashes=$2 WHERE user_id=$1",[id,JSON.stringify(codes.filter(x=>x!==hash))]);
   await securityEvent(c,id,"mfa_recovery_used");return true;
  }
  const secret=decrypt(s.secret,id),step=validStep(secret,code.trim(),Number(s.last_step));
  if(step===null)return false;
  // Lazy re-encryption permits overlap-key rotation without exposing plaintext.
  await c.query("UPDATE account_security SET last_step=$2,secret=$3 WHERE user_id=$1",[id,step,encrypt(secret,id)]);
  return true;
 });
 if(!valid)throw new ImportError("INVALID_CREDENTIALS",401);
 await clearLimit("factor",id);
}
export async function verifyPassword(req:Request,password?:string,code?:string,requireFactor=true){
 const id=req.session.userId!;
 await throttle("reauth",id,8,900);
 const user=(await pool.query("SELECT password_hash FROM users WHERE id=$1",[id])).rows[0];
 if(!user||!password||!await argon2.verify(user.password_hash,password))throw new ImportError("INVALID_CREDENTIALS",401);
 const enrolled=await accountTransaction(async c=>{await scope(c,"",id);return !!(await c.query("SELECT enabled FROM account_security WHERE user_id=$1",[id])).rows[0]?.enabled;});
 if(requireFactor&&enrolled)await factor(id,code??"");
 req.session.confirmedAt=Date.now();await saveSession(req);
 await clearLimit("reauth",id);
}
export function recent(req:Request){
 if(Date.now()-(req.session.confirmedAt??req.session.authenticatedAt??0)>300000)throw new ImportError("RECENT_SIGN_IN_REQUIRED",403);
}
export async function sessionRevoked(id:string,sid:string){
 return accountTransaction(async c=>{
  await scope(c,"",id);
  return !!(await c.query("SELECT 1 FROM revoked_sessions WHERE id=$1 AND user_id=$2",[digest(sid),id])).rowCount;
 });
}
export async function securityState(req:Request){
 const id=req.session.userId!;
 return accountTransaction(async c=>{
  await scope(c,"",id);
  const s=(await c.query("SELECT * FROM account_security WHERE user_id=$1",[id])).rows[0];
  const u=(await c.query("SELECT platform_admin FROM users WHERE id=$1",[id])).rows[0];
  await scope(c,req.session.activeFactoryId??"",id);
  const f=(await c.query("SELECT settings FROM factories WHERE id=$1",[req.session.activeFactoryId??""])).rows[0];
  const policy=f?.settings?.security??{};
  const managers=await c.query("SELECT count(*)::int AS n FROM memberships WHERE factory_id=$1 AND active AND role='factory_manager'",[req.session.activeFactoryId??""]);
  return {enrolled:!!s?.enabled,setupRequired:!s?.enabled&&((u.platform_admin&&adminMfaRequired())||!!policy.requireMfa),
   recoveryRemaining:s?.recovery_hashes?.length??0,hasRecoveryKey:!!s?.recovery_key_hash,
   singleManager:managers.rows[0].n===1,factoryRequiresMfa:!!policy.requireMfa,graceUntil:policy.graceUntil??null,lastSignIn:s?.last_sign_in?.toISOString()??null};
 });
}
export async function listSessions(req:Request,page:number){
 const id=req.session.userId!,pageSize=20;
 const rows=(await pool.query(`SELECT sid,sess FROM sessions WHERE expire>now() AND sess->>'userId'=$1
 AND coalesce((sess->>'authVersion')::int,0)=$2 ORDER BY (sess->>'lastActiveAt')::bigint DESC NULLS LAST LIMIT $3 OFFSET $4`,
 [id,req.session.authVersion??0,pageSize,(page-1)*pageSize])).rows;
 const total=(await pool.query(`SELECT count(*)::int AS n FROM sessions WHERE expire>now() AND sess->>'userId'=$1 AND coalesce((sess->>'authVersion')::int,0)=$2`,[id,req.session.authVersion??0])).rows[0].n;
 const items=[];
 for(const row of rows){
  if(await sessionRevoked(id,row.sid))continue;
  items.push({id:digest(row.sid),device:row.sess.device??"Unknown",lastActive:new Date(row.sess.lastActiveAt??row.sess.authenticatedAt??0).toISOString(),current:row.sid===req.sessionID});
 }
 return {items,total,page,pageSize};
}
async function revoke(req:Request,all:boolean,sessionId?:string){
 recent(req);
 const id=req.session.userId!;
 const rows=(await pool.query("SELECT sid FROM sessions WHERE sess->>'userId'=$1",[id])).rows;
 const chosen=rows.filter(r=>all?r.sid!==req.sessionID:digest(r.sid)===sessionId);
 if(!all&&!chosen.length)throw new ImportError("NOT_FOUND",404);
 await accountTransaction(async c=>{
  await scope(c,"",id);
  for(const r of chosen)await c.query("INSERT INTO revoked_sessions(id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[digest(r.sid),id]);
  await securityEvent(c,id,all?"sessions_revoked":"session_revoked");
 });
 for(const r of chosen)await pool.query("DELETE FROM sessions WHERE sid=$1 AND sess->>'userId'=$2",[r.sid,id]);
}
export async function securityAction(req:Request,input:SecurityActionInput){
 const id=req.session.userId!;
 if(input.action==="reauth"){await verifyPassword(req,input.password,input.code);return {ok:true};}
 if(input.action==="revoke-session"||input.action==="revoke-others"){await revoke(req,input.action==="revoke-others",input.sessionId);return {ok:true};}
 if(["enroll","disable"].includes(input.action))await verifyPassword(req,input.password,input.code);
 recent(req);
 if(input.action==="enroll"){
  const raw=newTotp(),cipher=encrypt(raw,id);
  await accountTransaction(async c=>{await state(c,id,true);await c.query(`UPDATE account_security SET pending_secret=$2,pending_until=now()+interval '10 minutes',
    pending_confirmed=false,pending_hashes='[]' WHERE user_id=$1`,[id,cipher]);await securityEvent(c,id,"mfa_enrollment_started");});
  return {ok:true,key:raw,uri:totp(raw).toString()};
 }
 if(input.action==="confirm"){
  await throttle("enroll-code",id,5,300);
  const codes=Array.from({length:10},()=>token().slice(0,22).toUpperCase());
  await accountTransaction(async c=>{
   const s=await state(c,id,true);
   if(!s.pending_secret||s.pending_confirmed||new Date(s.pending_until).getTime()<Date.now())throw new ImportError("ENROLLMENT_UNAVAILABLE",400);
   const step=validStep(decrypt(s.pending_secret,id),input.code??"",-1);
   if(step===null)throw new ImportError("INVALID_CREDENTIALS",401);
   await c.query("UPDATE account_security SET pending_confirmed=true,pending_hashes=$2,pending_step=$3 WHERE user_id=$1",[id,JSON.stringify(codes.map(digest)),step]);
  });
  return {ok:true,recoveryCodes:codes};
 }
 if(input.action==="acknowledge"){
  await accountTransaction(async c=>{
   const s=await state(c,id,true);
   if(!s.pending_confirmed||!s.pending_secret||new Date(s.pending_until).getTime()<Date.now())throw new ImportError("ENROLLMENT_UNAVAILABLE",400);
   await c.query(`UPDATE account_security SET secret=pending_secret,enabled=true,recovery_hashes=pending_hashes,
    pending_secret=null,pending_until=null,pending_hashes='[]',pending_confirmed=false,last_step=$2,pending_step=null WHERE user_id=$1`,[id,Number(s.pending_step)]);
   const u=(await c.query("UPDATE users SET session_version=session_version+1 WHERE id=$1 AND session_version=$2 RETURNING session_version",[id,req.session.authVersion??0])).rows[0];
   if(!u)throw new ImportError("UNAUTHENTICATED",401);
   req.session.authVersion=u.session_version;req.session.factorVerified=true;
   await securityEvent(c,id,"mfa_enabled");
  });await saveSession(req);return {ok:true};
 }
 if(input.action==="disable"){
  const view=await securityState(req);
  const u=(await pool.query("SELECT platform_admin FROM users WHERE id=$1",[id])).rows[0];
  if(view.factoryRequiresMfa||(u.platform_admin&&adminMfaRequired()))throw new ImportError("MFA_REQUIRED",403);
  await accountTransaction(async c=>{
   await state(c,id,true);
   await c.query(`UPDATE account_security SET enabled=false,secret=null,recovery_hashes='[]',pending_secret=null,pending_hashes='[]',pending_confirmed=false WHERE user_id=$1`,[id]);
   const u=(await c.query("UPDATE users SET session_version=session_version+1 WHERE id=$1 AND session_version=$2 RETURNING session_version",[id,req.session.authVersion??0])).rows[0];
   if(!u)throw new ImportError("UNAUTHENTICATED",401);
   req.session.authVersion=u.session_version;
   await securityEvent(c,id,"mfa_disabled");
  });await saveSession(req);return {ok:true};
 }
 if(input.action==="recovery-key"){
  const raw=token();
  await managerTransaction(req,async(c,f,u)=>{await state(c,u,true);await c.query("UPDATE account_security SET recovery_key_hash=$2 WHERE user_id=$1",[u,digest(raw)]);await securityEvent(c,u,"recovery_key_created");});
  return {ok:true,key:raw};
 }
 if(input.action==="require-mfa"){
  if(typeof input.required!=="boolean")throw new ImportError("INVALID_INPUT",400);
  await managerTransaction(req,async(c,f,u)=>{
   await c.query(`UPDATE factories SET settings=jsonb_set(settings,'{security}',$2::jsonb) WHERE id=$1`,[f,JSON.stringify({requireMfa:input.required,graceUntil:input.required?new Date(Date.now()+7*86400000).toISOString():null})]);
   await audit(c,f,u,null,input.required?"mfa_required":"mfa_requirement_removed");
   await notifications.notify({kind:"mfa-policy",factoryId:f});
  });return {ok:true};
 }
 if(input.action==="issue-reset"){
  const raw=token(),resetId=randomUUID();
  await managerTransaction(req,async(c,f,u)=>{
   if(input.memberId===u)throw new ImportError("SELF_RESET_FORBIDDEN",403);
   const member=(await c.query(`SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.factory_id=$1 AND m.user_id=$2 AND m.active AND NOT u.platform_admin`,[f,input.memberId??""])).rows[0];
   if(!member)throw new ImportError("NOT_FOUND",404);
   // A tenant manager cannot reset a global credential that also grants access
   // to another tenant. Existing onboarding already prohibits this association.
   await scope(c,f,member.user_id);
   if((await c.query("SELECT 1 FROM memberships WHERE user_id=$1 AND factory_id<>$2 AND active",[member.user_id,f])).rowCount)throw new ImportError("NOT_FOUND",404);
   await scope(c,f,u);
   await c.query("UPDATE password_resets SET revoked_at=now() WHERE factory_id=$1 AND user_id=$2 AND revoked_at IS NULL AND completed_at IS NULL",[f,member.user_id]);
   await c.query("INSERT INTO password_resets(id,factory_id,user_id,issued_by,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours')",[resetId,f,member.user_id,u,digest(raw)]);
   await audit(c,f,u,member.user_id,"password_reset_issued");await notifications.notify({kind:"reset-issued",factoryId:f,subjectId:member.user_id});
  });return {ok:true,token:raw,resetId};
 }
 if(input.action==="revoke-reset"){
  await managerTransaction(req,async(c,f,u)=>{
   const r=await c.query("UPDATE password_resets SET revoked_at=now() WHERE (id=$1 OR ($1 IS NULL AND user_id=$3)) AND factory_id=$2 AND revoked_at IS NULL AND completed_at IS NULL RETURNING user_id",[input.resetId??null,f,input.memberId??""]);
   if(!r.rowCount)throw new ImportError("NOT_FOUND",404);
   await audit(c,f,u,r.rows[0].user_id,"password_reset_revoked");
  });return {ok:true};
 }
 throw new ImportError("INVALID_INPUT",400);
}
export async function recover(input:{password:string;token?:string;email?:string;recoveryKey?:string}){
 passwordAllowed(input.password);
 const hashed=await argon2.hash(input.password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
 await accountTransaction(async c=>{
  let id:string,factory:string,reset:string|undefined;
  if(input.token){
   await c.query("SELECT set_config('app.reset_hash',$1,true)",[digest(input.token)]);
   const r=(await c.query("SELECT * FROM password_resets WHERE token_hash=$1 FOR UPDATE",[digest(input.token)])).rows[0];
   if(!r||r.revoked_at||r.completed_at||new Date(r.expires_at).getTime()<=Date.now())throw unavailable();
   id=r.user_id;factory=r.factory_id;reset=r.id;
  }else{
   if(!input.recoveryKey||!input.email)throw unavailable();
   await c.query("SELECT set_config('app.recovery_hash',$1,true)",[digest(input.recoveryKey)]);
   const r=(await c.query("SELECT user_id FROM account_security WHERE recovery_key_hash=$1 FOR UPDATE",[digest(input.recoveryKey)])).rows[0];
   if(!r)throw unavailable();
   id=r.user_id;await scope(c,"",id);
   const m=(await c.query("SELECT factory_id FROM memberships WHERE user_id=$1 AND active AND role='factory_manager' ORDER BY factory_id LIMIT 1",[id])).rows[0];
   if(!m)throw unavailable();factory=m.factory_id;
  }
  await scope(c,factory,id);
  const user=(await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE",[id])).rows[0];
  const member=(await c.query("SELECT 1 FROM memberships WHERE user_id=$1 AND factory_id=$2 AND active",[id,factory])).rowCount;
  const f=(await c.query("SELECT 1 FROM factories WHERE id=$1 AND status='active'",[factory])).rowCount;
  if(!member||!f||user.platform_admin||(user.test_account&&isProduction())||(!reset&&user.email!==input.email?.trim().toLowerCase()))throw unavailable();
  await c.query("UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE id=$1",[id,hashed]);
  if(reset)await c.query("UPDATE password_resets SET completed_at=now() WHERE id=$1",[reset]);
  else await c.query("UPDATE account_security SET recovery_key_hash=null WHERE user_id=$1",[id]);
  await c.query("UPDATE password_resets SET revoked_at=now() WHERE user_id=$1 AND factory_id=$2 AND completed_at IS NULL AND revoked_at IS NULL",[id,factory]);
  await audit(c,factory,id,id,reset?"password_reset_completed":"account_recovery_completed");
  await notifications.notify({kind:"reset-completed",factoryId:factory,subjectId:id});
 });
}
