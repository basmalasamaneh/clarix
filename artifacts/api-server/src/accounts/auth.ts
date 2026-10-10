import type {Request} from "express";
import {db,users} from "@workspace/db";
import {eq} from "drizzle-orm";
import argon2 from "argon2";
import {accountTransaction,scope,audit} from "./context";
import {hashPassword} from "./invitations";
import {ImportError} from "../imports/model";
import {saveSession} from "../lib/session";
import {sessionView} from "../lib/identity";
import {recent,state} from "./security";
export async function loginAudit(userId:string,success:boolean) {
  await accountTransaction(async c=>{
    await scope(c,"",userId);
    const members=(await c.query("SELECT factory_id FROM memberships WHERE user_id=$1",[userId])).rows;
    for(const m of members) {
      await scope(c,m.factory_id,userId);
      await c.query(`UPDATE memberships SET ${success?"last_login=now(),login_success_count=login_success_count+1":"login_failure_count=login_failure_count+1"}
        WHERE user_id=$1 AND factory_id=$2`,[userId,m.factory_id]);
      await audit(c,m.factory_id,success?userId:null,userId,success?"login_success":"login_failure");
    }
  });
}
export async function signIn(req:Request,id:string,version:number,factory?:string,verified=false) {
  await new Promise<void>((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
  req.session.userId=id;req.session.authVersion=version;
  req.session.authenticatedAt=Date.now();req.session.activeFactoryId=factory;
  req.session.lastActiveAt=Date.now();req.session.factorVerified=verified;
  const ua=req.get("user-agent")??"";
  req.session.device=(/Firefox/i.test(ua)?"Firefox":/Edg/i.test(ua)?"Edge":/Chrome/i.test(ua)?"Chrome":/Safari/i.test(ua)?"Safari":"Browser")+
    (/Android/i.test(ua)?" / Android":/iPhone|iPad/i.test(ua)?" / iOS":/Windows/i.test(ua)?" / Windows":/Mac/i.test(ua)?" / macOS":"");
  await accountTransaction(async c=>{await state(c,id);await c.query("UPDATE account_security SET last_sign_in=now() WHERE user_id=$1",[id]);});
  const view=await sessionView(req);
  await saveSession(req);
  return view;
}
export async function changePassword(req:Request,input:{currentPassword:string;newPassword:string}) {
  recent(req);
  const id=req.session.userId!;
  const [user]=await db.select().from(users).where(eq(users.id,id));
  if(!user||!await argon2.verify(user.passwordHash,input.currentPassword)) throw new ImportError("CREDENTIAL_CHANGE_FAILED",400);
  const hashed=await hashPassword(input.newPassword);
  const version=await accountTransaction(async c=>{
    await scope(c,req.session.activeFactoryId??"",id);
    // Compare-and-swap also rejects a concurrent password change or deactivation.
    const changed=await c.query(`UPDATE users SET password_hash=$2,session_version=session_version+1
      WHERE id=$1 AND password_hash=$3 AND session_version=$4 RETURNING session_version`,
      [id,hashed,user.passwordHash,req.session.authVersion??0]);
    if(!changed.rowCount) throw new ImportError("CREDENTIAL_CHANGE_FAILED",400);
    const memberships=(await c.query("SELECT factory_id FROM memberships WHERE user_id=$1",[id])).rows;
    for(const m of memberships){await scope(c,m.factory_id,id);await audit(c,m.factory_id,id,id,"password_changed");}
    return changed.rows[0].session_version as number;
  });
  return signIn(req,id,version,req.session.activeFactoryId,!!req.session.factorVerified);
}
export async function logoutEverywhere(req:Request) {
  await accountTransaction(async c=>{
    const id=req.session.userId!;
    await scope(c,"",id);
    await c.query("UPDATE users SET session_version=session_version+1 WHERE id=$1",[id]);
    const memberships=(await c.query("SELECT factory_id FROM memberships WHERE user_id=$1",[id])).rows;
    for(const m of memberships){await scope(c,m.factory_id,id);await audit(c,m.factory_id,id,id,"logout_everywhere");}
  });
  await new Promise<void>((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));
}
