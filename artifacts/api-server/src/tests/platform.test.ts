import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import app from "../app";
import {pool} from "@workspace/db/admin";
import {closeTenantPools} from "../lib/tenancy";
import {sessionStore} from "../lib/session";
import {accountTransaction,scope} from "../accounts/context";
import {withTenant} from "../lib/tenancy";
after(async()=>{sessionStore.close();await closeTenantPools();await pool.end();});
const root=fileURLToPath(new URL("../../../../",import.meta.url));
async function anonymous(){const a=request.agent(app),r=await a.get("/api/auth/session");return {a,csrf:r.body.csrfToken};}
async function login(email:string){const u=await anonymous(),r=await u.a.post("/api/auth/login").set("X-CSRF-Token",u.csrf).send({email,password:process.env.SEED_TEST_PASSWORD}).expect(200);return {...u,csrf:r.body.csrfToken};}
test("Phase13 metadata administration, invites, tenancy, suspension, settings and limits",async t=>{
  const admin=await login("platform.admin@clarix.test"),id="phase13-"+randomUUID(),email=id+"@example.test";
  const post=(path:string,data:any)=>admin.a.post("/api"+path).set("X-CSRF-Token",admin.csrf).send(data);
  const patch=(data:any)=>admin.a.patch("/api/platform/factories/"+id).set("X-CSRF-Token",admin.csrf).send(data);
  let invitation:any,manager:Awaited<ReturnType<typeof anonymous>>;
  await t.test("real role logins deny platform actions, admin tenant endpoints forbidden",async()=>{
    for(const role of ["manager","analyst","viewer"]){
      const u=await login(`ethmar.${role}@clarix.test`);
      await u.a.get("/api/platform/factories").expect(403);
      await u.a.post("/api/platform/factories").set("X-CSRF-Token",u.csrf).send({}).expect(403);
      await u.a.get("/api/platform/audit").expect(403);
      await u.a.patch("/api/platform/factories/ethmar").set("X-CSRF-Token",u.csrf).send({status:"suspended"}).expect(403);
      await u.a.post("/api/platform/factories/ethmar/invitation").set("X-CSRF-Token",u.csrf).send({action:"revoke"}).expect(403);
      if(role!=="manager")await u.a.put("/api/factory-settings").set("X-CSRF-Token",u.csrf).send({}).expect(403);
    }
    for(const path of ["/imports","/runs","/comparison","/quality","/overview","/source-runs","/data-sources","/members","/factory-settings",
      `/runs/${randomUUID()}`,`/quality/${randomUUID()}`,`/imports/${randomUUID()}`])
      await admin.a.get("/api"+path).expect(r=>assert.ok([403,404].includes(r.status)));
  });
  await t.test("atomic create, unique slug and one-time invite reissue/revoke/expiry",async()=>{
    invitation=(await post("/platform/factories",{name:"Isolated factory",slug:id,defaultLanguage:"en",managerEmail:email}).expect(201)).body;
    await post("/platform/factories",{name:"Duplicate",slug:id,defaultLanguage:"en",managerEmail:email}).expect(409);
    const old=invitation.path;
    invitation=(await post(`/platform/factories/${id}/invitation`,{action:"reissue"}).expect(200)).body;
    await request(app).get("/api/auth/invitation").query({token:old.split("/").pop()}).expect(404);
    await post(`/platform/factories/${id}/invitation`,{action:"revoke"}).expect(200);
    await request(app).get("/api/auth/invitation").query({token:invitation.path.split("/").pop()}).expect(404);
    invitation=(await post(`/platform/factories/${id}/invitation`,{action:"reissue"}).expect(200)).body;
    // Scoped setup owner only, never the ordinary development schema.
    await accountTransaction(async c=>{await scope(c,id);await c.query("UPDATE invitations SET expires_at=now()-interval '1 second' WHERE factory_id=$1",[id]);});
    await request(app).get("/api/auth/invitation").query({token:invitation.path.split("/").pop()}).expect(404);
    invitation=(await post(`/platform/factories/${id}/invitation`,{action:"reissue"}).expect(200)).body;
    manager=await anonymous();
    const accepted=(await manager.a.post("/api/auth/invitation").set("X-CSRF-Token",manager.csrf).send({token:invitation.path.split("/").pop(),name:"Isolated manager",password:process.env.SEED_TEST_PASSWORD}).expect(200)).body;
    manager.csrf=accepted.csrfToken;
    assert.equal(accepted.memberships.length,1);assert.equal(accepted.activeFactoryId,id);
    assert.equal(accepted.user.language,"en");
    await request(app).get("/api/auth/invitation").query({token:invitation.path.split("/").pop()}).expect(404);
    await post(`/platform/factories/${id}/invitation`,{action:"reissue"}).expect(409);
    assert.equal((await manager.a.get("/api/overview").expect(200)).body.currentOrders,0);
    await manager.a.get("/api/platform/factories").expect(403);
  });
  let comparison:any,runIds:string[]=[];
  await t.test("ordinary new factory imports baseline, compares own orders, no branches",async()=>{
    const dir=root+"test-data/najm-packaging/00_baseline";
    const files=readdirSync(dir).filter(f=>f.endsWith(".csv")).map(name=>({name,bytes:readFileSync(dir+"/"+name)}));
    const draft=(await manager.a.post("/api/imports").set("X-CSRF-Token",manager.csrf).send({sourceName:"ERP",files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))}).expect(201)).body;
    for(const f of files)assert.ok((await fetch(draft.files.find((x:any)=>x.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)})).ok);
    await manager.a.post(`/api/imports/${draft.id}/finalize`).set("X-CSRF-Token",manager.csrf).expect(200);
    const mapping=JSON.parse(readFileSync(dir+"/mapping.json","utf8"));
    const codes=(await manager.a.post(`/api/imports/${draft.id}/event-codes`).set("X-CSRF-Token",manager.csrf).send({mapping}).expect(200)).body.items;
    mapping.ignored_event_codes=codes.filter((c:any)=>!mapping.event_code_map[c.code]).map((c:any)=>c.code);
    await manager.a.put(`/api/imports/${draft.id}/mapping`).set("X-CSRF-Token",manager.csrf).send({mapping}).expect(200);
    await manager.a.post(`/api/imports/${draft.id}/check`).set("X-CSRF-Token",manager.csrf).expect(200);
    await manager.a.post(`/api/imports/${draft.id}/approve`).set("X-CSRF-Token",manager.csrf).send({confirmReplacement:true,replacementCount:0,confirmErrors:true}).expect(200);
    const runs=(await manager.a.get("/api/runs").expect(200)).body.items;
    assert.ok(runs.length>=2);runIds=runs.slice(0,2).map((r:any)=>r.id);
    comparison=(await manager.a.get(`/api/comparison?a=${runIds[0]}&b=${runIds[1]}`).expect(200)).body;
    const other=await login("najm.manager@clarix.test");
    const real=await other.a.get("/api/runs/"+runIds[0]).expect(404),missing=await other.a.get("/api/runs/"+randomUUID()).expect(404);
    assert.deepEqual(real.body,missing.body);
  });
  await t.test("settings audited; invalid thresholds rejected; approved comparison unchanged",async()=>{
    const settings=(await manager.a.get("/api/factory-settings").expect(200)).body;
    await manager.a.put("/api/factory-settings").set("X-CSRF-Token",manager.csrf).send({...settings,warningPercent:"5",errorPercent:"1"}).expect(400);
    await manager.a.put("/api/factory-settings").set("X-CSRF-Token",manager.csrf).send({...settings,warningPercent:"2",errorPercent:"8",units:[{unit:"bag",factor:"25"}]}).expect(200);
    assert.deepEqual((await manager.a.get(`/api/comparison?a=${runIds[0]}&b=${runIds[1]}`).expect(200)).body,comparison);
    const audit=(await manager.a.get("/api/factory-settings/audit").expect(200)).body;
    assert.equal(audit.items[0].newValue.warningPercent,"2");assert.equal(audit.items[0].oldValue.warningPercent,"1");
    const dir=root+"test-data/najm-packaging/00_baseline";
    const files=readdirSync(dir).filter(f=>f.endsWith(".csv")).map(name=>({name,bytes:readFileSync(dir+"/"+name)}));
    const next=(await manager.a.post("/api/imports").set("X-CSRF-Token",manager.csrf).send({sourceName:"ERP",files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))}).expect(201)).body;
    for(const f of files)assert.ok((await fetch(next.files.find((x:any)=>x.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)})).ok);
    const finalized=(await manager.a.post(`/api/imports/${next.id}/finalize`).set("X-CSRF-Token",manager.csrf).expect(200)).body;
    assert.equal(finalized.mapping.tolerances.imbalance_warn_pct,"2");
    assert.equal(finalized.mapping.tolerances.imbalance_error_pct,"8");
    assert.equal(finalized.mapping.unit_factors_to_kg.bag,"25");
    await patch({limits:{maxMembers:1,maxRows:1,maxFileBytes:1024}}).expect(200);
    await manager.a.post("/api/members/invitations").set("X-CSRF-Token",manager.csrf).send({email:"limit@example.test",role:"viewer"}).expect(409);
    await manager.a.post("/api/imports").set("X-CSRF-Token",manager.csrf).send({sourceName:"ERP",files:[{name:"large.csv",size:2048,mime:"text/csv"},{name:"other.csv",size:100,mime:"text/csv"}]}).expect(413);
    const tiny=Buffer.from("id,value\nA,1\nB,2\n");
    const limited=(await manager.a.post("/api/imports").set("X-CSRF-Token",manager.csrf).send({sourceName:"ERP",files:["a.csv","b.csv"].map(name=>({name,size:tiny.length,mime:"text/csv"}))}).expect(201)).body;
    for(const f of limited.files)assert.ok((await fetch(f.uploadUrl,{method:"PUT",body:new Uint8Array(tiny)})).ok);
    await manager.a.post(`/api/imports/${limited.id}/finalize`).set("X-CSRF-Token",manager.csrf).expect(413);
    await patch({limits:{maxMembers:0,maxRows:1,maxFileBytes:1024}}).expect(400);
  });
  await t.test("suspend revokes existing sessions; reactivation preserves data but not sessions",async()=>{
    const before=(await manager.a.get("/api/runs").expect(200)).body.total;
    await patch({status:"suspended"}).expect(200);
    await manager.a.get("/api/factory-settings").expect(401);
    const fresh=await anonymous();
    await fresh.a.post("/api/auth/login").set("X-CSRF-Token",fresh.csrf).send({email,password:process.env.SEED_TEST_PASSWORD}).expect(401);
    await patch({status:"active"}).expect(200);
    await manager.a.get("/api/factory-settings").expect(401);
    manager=await login(email);await manager.a.get("/api/runs").expect(200);
    assert.equal((await manager.a.get("/api/runs").expect(200)).body.total,before);
  });
  await t.test("paginated metadata and safe immutable audit; automatic tenant-table RLS coverage",async()=>{
    const list=(await admin.a.get("/api/platform/factories").expect(200)).body;
    assert.ok(list.items.length<=20);
    const f=list.items.find((f:any)=>f.id===id);assert.equal(f.managers,1);assert.ok(f.lastApprovedAt);
    const audit=(await admin.a.get("/api/platform/audit").expect(200)).body;
    assert.ok(!JSON.stringify(audit).includes(invitation.path));
    assert.ok(!JSON.stringify(audit).includes(process.env.SEED_TEST_PASSWORD!));
    for(const table of ["platform_audit","factory_settings_audit"]){
      await assert.rejects(accountTransaction(async c=>{await scope(c,id);await c.query(`DELETE FROM ${table}`);}));
      await assert.rejects(accountTransaction(async c=>{await scope(c,id);await c.query(`UPDATE ${table} SET action='tampered'`);}));
      await assert.rejects(pool.query(`TRUNCATE ${table}`));
    }
    const tables=(await pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind='r' AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='factory_id' AND NOT a.attisdropped)`)).rows;
    assert.ok(tables.length>10);assert.ok(tables.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  });
});
