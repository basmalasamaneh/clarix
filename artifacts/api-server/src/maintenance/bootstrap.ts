import {randomBytes,randomUUID,createHash} from "node:crypto";
import argon2 from "argon2";
import type {PoolClient} from "pg";
import {z} from "zod";
const inputSchema=z.object({
  name:z.string().trim().min(1).max(160),
  slug:z.string().regex(/^[a-z][a-z0-9-]{0,99}$/),
  email:z.string().email().max(254).transform(v=>v.trim().toLowerCase()),
  allowExistingManager:z.boolean().default(false),
});
/** Privileged setup only. No HTTP route or runtime-role escalation exists. */
export async function bootstrapFactory(c:PoolClient,raw:unknown){
  const input=inputSchema.parse(raw);
  const role=(await c.query("SELECT rolsuper OR rolbypassrls AS allowed FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(!role?.allowed)throw new Error("Bootstrap requires a privileged setup connection");
  await c.query("BEGIN");
  try{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,9))",[input.slug]);
    await c.query("INSERT INTO factories(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",[input.slug,input.name]);
    const factory=(await c.query("SELECT name,status FROM factories WHERE id=$1 FOR UPDATE",[input.slug])).rows[0];
    if(factory.name!==input.name||factory.status!=="active")throw new Error("Factory exists with different details or is suspended");
    const managers=await c.query("SELECT 1 FROM memberships WHERE factory_id=$1 AND role='factory_manager' AND active",[input.slug]);
    if(managers.rowCount&&!input.allowExistingManager)throw new Error("Factory already has a manager; explicit --allow-existing-manager required");
    if((await c.query("SELECT 1 FROM users WHERE email=$1",[input.email])).rowCount)throw new Error("Use a new email for initial setup; existing accounts require normal member management");
    if((await c.query("SELECT 1 FROM invitations WHERE factory_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()",[input.slug,input.email])).rowCount)
      throw new Error("A pending invitation already exists");
    await c.query("UPDATE invitations SET revoked_at=now() WHERE factory_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL",[input.slug,input.email]);
    // Non-login audit actor: unknown random password, no membership, no admin flag.
    const actor=randomUUID(),id=randomUUID(),token=randomBytes(32).toString("base64url");
    const hash=await argon2.hash(randomBytes(48),{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
    await c.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Production setup',$3)",[actor,`bootstrap-${actor}@system.invalid`,hash]);
    const row=(await c.query(`INSERT INTO invitations(id,factory_id,email,role,token_hash,created_by,expires_at)
      VALUES($1,$2,$3,'factory_manager',$4,$5,now()+interval '7 days') RETURNING expires_at`,
      [id,input.slug,input.email,createHash("sha256").update(token).digest("hex"),actor])).rows[0];
    await c.query("INSERT INTO account_audit(id,factory_id,actor_id,action,role,event_count) VALUES($1,$2,$3,'invite_created','factory_manager',1)",[randomUUID(),input.slug,actor]);
    await c.query("COMMIT");
    return {path:`/invite/${token}`,expiresAt:row.expires_at};
  }catch(e){await c.query("ROLLBACK");throw e;}
}
