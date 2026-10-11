import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../app";
import {pool} from "@workspace/db";
import {closeTenantPools} from "../lib/tenancy";
import {platformTransaction} from "../platform/service";
import {demoDatasets} from "../platform/demo-data";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../../../",import.meta.url));
after(async()=>{await closeTenantPools();await pool.end();});
async function login(email:string){
  const a=request.agent(app),s=(await a.get("/api/auth/session")).body;
  const r=await a.post("/api/auth/login").set("X-CSRF-Token",s.csrfToken).send({email,password:process.env.SEED_TEST_PASSWORD}).expect(200);
  return {a,csrf:r.body.csrfToken,user:r.body.user.id};
}
test("Demo: embedded synthetic fixtures equal baselines, provisioning scoped and access denied",async()=>{
  for(const [i,d] of demoDatasets.entries()){
    const folder=i===0?"ethmar-plastics":"najm-packaging";
    for(const [name,text] of Object.entries(d.files))assert.equal(text,readFileSync(root+`test-data/${folder}/00_baseline/${name}`,"utf8").replace(/^\uFEFF/,"").replace(/\r\n/g,"\n"));
  }
  for(const role of ["manager","analyst","viewer"]){
    const u=await login(`ethmar.${role}@clarix.test`);
    await u.a.post("/api/platform/demo-factories").set("X-CSRF-Token",u.csrf).send({name:"Demo",defaultLanguage:"en"}).expect(403);
  }
  const admin=await login("platform.admin@clarix.test");
  const before=(await admin.a.get("/api/platform/factories")).body.total;
  const result=(await admin.a.post("/api/platform/demo-factories").set("X-CSRF-Token",admin.csrf)
    .send({name:"Synthetic",defaultLanguage:"en"}).expect(201)).body;
  assert.equal(result.factory.demo,true);assert.equal(result.factory.activeMembers,0);
  assert.equal(result.path,null);assert.ok(result.factory.lastApprovedAt);
  assert.equal((await admin.a.get("/api/platform/factories")).body.total,before+1);
  await admin.a.get("/api/runs").expect(403);
  await platformTransaction(admin.user,async c=>{
    await c.query("SELECT set_config('app.factory_id',$1,true)",[result.factory.id]);
    assert.equal((await c.query("SELECT * FROM imports WHERE factory_id=$1",[result.factory.id])).rowCount,0,
      "platform provisioning access must close at commit");
    assert.equal((await c.query("SELECT settings FROM factories WHERE id=$1",[result.factory.id])).rows[0].settings.demoProvisioning,undefined);
  });
  await admin.a.patch("/api/platform/factories/"+result.factory.id).set("X-CSRF-Token",admin.csrf).send({status:"suspended"}).expect(200);
  const manager=await login("ethmar.manager@clarix.test");
  await manager.a.get("/api/overview").expect(200);
});
