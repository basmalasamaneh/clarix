import pg from "pg";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm,mkdir} from "node:fs/promises";
import {tmpdir,userInfo} from "node:os";
import {resolve,dirname} from "node:path";
import {spawn,execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {createServer} from "node:net";
import {configureDeployment,verifyDeploymentSecurity} from "../maintenance/deployment-security";
import {fingerprint} from "../maintenance/reset";

const root=resolve("../..");
const main=new pg.Pool({connectionString:process.env.DATABASE_URL,options:"-c row_security=off"});
const observer=await main.connect();
// A live development browser refreshes session expiry independently of tests.
// Briefly block those writes so the before/after proof covers sessions too.
await observer.query("BEGIN; SET LOCAL lock_timeout='10s'; LOCK TABLE public.sessions IN SHARE MODE");
const snapshot=async()=>({ethmar:await fingerprint(observer,"public","ethmar"),najm:await fingerprint(observer,"public","najm")});
const before=await snapshot(),checks:string[]=[];
const dir=await mkdtemp(resolve(tmpdir(),"clarix-gate-"));
const bin=dirname(execFileSync("which",["initdb"],{encoding:"utf8"}).trim());
const freePort=async()=>{const s=createServer();await new Promise<void>(r=>s.listen(0,"127.0.0.1",r));const p=(s.address() as any).port;await new Promise<void>(r=>s.close(()=>r()));return p;};
let pool:pg.Pool|undefined,fixtures:pg.Pool|undefined,server:ReturnType<typeof spawn>|undefined,started=false;
let setupClient:pg.PoolClient|undefined;
let output="";
const token=randomBytes(32).toString("base64url"),password=randomBytes(32).toString("base64url");
const managerPassword=randomBytes(32).toString("base64url"); // user-chosen input, never in environment
try{
  execFileSync(resolve(bin,"initdb"),["-D",dir,"-U","fixture_admin","--auth=trust","--no-locale"],{stdio:"ignore"});
  // Password auth for runtime connections; owner exists only inside this
  // disposable localhost cluster, never the development PostgreSQL server.
  const hba=resolve(dir,"pg_hba.conf");
  await writeFile(hba,`host all clarix_runtime 127.0.0.1/32 scram-sha-256\n${await readFile(hba,"utf8")}`);
  const port=await freePort();
  execFileSync(resolve(bin,"pg_ctl"),["-D",dir,"-l",resolve(dir,"server.log"),"-o",`-h 127.0.0.1 -p ${port} -k ${dir}`,"-w","start"],{stdio:"ignore"});started=true;
  const url=`postgresql://proof_owner@127.0.0.1:${port}/postgres`;
  const fixtureUrl=new URL(url);fixtureUrl.username="fixture_admin";
  pool=new pg.Pool({connectionString:fixtureUrl.toString()});
  const c=await pool.connect();setupClient=c;
  await c.query("CREATE ROLE proof_owner LOGIN CREATEROLE; ALTER DATABASE postgres OWNER TO proof_owner; ALTER SCHEMA public OWNER TO proof_owner; SET ROLE proof_owner");
  const env={...process.env,DATABASE_URL:url,NODE_ENV:"production",SEED_TEST_USERS:"false",CLARIX_RUNTIME_PASSWORD:password,
    CLARIX_INITIAL_INVITE_TOKEN:token,CLARIX_INITIAL_FACTORY_NAME:"Proof A",CLARIX_INITIAL_FACTORY_SLUG:"proof-a",CLARIX_INITIAL_MANAGER_EMAIL:"manager@proof.invalid"};
  // Simulate the tables produced by Publish, not a startup migration.
  await c.query(await readFile(resolve(root,"lib/db/drizzle/0000_production-foundation.sql"),"utf8"));
  await c.query("ALTER TABLE invitations ALTER COLUMN created_by DROP NOT NULL");
  // Provision through a table-owning CREATEROLE login, not a superuser or
  // BYPASSRLS login. Keep fixture administration separate in this test cluster.
  fixtures=new pg.Pool({connectionString:fixtureUrl.toString()});
  assert.equal((await c.query("SELECT 1 FROM pg_roles WHERE rolname='clarix_runtime'")).rowCount,0);
  await assert.rejects(configureDeployment(c,{...env,CLARIX_INITIAL_INVITE_TOKEN:"invalid"},resolve(root,"lib/db")));
  assert.equal((await c.query("SELECT 1 FROM pg_roles WHERE rolname='clarix_runtime'")).rowCount,0);
  assert.equal((await c.query("SELECT 1 FROM factories")).rowCount,0);
  checks.push("halfway failure rolls back role, factory and invitation; safe retry");
  await configureDeployment(c,env,resolve(root,"lib/db"));
  const original=(await fixtures.query("SELECT id,token_hash,expires_at FROM invitations")).rows;
  assert.equal((await c.query("SELECT 1 FROM users")).rowCount,0);
  await configureDeployment(c,env,resolve(root,"lib/db"));
  assert.deepEqual((await fixtures.query("SELECT id,token_hash,expires_at FROM invitations")).rows,original);
  assert.ok(Math.abs(original[0].expires_at.getTime()-Date.now()-7*86400000)<10000);
  await fixtures.query("UPDATE invitations SET expires_at=now()-interval '1 day'");
  await configureDeployment(c,env,resolve(root,"lib/db"));
  assert.ok((await fixtures.query("SELECT expires_at<now() AS expired FROM invitations")).rows[0].expired);
  // Restore only this synthetic fixture's original expiry for acceptance tests.
  await fixtures.query("UPDATE invitations SET expires_at=$1",[original[0].expires_at]);
  await verifyDeploymentSecurity(c);
  checks.push("fresh cluster, no runtime role: provision twice; identical invitation/expiry, zero synthetic users, all forced RLS");
  const runtimeUrl=new URL(url);runtimeUrl.username="clarix_runtime";runtimeUrl.password=password;
  const runtime=new pg.Pool({connectionString:runtimeUrl.toString()});
  try{
    assert.equal((await runtime.query("SELECT session_user")).rows[0].session_user,"clarix_runtime");
    for(const sql of ["UPDATE raw_rows SET cells='{}'","DELETE FROM raw_rows","TRUNCATE raw_rows"])
      await assert.rejects(runtime.query(sql));
    await assert.rejects(runtime.query("SET ROLE proof_owner"));
  }finally{await runtime.end();}
  checks.push("direct SCRAM runtime login, no owner escalation; raw UPDATE/DELETE/TRUNCATE denied");
  const apiPort=await freePort();
  server=spawn(process.execPath,[resolve(root,"artifacts/api-server/dist/start-production.mjs")],{cwd:root,env:{...env,PORT:String(apiPort)},stdio:["ignore","pipe","pipe"]});
  server.stdout!.on("data",d=>output+=d);server.stderr!.on("data",d=>output+=d);
  const origin=`http://127.0.0.1:${apiPort}`;
  let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(origin+"/api/healthz")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,"production entrypoint starts HTTP only after security setup");
  const childEnv=await readFile(`/proc/${server.pid}/environ`,"utf8");
  assert.ok(!childEnv.includes(token)&&!childEnv.includes("proof_owner"));
  assert.ok(!childEnv.includes("SEED_TEST_PASSWORD"));
  checks.push("real production launcher exec replaces owner process; API environment has no owner, bootstrap token or seed password");
  let cookie="",csrf="";
  const call=async(path:string,body?:unknown)=>{
    const r=await fetch(origin+path,{method:body?"POST":"GET",headers:{"X-Forwarded-Proto":"https","Content-Type":"application/json","Cookie":cookie,"X-CSRF-Token":csrf},body:body?JSON.stringify(body):undefined});
    if(r.headers.get("set-cookie"))cookie=r.headers.get("set-cookie")!.split(";")[0];
    const data:any=await r.json();if(data.csrfToken)csrf=data.csrfToken;return {status:r.status,data};
  };
  await call("/api/auth/session");
  const accepted=await call("/api/auth/invitation",{token,name:"Proof manager",password:managerPassword});
  assert.equal(accepted.status,200);
  const user=accepted.data.user.id;
  assert.equal((await call("/api/auth/invitation",{token,name:"Second",password:managerPassword})).status,404);
  const withoutToken={...env};delete (withoutToken as any).CLARIX_INITIAL_INVITE_TOKEN;
  await configureDeployment(c,withoutToken,resolve(root,"lib/db"));
  assert.equal((await c.query("SELECT count(*)::int AS n FROM users")).rows[0].n,1);
  assert.equal((await call(`/api/auth/invitation?token=${token}`)).status,404);
  checks.push("existing invitation accepted once, rerun without token does nothing, replay denied");
  await fixtures.query("INSERT INTO factories(id,name) VALUES('proof-b','Proof B')");
  const r=new pg.Pool({connectionString:runtimeUrl.toString()});
  try{
    await r.query("SELECT set_config('app.user_id',$1,false),set_config('app.factory_id','proof-a',false)",[user]);
    assert.deepEqual((await r.query("SELECT id FROM factories")).rows.map(v=>v.id),["proof-a"]);
    assert.equal((await call("/api/factories/proof-b/pages/overview")).status,403);
  }finally{await r.end();}
  checks.push("factory-A identity cannot read factory B through runtime RLS or HTTP");
  for(const email of ["platform.admin@clarix.test","ethmar.manager@clarix.test","ethmar.analyst@clarix.test","ethmar.viewer@clarix.test","najm.manager@clarix.test"]){
    await c.query("UPDATE users SET email=$1,test_account=true WHERE id=$2",[email,user]);
    assert.equal((await call("/api/auth/login",{email,password:managerPassword})).status,401);
  }
  checks.push("all five seeded email identities rejected with valid credentials in production");
  assert.ok(!output.includes(token)&&!output.includes(password)&&!output.includes(managerPassword)&&!output.includes("/invite/"));
  checks.push("captured setup/API logs contain no token, link or password");
}finally{
  if(server&&server.exitCode===null){server.kill("SIGTERM");await new Promise(r=>server!.once("exit",r));}
  // Destroy held setup clients even when a failed assertion interrupted them.
  setupClient?.release(true);
  await fixtures?.end();await pool?.end();
  if(started)execFileSync(resolve(bin,"pg_ctl"),["-D",dir,"-m","immediate","-w","stop"],{stdio:"ignore"});
  await rm(dir,{recursive:true,force:true});
  const after=await snapshot(),unchanged=JSON.stringify(before)===JSON.stringify(after);
  await mkdir(resolve(root,"generated-artifacts/phase10"),{recursive:true});
  await writeFile(resolve(root,"generated-artifacts/phase10/deployment-gate.json"),JSON.stringify({checks,before,after,unchanged},null,2));
  await observer.query("COMMIT");observer.release();await main.end();
  assert.ok(unchanged,"development fingerprints unchanged");
}
console.log(`Deployment gate: ${checks.length} checks passed; isolated cluster removed; development unchanged.`);
