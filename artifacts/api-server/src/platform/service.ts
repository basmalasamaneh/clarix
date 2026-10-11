import {randomBytes,randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {pool} from "@workspace/db";
import type {FactoryCreation,FactoryAdministration} from "@workspace/api-zod";
import {ImportError} from "../imports/model";
import {tokenHash} from "../accounts/invitations";
import {limits} from "./settings";
export async function platformTransaction<T>(user:string,fn:(c:PoolClient)=>Promise<T>){
  const c=await pool.connect();
  try{
    await c.query("BEGIN");await c.query("SET LOCAL ROLE clarix_platform");
    await c.query("SELECT set_config('app.user_id',$1,true)",[user]);
    if(!(await c.query("SELECT 1 FROM users WHERE id=$1 AND platform_admin",[user])).rowCount)throw new ImportError("FORBIDDEN",403);
    const result=await fn(c);await c.query("COMMIT");return result;
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
export async function platformAudit(c:PoolClient,factory:string|null,actor:string|null,action:string,oldValue:unknown=null,newValue:unknown=null){
  await c.query("INSERT INTO platform_audit(id,factory_id,actor_id,action,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(),factory,actor,action,oldValue===null?null:JSON.stringify(oldValue),newValue===null?null:JSON.stringify(newValue)]);
}
export async function factoryView(c:PoolClient,id:string){
  const f=(await c.query("SELECT * FROM factories WHERE id=$1",[id])).rows[0];
  if(!f)throw new ImportError("NOT_FOUND",404);
  const n=(await c.query("SELECT count(*) FILTER(WHERE active)::int members,count(*) FILTER(WHERE active AND role='factory_manager')::int managers FROM memberships WHERE factory_id=$1",[id])).rows[0];
  const inv=(await c.query("SELECT accepted_at,revoked_at,expires_at FROM invitations WHERE factory_id=$1 AND role='factory_manager' ORDER BY created_at DESC,id DESC LIMIT 1",[id])).rows[0];
  return {id:f.id,demo:f.settings?.demo===true,slug:f.id,name:f.name,status:f.status,defaultLanguage:f.default_language,createdAt:f.created_at?.toISOString()??null,
    activeMembers:n.members,managers:n.managers,lastApprovedAt:f.last_approved_at?.toISOString()??null,limits:limits(f.settings),
    uploadBytesUsage:f.settings?.platformUsage?.uploadBytes??0,rowsUsage:f.settings?.platformUsage?.rows??0,
    invitationStatus:!inv?"none":inv.accepted_at?"accepted":inv.revoked_at?"revoked":inv.expires_at<=new Date()?"expired":"pending"};
}
export async function factories(c:PoolClient,page:number){
  const ids=(await c.query("SELECT id FROM factories ORDER BY name,id LIMIT 20 OFFSET $1",[(page-1)*20])).rows;
  const items=[];for(const {id} of ids)items.push(await factoryView(c,id));
  return {items,page,total:(await c.query("SELECT count(*)::int n FROM factories")).rows[0].n};
}
export async function issue(c:PoolClient,id:string,actor:string,email:string){
  if((await c.query("SELECT 1 FROM users WHERE email=$1",[email])).rowCount)throw new ImportError("INVITATION_UNAVAILABLE",409);
  const token=randomBytes(32).toString("base64url");
  const r=(await c.query(`INSERT INTO invitations(id,factory_id,email,role,token_hash,created_by,expires_at) VALUES($1,$2,$3,'factory_manager',$4,$5,now()+interval '7 days') RETURNING expires_at`,
    [randomUUID(),id,email,tokenHash(token),actor])).rows[0];
  await platformAudit(c,id,actor,"invitation_issued");
  return {factory:await factoryView(c,id),path:`/invite/${token}`,expiresAt:r.expires_at.toISOString()};
}
export async function createFactory(c:PoolClient,actor:string,input:FactoryCreation){
  if(!input.name.trim())throw new ImportError("INVALID_INPUT");
  if((await c.query("SELECT 1 FROM factories WHERE id=$1",[input.slug])).rowCount)throw new ImportError("SLUG_TAKEN",409);
  await c.query("INSERT INTO factories(id,name,default_language,created_at) VALUES($1,$2,$3,now())",[input.slug,input.name.trim(),input.defaultLanguage]);
  await platformAudit(c,input.slug,actor,"factory_created",null,{name:input.name.trim(),slug:input.slug,defaultLanguage:input.defaultLanguage});
  return issue(c,input.slug,actor,input.managerEmail.trim().toLowerCase());
}
export async function invitationAction(c:PoolClient,id:string,actor:string,action:string){
  if(!(await c.query("SELECT id FROM factories WHERE id=$1 FOR NO KEY UPDATE",[id])).rowCount)throw new ImportError("NOT_FOUND",404);
  if((await c.query("SELECT 1 FROM memberships WHERE factory_id=$1 AND active AND role='factory_manager'",[id])).rowCount)throw new ImportError("MANAGER_EXISTS",409);
  const old=(await c.query("SELECT email FROM invitations WHERE factory_id=$1 AND role='factory_manager' AND accepted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1",[id])).rows[0];
  if(!old)throw new ImportError("INVITATION_UNAVAILABLE",404);
  await c.query("UPDATE invitations SET revoked_at=now() WHERE factory_id=$1 AND role='factory_manager' AND accepted_at IS NULL AND revoked_at IS NULL",[id]);
  await platformAudit(c,id,actor,"invitation_revoked");
  return action==="reissue"?issue(c,id,actor,old.email):{factory:await factoryView(c,id),path:null,expiresAt:null};
}
export async function updateFactory(c:PoolClient,id:string,actor:string,input:FactoryAdministration){
  if(!(await c.query("SELECT id FROM factories WHERE id=$1 FOR NO KEY UPDATE",[id])).rowCount)throw new ImportError("NOT_FOUND",404);
  const old=await factoryView(c,id);
  if(input.status&&input.status!==old.status){
    await c.query("UPDATE factories SET status=$2 WHERE id=$1",[id,input.status]);
    // Version invalidation also defeats concurrently re-saved old session rows.
    if(input.status==="suspended")await c.query("UPDATE users SET session_version=session_version+1 WHERE id IN(SELECT user_id FROM memberships WHERE factory_id=$1)",[id]);
    await platformAudit(c,id,actor,input.status==="active"?"factory_reactivated":"factory_suspended");
  }
  if(input.limits){
    await c.query("UPDATE factories SET settings=jsonb_set(settings,'{platformLimits}',$2::jsonb) WHERE id=$1",[id,JSON.stringify(input.limits)]);
    await platformAudit(c,id,actor,"limits_changed",old.limits,input.limits);
  }
  return factoryView(c,id);
}
