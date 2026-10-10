import type {PoolClient} from "pg";
import {ImportError} from "../imports/model";
import {audit} from "./context";

const columns=`u.id,u.name,u.email,m.role,m.active,m.last_login AS "lastLogin",
 m.login_success_count AS "loginSuccessCount",m.login_failure_count AS "loginFailureCount"`;
function view(row:any) {return {...row,lastLogin:row.lastLogin?.toISOString()??null};}
export async function member(c:PoolClient,factory:string,id:string) {
  const result=await c.query(`SELECT ${columns} FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.factory_id=$1 AND m.user_id=$2`,[factory,id]);
  if(!result.rowCount) throw new ImportError("NOT_FOUND",404);
  return view(result.rows[0]);
}
export async function listMembers(c:PoolClient,factory:string,page:number) {
  const rows=await c.query(`SELECT ${columns} FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.factory_id=$1 ORDER BY lower(u.name),u.id LIMIT 20 OFFSET $2`,[factory,(page-1)*20]);
  const n=await c.query("SELECT count(*)::int AS n FROM memberships WHERE factory_id=$1",[factory]);
  return {items:rows.rows.map(view),total:n.rows[0].n,page};
}
export async function updateMember(c:PoolClient,factory:string,actor:string,id:string,input:{role?:string;active?:boolean}) {
  const old=await member(c,factory,id);
  const role=input.role??old.role,active=input.active??old.active;
  if(old.active&&old.role==="factory_manager"&&(!active||role!=="factory_manager")) {
    const n=await c.query("SELECT count(*)::int AS n FROM memberships WHERE factory_id=$1 AND active AND role='factory_manager'",[factory]);
    if(n.rows[0].n<=1) throw new ImportError("LAST_MANAGER",409);
  }
  const recovery=(await c.query("SELECT recovery_required FROM memberships WHERE factory_id=$1 AND user_id=$2",[factory,id])).rows[0];
  if(active&&recovery.recovery_required) throw new ImportError("RECOVERY_REQUIRED",409);
  await c.query("UPDATE memberships SET role=$3,active=$4 WHERE factory_id=$1 AND user_id=$2",[factory,id,role,active]);
  if(role!==old.role) await audit(c,factory,actor,id,"role_changed",role);
  if(active!==old.active) {
    // Version checks on every authenticated request prevent resurrected sessions.
    await c.query("UPDATE users SET session_version=session_version+1 WHERE id=$1",[id]);
    await audit(c,factory,actor,id,active?"member_reactivated":"member_deactivated");
  }
  return member(c,factory,id);
}
export async function memberAudit(c:PoolClient,factory:string) {
  const r=await c.query(`SELECT a.id,a.action,actor.name AS "actorName",subject.name AS "subjectName",
    a.created_at AS "createdAt",a.role,a.event_count AS count
    FROM account_audit a LEFT JOIN users actor ON actor.id=a.actor_id LEFT JOIN users subject ON subject.id=a.subject_id
    WHERE a.factory_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 50`,[factory]);
  return r.rows.map(r=>({...r,createdAt:r.createdAt.toISOString()}));
}
