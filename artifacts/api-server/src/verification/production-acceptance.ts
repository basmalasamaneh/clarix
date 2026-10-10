// Explicit isolated empty-database proof. Never points app code at development tables.
import pg from "pg";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {prepareProductionSchema} from "../maintenance/production-schema";
import {bootstrapFactory} from "../maintenance/bootstrap";
import {fingerprint,requireUnfilteredObserver} from "../maintenance/reset";
const admin=new pg.Pool({connectionString:process.env.DATABASE_URL,options:"-c row_security=off"});
const c=await admin.connect(),name=`clarix_proof_${randomBytes(8).toString("hex")}`;
await requireUnfilteredObserver(c);
const before=await fingerprint(c);
const evidence:any={checks:[],before};
let target:pg.Pool|undefined,closeApp:undefined|(()=>Promise<void>),created=false;
try{
  await c.query(`CREATE DATABASE "${name}"`);created=true;
  const url=new URL(process.env.DATABASE_URL!);url.pathname=`/${name}`;
  target=new pg.Pool({connectionString:url.toString(),options:"-c row_security=off"});
  const setup=await target.connect();
  try{
    await prepareProductionSchema(setup);await prepareProductionSchema(setup);
    evidence.checks.push("empty database migration and idempotent reapply");
    process.env.DATABASE_URL=url.toString();process.env.NODE_ENV="production";process.env.SEED_TEST_USERS="false";
    delete process.env.CLARIX_TEST_SCHEMA;delete process.env.PGOPTIONS;delete process.env.NODE_TEST_CONTEXT;
    process.env.LOG_LEVEL="silent";
    const invite=await bootstrapFactory(setup,{name:"Isolated production proof",slug:"bootstrap-proof",email:"manager@proof.invalid"});
    const {default:app}=await import("../app");
    const {default:request}=await import("supertest");
    const {pool}=await import("@workspace/db");
    const {sessionStore}=await import("../lib/session");
    const {closeTenantPools}=await import("../lib/tenancy");
    closeApp=async()=>{sessionStore.close();await closeTenantPools();await pool.end();};
    const identity=(await pool.query("SELECT session_user,current_user,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.equal(identity.session_user,"clarix_runtime");assert.equal(identity.current_user,"clarix_runtime");
    for(const key of ["rolsuper","rolbypassrls","rolcreatedb","rolcreaterole"])assert.equal(identity[key],false);
    evidence.checks.push("direct runtime login and startup privilege conditions");
    const tenant=(await setup.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relkind='r'
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='factory_id')`)).rows;
    assert.ok(tenant.length>=13);assert.ok(tenant.every(t=>t.relrowsecurity&&t.relforcerowsecurity));
    evidence.checks.push("all tenant tables ENABLE/FORCE RLS");
    const call=(method:"get"|"post"|"patch",path:string)=>request(app)[method](path).set("X-Forwarded-Proto","https");
    let cookie="",csrf="";
    const capture=(r:any)=>{if(r.headers["set-cookie"])cookie=r.headers["set-cookie"].map((x:string)=>x.split(";")[0]).join("; ");if(r.body.csrfToken)csrf=r.body.csrfToken;};
    const anon=await call("get","/api/auth/session").expect(200);capture(anon);
    assert.match(anon.headers["set-cookie"][0],/HttpOnly/);assert.match(anon.headers["set-cookie"][0],/Secure/);assert.match(anon.headers["set-cookie"][0],/SameSite=Lax/);
    const token=invite.path.split("/").at(-1)!;
    const password=randomBytes(24).toString("base64url"); // never output or persisted plaintext
    const accepted=await call("post","/api/auth/invitation").set("Cookie",cookie).set("X-CSRF-Token",csrf)
      .send({token,name:"Proof manager",password}).expect(200);capture(accepted);
    assert.equal(accepted.body.memberships[0].role,"factory_manager");
    await call("get",`/api/auth/invitation?token=${token}`).expect(404);
    await assert.rejects(bootstrapFactory(setup,{name:"Isolated production proof",slug:"bootstrap-proof",email:"second@proof.invalid"}));
    const runtimeClient=await pool.connect();
    try{await assert.rejects(bootstrapFactory(runtimeClient,{name:"Denied",slug:"runtime-denied",email:"denied@proof.invalid"}),/privileged/);}
    finally{runtimeClient.release();}
    evidence.checks.push("bootstrap invitation accepted once; existing-manager guard");
    await call("patch","/api/preferences").set("Cookie",cookie).send({language:"ar"}).expect(403);
    const prefs=await call("patch","/api/preferences").set("Cookie",cookie).set("X-CSRF-Token",csrf).send({language:"ar",theme:"dark",tourCompleted:true}).expect(200);capture(prefs);
    assert.equal(prefs.body.user.language,"ar");
    const manager=accepted.body.user.id;
    await call("post","/api/auth/logout").set("Cookie",cookie).set("X-CSRF-Token",csrf).expect(204);
    const anon2=await call("get","/api/auth/session").expect(200);capture(anon2);
    const logged=await call("post","/api/auth/login").set("Cookie",cookie).set("X-CSRF-Token",csrf).send({email:"manager@proof.invalid",password}).expect(200);capture(logged);
    assert.equal(logged.body.user.language,"ar");assert.equal(logged.body.user.theme,"dark");assert.equal(logged.body.user.tourCompleted,true);
    evidence.checks.push("production manager password login; preferences across logout/login; CSRF");
    await setup.query("UPDATE users SET test_account=true WHERE id=$1",[manager]);
    await call("post","/api/auth/login").set("Cookie",cookie).set("X-CSRF-Token",csrf).send({email:"manager@proof.invalid",password}).expect(401);
    assert.equal((await call("get","/api/auth/session").set("Cookie",cookie).expect(200)).body.user,null);
    evidence.checks.push("test identities rejected and sessions invalidated with production + seed false");
    const health=await call("get","/api/healthz").expect(200);
    assert.deepEqual(health.body,{status:"ok"});
    for(const h of ["content-security-policy","x-frame-options","x-content-type-options","referrer-policy"])assert.ok(health.headers[h]);
    evidence.checks.push("safe health response and security headers");
  }finally{setup.release();}
}finally{
  await closeApp?.();await target?.end();
  if(created)await c.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  evidence.after=await fingerprint(c);evidence.unchanged=JSON.stringify(before)===JSON.stringify(evidence.after);
  await mkdir("../../generated-artifacts/phase10",{recursive:true});
  await writeFile("../../generated-artifacts/phase10/production-proof.json",JSON.stringify(evidence,null,2));
  c.release();await admin.end();
  assert.ok(evidence.unchanged,"Development fingerprints unchanged");
  console.log(`Production proof: ${evidence.checks.length} checks; disposable database removed; development unchanged.`);
}
