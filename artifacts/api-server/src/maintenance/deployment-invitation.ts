import {createHash,randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {z} from "zod";

const settings=z.object({
  CLARIX_INITIAL_FACTORY_NAME:z.string().trim().min(1).max(160),
  CLARIX_INITIAL_FACTORY_SLUG:z.string().regex(/^[a-z][a-z0-9-]{0,99}$/),
  CLARIX_INITIAL_MANAGER_EMAIL:z.string().email().max(254).transform(s=>s.toLowerCase()),
  CLARIX_INITIAL_INVITE_TOKEN:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
// Called inside the security installer's transaction/global lock. Existing
// null-created_by invitation is a durable latch, not regenerated on restarts.
export async function deploymentInvitation(c:PoolClient,env:NodeJS.ProcessEnv){
  if((await c.query("SELECT 1 FROM users LIMIT 1")).rowCount)return;
  if((await c.query("SELECT 1 FROM platform_invitations LIMIT 1")).rowCount)return;
  if((await c.query("SELECT 1 FROM invitations WHERE created_by IS NULL LIMIT 1")).rowCount)return;
  // A partially provisioned/foreign database must not silently become a new app.
  if((await c.query("SELECT 1 FROM factories LIMIT 1")).rowCount)throw new Error("Setup requires an empty installation");
  const role=env.CLARIX_INITIAL_ROLE??"factory_manager";
  if(role==="platform_admin"){
    const admin=z.object({CLARIX_INITIAL_ADMIN_EMAIL:z.string().email().max(254),CLARIX_INITIAL_INVITE_TOKEN:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).safeParse(env);
    if(!admin.success)throw new Error("Initial invitation configuration is missing or invalid");
    await c.query("INSERT INTO platform_invitations(id,email,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
      [randomUUID(),admin.data.CLARIX_INITIAL_ADMIN_EMAIL.toLowerCase(),createHash("sha256").update(admin.data.CLARIX_INITIAL_INVITE_TOKEN).digest("hex")]);
    await c.query("INSERT INTO platform_audit(id,action) VALUES($1,'invitation_issued')",[randomUUID()]);
    return;
  }
  if(role!=="factory_manager")throw new Error("Initial invitation role is invalid");
  const parsed=settings.safeParse(env);
  if(!parsed.success)throw new Error("Initial invitation configuration is missing or invalid");
  const input=parsed.data;
  const tokenHash=createHash("sha256").update(input.CLARIX_INITIAL_INVITE_TOKEN).digest("hex");
  await c.query("INSERT INTO factories(id,name) VALUES($1,$2)",[input.CLARIX_INITIAL_FACTORY_SLUG,input.CLARIX_INITIAL_FACTORY_NAME]);
  await c.query(`INSERT INTO invitations(id,factory_id,email,role,token_hash,created_by,expires_at)
    VALUES($1,$2,$3,'factory_manager',$4,NULL,now()+interval '7 days')`,
    [randomUUID(),input.CLARIX_INITIAL_FACTORY_SLUG,input.CLARIX_INITIAL_MANAGER_EMAIL,tokenHash]);
  await c.query(`INSERT INTO account_audit(id,factory_id,actor_id,action,role)
    VALUES($1,$2,NULL,'invite_created','factory_manager')`,[randomUUID(),input.CLARIX_INITIAL_FACTORY_SLUG]);
}
