import {randomBytes,randomUUID,createHash} from "node:crypto";
import argon2 from "argon2";
import type {PoolClient} from "pg";
import {accountTransaction,scope,audit} from "./context";
import {ImportError} from "../imports/model";

const unavailable=()=>new ImportError("INVITATION_UNAVAILABLE",404);
export const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export const hashPassword=(password:string)=>argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
function invitation(row:any) {
  return {id:row.id,email:row.email,role:row.role,createdAt:row.created_at.toISOString(),
    expiresAt:row.expires_at.toISOString(),status:row.expires_at.getTime()<=Date.now()?"expired":"pending"};
}
async function eligible(c:PoolClient,factory:string,email:string) {
  // Serialize same-email account creation without exposing the address in errors.
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
  const user=(await c.query("SELECT id,platform_admin FROM users WHERE email=$1",[email])).rows[0];
  if(!user) return undefined;
  if(user.platform_admin) throw unavailable();
  await c.query("SELECT set_config('app.user_id',$1,true)",[user.id]);
  const memberships=(await c.query("SELECT factory_id,active FROM memberships WHERE user_id=$1",[user.id])).rows;
  // Phase 8 must not reset credentials or add memberships of another factory.
  if(memberships.some(m=>m.factory_id!==factory||m.active)||!memberships.length) throw unavailable();
  return user.id as string;
}
export async function listInvitations(c:PoolClient,factory:string,page:number) {
  const r=await c.query(`SELECT * FROM invitations WHERE factory_id=$1 AND revoked_at IS NULL AND accepted_at IS NULL
    ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[factory,(page-1)*20]);
  const n=await c.query("SELECT count(*)::int AS n FROM invitations WHERE factory_id=$1 AND revoked_at IS NULL AND accepted_at IS NULL",[factory]);
  return {items:r.rows.map(invitation),page,total:n.rows[0].n};
}
export async function createInvitation(c:PoolClient,factory:string,actor:string,input:{email:string;role:string}) {
  const email=input.email.trim().toLowerCase(),existing=await eligible(c,factory,email);
  const pending=await c.query("SELECT 1 FROM invitations WHERE factory_id=$1 AND email=$2 AND revoked_at IS NULL AND accepted_at IS NULL",[factory,email]);
  if(pending.rowCount) throw unavailable();
  const token=randomBytes(32).toString("base64url");
  const row=(await c.query(`INSERT INTO invitations(id,factory_id,email,role,token_hash,created_by,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days') RETURNING *`,[randomUUID(),factory,email,input.role,tokenHash(token),actor])).rows[0];
  if(existing) await c.query("UPDATE memberships SET recovery_required=true WHERE factory_id=$1 AND user_id=$2",[factory,existing]);
  await audit(c,factory,actor,existing??null,"invite_created",input.role);
  return {invitation:invitation(row),path:`/invite/${token}`};
}
export async function revokeInvitation(c:PoolClient,factory:string,actor:string,id:string) {
  const r=await c.query(`UPDATE invitations SET revoked_at=now() WHERE factory_id=$1 AND id=$2
    AND accepted_at IS NULL AND revoked_at IS NULL RETURNING email,role`,[factory,id]);
  if(!r.rowCount) throw unavailable();
  await audit(c,factory,actor,null,"invite_revoked",r.rows[0].role);
  return r.rows[0];
}
export async function reissueInvitation(c:PoolClient,factory:string,actor:string,id:string) {
  const old=await revokeInvitation(c,factory,actor,id);
  return createInvitation(c,factory,actor,old);
}
async function tokenLookup(c:PoolClient,token:string,lock=false) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unavailable();
  await c.query("SELECT set_config('app.invite_hash',$1,true)",[tokenHash(token)]);
  const row=(await c.query(`SELECT * FROM invitations WHERE token_hash=$1 AND revoked_at IS NULL
    AND accepted_at IS NULL AND expires_at>now() ${lock?"FOR UPDATE":""}`,[tokenHash(token)])).rows[0];
  if(!row) throw unavailable();
  if(row.created_by===null){
    // Deployment onboarding may never reopen after any account is present.
    // Same lock as the deployment initializer; held until acceptance commits.
    await c.query("SELECT pg_advisory_xact_lock(190011)");
    if((await c.query("SELECT 1 FROM users LIMIT 1")).rowCount)throw unavailable();
  }
  return row;
}
export async function invitationDetails(token:string) {
  return accountTransaction(async c=>{
    const row=await tokenLookup(c,token);
    await scope(c,row.factory_id);
    const f=(await c.query("SELECT name FROM factories WHERE id=$1 AND status='active'",[row.factory_id])).rows[0];
    if(!f) throw unavailable();
    return {factoryName:f.name,email:row.email,role:row.role,expiresAt:row.expires_at.toISOString()};
  });
}
export async function acceptInvitation(input:{token:string;name:string;password:string}) {
  // Hash before the transaction, but rate-limit the route before this work.
  const hash=await hashPassword(input.password);
  return accountTransaction(async c=>{
    const found=await tokenLookup(c,input.token);
    await scope(c,found.factory_id);
    const f=await c.query("SELECT id FROM factories WHERE id=$1 AND status='active' FOR NO KEY UPDATE",[found.factory_id]);
    if(!f.rowCount) throw unavailable();
    const row=await tokenLookup(c,input.token,true);
    const existing=await eligible(c,row.factory_id,row.email),id=existing??randomUUID();
    if(existing) {
      await c.query("UPDATE users SET name=$2,password_hash=$3,session_version=session_version+1 WHERE id=$1",[id,input.name,hash]);
      await c.query("UPDATE memberships SET active=true,recovery_required=false,role=$3 WHERE factory_id=$1 AND user_id=$2",[row.factory_id,id,row.role]);
      await audit(c,row.factory_id,id,id,"password_changed");
      await audit(c,row.factory_id,id,id,"member_reactivated");
    } else {
      await c.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",[id,row.email,input.name,hash]);
      await c.query("INSERT INTO memberships(user_id,factory_id,role) VALUES($1,$2,$3)",[id,row.factory_id,row.role]);
    }
    await c.query("UPDATE invitations SET accepted_at=now() WHERE id=$1 AND factory_id=$2",[row.id,row.factory_id]);
    await audit(c,row.factory_id,id,id,"invite_accepted",row.role);
    const version=(await c.query("SELECT session_version FROM users WHERE id=$1",[id])).rows[0].session_version;
    return {id,factory:row.factory_id as string,version:version as number};
  });
}
