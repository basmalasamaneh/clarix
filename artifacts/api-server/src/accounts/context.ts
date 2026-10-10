import { pool } from "@workspace/db";
import type { PoolClient } from "pg";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { ImportError } from "../imports/model";

// A restricted, accounts-only role; never shares production-data privileges.
// SET LOCAL and its tenant/token context last only for this transaction.
export async function accountTransaction<T>(fn:(c:PoolClient)=>Promise<T>) {
  const c=await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE clarix_accounts");
    const value=await fn(c);
    await c.query("COMMIT");
    return value;
  } catch(e) { await c.query("ROLLBACK");throw e; }
  finally {c.release();}
}
export async function scope(c:PoolClient,factory:string,user="") {
  await c.query("SELECT set_config('app.factory_id',$1,true),set_config('app.user_id',$2,true)",[factory,user]);
}
export async function managerTransaction<T>(req:Request,fn:(c:PoolClient,factory:string,user:string)=>Promise<T>) {
  if(!req.session.userId) throw new ImportError("UNAUTHENTICATED",401);
  const factory=req.session.activeFactoryId,user=req.session.userId;
  if(!factory) throw new ImportError("FORBIDDEN",403);
  return accountTransaction(async c=>{
    await scope(c,factory,user);
    // Serialize last-manager checks with invitation/member changes.
    const f=await c.query("SELECT id FROM factories WHERE id=$1 AND status='active' FOR NO KEY UPDATE",[factory]);
    const m=await c.query(`SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.factory_id=$1 AND m.user_id=$2 AND m.active AND m.role='factory_manager' AND NOT u.platform_admin`,[factory,user]);
    if(!f.rowCount||!m.rowCount) throw new ImportError("FORBIDDEN",403);
    return fn(c,factory,user);
  });
}
export async function audit(c:PoolClient,factory:string,actor:string|null,subject:string|null,action:string,role:string|null=null,count=1) {
  // Closed columns only: no free-form request metadata, email, token or secret.
  await c.query(`INSERT INTO account_audit(id,factory_id,actor_id,subject_id,action,role,event_count)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),factory,actor,subject,action,role,count]);
}
