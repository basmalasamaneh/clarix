import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import {randomUUID,randomBytes} from "node:crypto";
import argon2 from "argon2";
import app from "../app";
import {pool} from "@workspace/db/admin";
import {sessionStore} from "../lib/session";
import {closeTenantPools} from "../lib/tenancy";
import {digest,totp,encrypt,decrypt,passwordAllowed} from "../accounts/security-crypto";
import {throttle} from "../accounts/security";
after(async()=>{sessionStore.close();await closeTenantPools();await pool.end();});
const password="Security test "+randomUUID();
const factory="sec-"+randomUUID(),other="sec-"+randomUUID();
const ids=Object.fromEntries(["manager","analyst","viewer","foreign","admin"].map(x=>[x,randomUUID()]));
type Agent=ReturnType<typeof request.agent>;
const csrf=async(a:Agent)=>(await a.get("/api/auth/session")).body.csrfToken;
async function post(a:Agent,path:string,body:object){const c=await csrf(a);return a.post("/api"+path).set("X-CSRF-Token",c).send(body);}
async function login(role:string,pass=password){
 const a=request.agent(app),r=await post(a,"/auth/login",{email:`${ids[role]}@security.test`,password:pass});
 assert.equal(r.status,200);return {a,r};
}
const action=(a:Agent,body:object)=>post(a,"/auth/security",body);
async function setup(){
 // Fixture-only observer policy belongs exclusively to the disposable schema
 // owner, not to any application role. FORCE RLS stays enabled throughout.
 for(const table of ["factories","memberships","password_resets","account_security","security_audit","security_limits","revoked_sessions"]){
  await pool.query(`CREATE POLICY security_fixture_observer ON ${table} TO CURRENT_USER USING(true) WITH CHECK(true)`);
 }
 await pool.query("INSERT INTO factories(id,name) VALUES($1,'Security isolated'),($2,'Other isolated')",[factory,other]);
 for(const role of Object.keys(ids)){
  await pool.query("INSERT INTO users(id,email,name,password_hash,platform_admin) VALUES($1,$2,'Isolated',$3,$4)",[ids[role],`${ids[role]}@security.test`,await argon2.hash(password),role==="admin"]);
  if(role!=="admin")await pool.query("INSERT INTO memberships(user_id,factory_id,role) VALUES($1,$2,$3)",[ids[role],role==="foreign"?other:factory,role==="manager"?"factory_manager":role==="viewer"?"viewer":"analyst"]);
 }
}
test("Phase18 isolated security lifecycle and tenancy",async t=>{
 await setup();
 const {a:manager}=await login("manager"),{a:analyst}=await login("analyst"),{a:viewer}=await login("viewer"),{a:admin}=await login("admin");
 let reset:string,resetId:string;
 await t.test("manager reset is scoped, single display, hashed, replaceable and revocable",async()=>{
  for(const a of [analyst,viewer,admin])assert.equal((await action(a,{action:"issue-reset",memberId:ids.analyst})).status,403);
  assert.equal((await action(manager,{action:"issue-reset",memberId:ids.manager})).status,403);
  const foreign=await action(manager,{action:"issue-reset",memberId:ids.foreign}),missing=await action(manager,{action:"issue-reset",memberId:randomUUID()});
  assert.equal(foreign.status,404);assert.deepEqual(foreign.body,missing.body);
  const issued=await action(manager,{action:"issue-reset",memberId:ids.analyst});assert.equal(issued.status,200);
  reset=issued.body.token;resetId=issued.body.resetId;
  const row=(await pool.query("SELECT * FROM password_resets WHERE id=$1",[resetId])).rows[0];
  assert.ok(row.token_hash===digest(reset)&&!JSON.stringify(row).includes(reset));
  assert.ok(Math.abs(new Date(row.expires_at).getTime()-new Date(row.created_at).getTime()-86400000)<1000);
  const next=await action(manager,{action:"issue-reset",memberId:ids.analyst});
  assert.equal((await post(request.agent(app),"/auth/recovery",{token:reset,password})).status,400);
  assert.equal((await action(manager,{action:"revoke-reset",resetId:next.body.resetId})).status,200);
  assert.equal((await post(request.agent(app),"/auth/recovery",{token:next.body.token,password})).status,400);
  const expired=await action(manager,{action:"issue-reset",memberId:ids.analyst});
  await pool.query("UPDATE password_resets SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.body.resetId]);
  assert.equal((await post(request.agent(app),"/auth/recovery",{token:expired.body.token,password})).status,400);
 });
 let viewerCodes:string[]=[],viewerKey:string;
 await t.test("TOTP encrypted enrollment, acknowledgement gate, replay denial and recovery codes",async()=>{
  const start=await action(viewer,{action:"enroll",password});assert.equal(start.status,200);
  viewerKey=start.body.key;
  const raw=(await pool.query("SELECT * FROM account_security WHERE user_id=$1",[ids.viewer])).rows[0];
  assert.ok(!JSON.stringify(raw).includes(viewerKey));assert.ok(raw.pending_secret.startsWith("v1."));
  assert.equal((await action(viewer,{action:"acknowledge"})).status,400);
  assert.equal((await action(viewer,{action:"confirm",code:"wrong"})).status,401);
  const confirmed=await action(viewer,{action:"confirm",code:totp(viewerKey).generate()});assert.equal(confirmed.status,200);
  viewerCodes=confirmed.body.recoveryCodes;assert.equal(viewerCodes.length,10);
  assert.equal((await viewer.get("/api/auth/security")).body.enrolled,false);
  assert.equal((await action(viewer,{action:"acknowledge"})).status,200);
  assert.equal((await viewer.get("/api/auth/security")).body.enrolled,true);
  const stored=(await pool.query("SELECT * FROM account_security WHERE user_id=$1",[ids.viewer])).rows[0];
  for(const code of viewerCodes)assert.ok(!JSON.stringify(stored).includes(code));
  const {a,r}=await login("viewer");assert.equal(r.body.pendingSecondFactor,true);assert.equal(r.body.user,null);
  assert.equal((await a.get("/api/members")).status,401);
  assert.equal((await post(a,"/auth/second-factor",{code:totp(viewerKey).generate()})).status,401);
  assert.equal((await post(a,"/auth/second-factor",{code:viewerCodes[0]})).status,200);
  const {a:again}=await login("viewer");
  assert.equal((await post(again,"/auth/second-factor",{code:viewerCodes[0]})).status,401);
  assert.equal((await post(again,"/auth/second-factor",{code:viewerCodes[1]})).status,200);
 });
 await t.test("password resets end all sessions, preserve MFA and cannot be reused",async()=>{
  const r=await action(manager,{action:"issue-reset",memberId:ids.viewer});assert.equal(r.status,200);
  const nextPassword=password+" replaced";
  assert.equal((await post(request.agent(app),"/auth/recovery",{token:r.body.token,password:nextPassword})).status,204);
  assert.equal((await viewer.get("/api/auth/session")).body.user,null);
  assert.equal((await post(request.agent(app),"/auth/recovery",{token:r.body.token,password:nextPassword})).status,400);
  const {a, r:pending}=await login("viewer",nextPassword);assert.equal(pending.body.pendingSecondFactor,true);
  assert.equal((await post(a,"/auth/second-factor",{code:viewerCodes[2]})).status,200);
  assert.equal((await action(a,{action:"disable",password:nextPassword,code:"wrong"})).status,401);
  assert.equal((await action(a,{action:"enroll",password:nextPassword,code:"wrong"})).status,401);
  assert.equal((await action(a,{action:"disable",password:nextPassword,code:viewerCodes[3]})).status,200);
 });
 await t.test("private manager recovery works once, admin cannot issue it or read tenant data",async()=>{
  assert.equal((await action(admin,{action:"recovery-key"})).status,403);
  assert.equal((await action(analyst,{action:"recovery-key"})).status,403);
  const result=await action(manager,{action:"recovery-key"});assert.equal(result.status,200);
  assert.ok((await pool.query("SELECT recovery_key_hash FROM account_security WHERE user_id=$1",[ids.manager])).rows[0].recovery_key_hash===digest(result.body.key));
  const input={email:`${ids.manager}@security.test`,recoveryKey:result.body.key,password:password+" recovered"};
  assert.equal((await post(request.agent(app),"/auth/recovery",input)).status,204);
  assert.equal((await manager.get("/api/auth/session")).body.user,null);
  assert.equal((await post(request.agent(app),"/auth/recovery",input)).status,400);
  for(const path of ["/runs","/quality","/imports"])assert.ok([403,404].includes((await admin.get("/api"+path)).status));
 });
 await t.test("sessions list/revoke persist, own-account only, recent confirmation required",async()=>{
  const {a:first}=await login("analyst"),{a:second}=await login("analyst");
  const list=await first.get("/api/auth/security/sessions");assert.equal(list.status,200);
  assert.ok(list.body.items.some((s:any)=>s.current));
  const target=list.body.items.find((s:any)=>!s.current);assert.ok(target);
  assert.equal((await action(first,{action:"revoke-session",sessionId:target.id})).status,200);
  // Other accounts' session IDs are not accepted.
  const otherSessions=(await admin.get("/api/auth/security/sessions")).body.items;
  assert.equal((await action(first,{action:"revoke-session",sessionId:otherSessions[0].id})).status,404);
  await pool.query(`UPDATE sessions SET sess=jsonb_set(jsonb_set(sess::jsonb,'{authenticatedAt}',to_jsonb($2::bigint)),'{confirmedAt}','0')::json WHERE sess->>'userId'=$1`,[ids.analyst,Date.now()-600000]);
  assert.equal((await action(first,{action:"revoke-others"})).status,403);
  assert.equal((await action(first,{action:"reauth",password})).status,200);
  assert.equal((await action(first,{action:"revoke-others"})).status,200);
  assert.equal((await second.get("/api/auth/session")).body.user,null);
 });
 await t.test("factory requirement grace then server enforcement; manager recommendation",async()=>{
  const {a:m}=await login("manager",password+" recovered");
  assert.equal((await m.get("/api/auth/security")).body.singleManager,true);
  assert.equal((await action(m,{action:"require-mfa",required:true})).status,200);
  const current=await m.get("/api/auth/security");assert.equal(current.body.setupRequired,true);assert.ok(Date.parse(current.body.graceUntil)>Date.now());
  await pool.query(`UPDATE factories SET settings=jsonb_set(settings,'{security,graceUntil}','"2000-01-01T00:00:00.000Z"') WHERE id=$1`,[factory]);
  assert.equal((await m.get("/api/members")).status,423);
  assert.equal((await m.get("/api/auth/security")).status,200);
  assert.equal((await action(m,{action:"require-mfa",required:false})).status,200);
 });
 await t.test("Platform Admin default/configuration gate begins only after saved-code acknowledgement",async()=>{
  const previous=process.env.CLARIX_REQUIRE_ADMIN_MFA;
  try{
   process.env.CLARIX_REQUIRE_ADMIN_MFA="true";
   assert.equal((await admin.get("/api/auth/security")).body.setupRequired,true);
   assert.equal((await admin.get("/api/auth/session")).body.user.platformAdmin,true);
   const enrollment=await action(admin,{action:"enroll",password});
   const confirmed=await action(admin,{action:"confirm",code:totp(enrollment.body.key).generate()});
   const before=await login("admin");assert.ok(before.r.body.user);
   await action(admin,{action:"acknowledge"});
   const pending=await login("admin");assert.equal(pending.r.body.pendingSecondFactor,true);
   assert.equal((await post(pending.a,"/auth/second-factor",{code:confirmed.body.recoveryCodes[0]})).status,200);
   assert.equal((await action(pending.a,{action:"disable",password,code:confirmed.body.recoveryCodes[1]})).status,403);
   process.env.CLARIX_REQUIRE_ADMIN_MFA="false";
   const fallback=await login("admin");assert.ok(fallback.r.body.user);
   assert.equal((await fallback.a.get("/api/auth/security")).body.enrolled,true);
  }finally{if(previous===undefined)delete process.env.CLARIX_REQUIRE_ADMIN_MFA;else process.env.CLARIX_REQUIRE_ADMIN_MFA=previous;}
 });
 await t.test("persistent code/account/IP limits, password rejection, encryption rotation and secret-free audits",async()=>{
  const value=randomUUID();
  for(let i=0;i<3;i++)await throttle("test-limit",value,3);
  await assert.rejects(()=>throttle("test-limit",value,3),(e:any)=>e.code==="TOO_MANY_ATTEMPTS");
  for(const bad of ["password1234","123456789012","aaaaaaaaaaaa"])assert.throws(()=>passwordAllowed(bad));
  passwordAllowed("عبارة مرور طويلة وآمنة");
  const old=process.env.CLARIX_TOTP_ENCRYPTION_KEY!,raw=randomUUID(),cipher=encrypt(raw,ids.analyst);
  assert.throws(()=>decrypt(cipher,ids.foreign));
  try{
   process.env.CLARIX_TOTP_PREVIOUS_ENCRYPTION_KEY=old;
   process.env.CLARIX_TOTP_ENCRYPTION_KEY=randomBytes(32).toString("hex");
   assert.ok(decrypt(cipher,ids.analyst)===raw);
  }finally{process.env.CLARIX_TOTP_ENCRYPTION_KEY=old;delete process.env.CLARIX_TOTP_PREVIOUS_ENCRYPTION_KEY;}
  const auditRows=JSON.stringify((await pool.query("SELECT * FROM security_audit")).rows);
  assert.ok(!auditRows.includes(viewerKey));for(const code of viewerCodes)assert.ok(!auditRows.includes(code));
  const unknown=await post(request.agent(app),"/auth/login",{email:randomUUID()+"@security.test",password});
  const wrong=await post(request.agent(app),"/auth/login",{email:`${ids.analyst}@security.test`,password:"wrong"});
  assert.equal(unknown.status,wrong.status);assert.deepEqual(unknown.body,wrong.body);
 });
});
