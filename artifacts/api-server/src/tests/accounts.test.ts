import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import request from "supertest";
import app from "../app";
import {pool} from "@workspace/db";
import {sessionStore} from "../lib/session";
import {closeTenantPools} from "../lib/tenancy";
import {accountTransaction,scope} from "../accounts/context";
after(async()=>{sessionStore.close();await closeTenantPools();await pool.end();});
const password=process.env.SEED_TEST_PASSWORD!;
async function anonymous() {
  const a=request.agent(app),s=await a.get("/api/auth/session").expect(200);
  return {a,csrf:s.body.csrfToken as string};
}
async function login(email:string,pw=password) {
  const client=await anonymous();
  const result=await client.a.post("/api/auth/login").set("X-CSRF-Token",client.csrf).send({email,password:pw}).expect(200);
  return {...client,csrf:result.body.csrfToken as string,session:result.body};
}
test("accounts, invitations, recovery, audit and session security",async t=>{
  const manager=await login("ethmar.manager@clarix.test"),najm=await login("najm.manager@clarix.test");
  const email=`invite-${randomUUID()}@example.test`;
  const create=(address:string,role="viewer")=>manager.a.post("/api/members/invitations").set("X-CSRF-Token",manager.csrf)
    .send({email:address,role,factory_id:"najm",factoryId:"najm"});
  let token="",invId="",memberId="",accepted:Awaited<ReturnType<typeof anonymous>>;
  await t.test("manager only on every endpoint; authenticated factory overrides body",async()=>{
    for(const role of ["analyst","viewer"]) {
      const u=await login(`ethmar.${role}@clarix.test`);
      for(const path of ["/members","/members/invitations","/members/audit"])
        await u.a.get(`/api${path}`).expect(403);
      await u.a.patch("/api/members/test-manager").set("X-CSRF-Token",u.csrf).send({role:"viewer"}).expect(403);
      for(const path of ["/members/invitations",`/members/invitations/${randomUUID()}/revoke`,`/members/invitations/${randomUUID()}/reissue`])
        await u.a.post(`/api${path}`).set("X-CSRF-Token",u.csrf).send({email,role:"viewer"}).expect(403);
    }
    await manager.a.patch("/api/members/test-najm").set("X-CSRF-Token",manager.csrf).send({active:false}).expect(404);
    const list=(await manager.a.get("/api/members?factory_id=najm").expect(200)).body;
    assert.ok(list.items.every((m:any)=>m.id!=="test-najm"));
    await manager.a.post("/api/members/invitations").send({email,role:"viewer"}).expect(403);
  });
  await t.test("last active manager cannot be demoted or deactivated",async()=>{
    for(const body of [{role:"viewer"},{active:false}])
      await manager.a.patch("/api/members/test-manager").set("X-CSRF-Token",manager.csrf).send(body).expect(409);
  });
  await t.test("create 7-day hashed single-use token with tenant-safe scope",async()=>{
    const r=await create(email).expect(201);token=r.body.path.split("/").at(-1);invId=r.body.invitation.id;
    assert.ok(token.length>=43);
    await accountTransaction(async c=>{
      await scope(c,"ethmar");
      const row=(await c.query("SELECT * FROM invitations WHERE id=$1",[invId])).rows[0];
      assert.equal(row.factory_id,"ethmar");
      assert.equal(row.token_hash,createHash("sha256").update(token).digest("hex"));
      assert.ok(!JSON.stringify(row).includes(token));
      assert.equal(row.expires_at.getTime()-row.created_at.getTime(),7*24*60*60*1000);
    });
    const publicClient=await anonymous();
    const details=(await publicClient.a.get("/api/auth/invitation").query({token}).expect(200)).body;
    assert.equal(details.factoryName,"Ethmar Plastics");assert.equal(details.email,email);
    await najm.a.post(`/api/members/invitations/${invId}/revoke`).set("X-CSRF-Token",najm.csrf).expect(404);
    assert.ok(!(await manager.a.get("/api/members/invitations").expect(200)).text.includes(token));
  });
  await t.test("accept signs in with invitation identity; used link fails neutrally",async()=>{
    accepted=await anonymous();
    await accepted.a.post("/api/auth/invitation").send({token,name:"Invited member",password}).expect(403);
    await accepted.a.post("/api/auth/invitation").set("X-CSRF-Token",accepted.csrf)
      .send({token,name:"Invited member",password:String.fromCodePoint(0x1f600).repeat(6)}).expect(400);
    const r=await accepted.a.post("/api/auth/invitation").set("X-CSRF-Token",accepted.csrf)
      .send({token,name:"Invited member",password,email:"attacker@example.test",factory_id:"najm",role:"factory_manager"}).expect(200);
    accepted.csrf=r.body.csrfToken;memberId=r.body.user.id;
    assert.equal(r.body.user.email,email);
    assert.equal(r.body.memberships.length,1);assert.equal(r.body.memberships[0].factoryId,"ethmar");
    assert.equal(r.body.memberships[0].role,"viewer");
    const a=await anonymous();
    await a.a.get("/api/auth/invitation").query({token}).expect(404);
    const reused=await a.a.post("/api/auth/invitation").set("X-CSRF-Token",a.csrf).send({token,name:"Other",password}).expect(404);
    const bad=await a.a.post("/api/auth/invitation").set("X-CSRF-Token",a.csrf).send({token:randomBytes(32).toString("base64url"),name:"Other",password}).expect(404);
    assert.deepEqual(reused.body,bad.body);
  });
  await t.test("deactivation invalidates existing sessions; reactivation does not revive them",async()=>{
    await manager.a.patch(`/api/members/${memberId}`).set("X-CSRF-Token",manager.csrf).send({active:false}).expect(200);
    assert.equal((await accepted.a.get("/api/auth/session").expect(200)).body.user,null);
    const a=await anonymous();
    await a.a.post("/api/auth/login").set("X-CSRF-Token",a.csrf).send({email,password}).expect(401);
    await manager.a.patch(`/api/members/${memberId}`).set("X-CSRF-Token",manager.csrf).send({active:true,role:"analyst"}).expect(200);
    assert.equal((await accepted.a.get("/api/auth/session").expect(200)).body.user,null);
    const logged=await login(email);
    assert.equal(logged.session.memberships[0].role,"analyst");
  });
  await t.test("revoke, expire, reissue invalidate old links; tokens not retained in audit",async()=>{
    const r=await create(`revoked-${randomUUID()}@example.test`).expect(201),oldToken=r.body.path.split("/").at(-1);
    const reissued=await manager.a.post(`/api/members/invitations/${r.body.invitation.id}/reissue`).set("X-CSRF-Token",manager.csrf).expect(201);
    const a=await anonymous(),newToken=reissued.body.path.split("/").at(-1);
    await a.a.get("/api/auth/invitation").query({token:oldToken}).expect(404);
    await a.a.get("/api/auth/invitation").query({token:newToken}).expect(200);
    await manager.a.post(`/api/members/invitations/${reissued.body.invitation.id}/revoke`).set("X-CSRF-Token",manager.csrf).expect(204);
    await a.a.get("/api/auth/invitation").query({token:newToken}).expect(404);
    const exp=await create(`expired-${randomUUID()}@example.test`).expect(201);
    await accountTransaction(async c=>{await scope(c,"ethmar");await c.query("UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[exp.body.invitation.id]);});
    await a.a.get("/api/auth/invitation").query({token:exp.body.path.split("/").at(-1)}).expect(404);
    const logs=(await manager.a.get("/api/members/audit").expect(200)).text;
    for(const secret of [password,token,oldToken,newToken]) assert.ok(!logs.includes(secret));
  });
  await t.test("password change checks current password, ends other sessions; logout everywhere",async()=>{
    const first=await login(email),second=await login(email);
    await first.a.post("/api/auth/password").set("X-CSRF-Token",first.csrf)
      .send({currentPassword:"wrong password",newPassword:password}).expect(400);
    const newPassword=randomBytes(20).toString("base64url");
    const changed=await first.a.post("/api/auth/password").set("X-CSRF-Token",first.csrf)
      .send({currentPassword:password,newPassword}).expect(200);
    assert.ok(changed.body.user);
    assert.equal((await second.a.get("/api/auth/session").expect(200)).body.user,null);
    await first.a.post("/api/auth/logout-everywhere").set("X-CSRF-Token",changed.body.csrfToken).expect(204);
    assert.equal((await first.a.get("/api/auth/session").expect(200)).body.user,null);
    const logged=await login(email,newPassword);
    assert.ok(logged.session.user);
  });
  await t.test("deactivate/reinvite recovery resets password only within same factory",async()=>{
    await manager.a.patch(`/api/members/${memberId}`).set("X-CSRF-Token",manager.csrf).send({active:false}).expect(200);
    const r=await create(email,"viewer").expect(201);
    await manager.a.patch(`/api/members/${memberId}`).set("X-CSRF-Token",manager.csrf).send({active:true}).expect(409);
    const a=await anonymous();
    const result=await a.a.post("/api/auth/invitation").set("X-CSRF-Token",a.csrf).send({token:r.body.path.split("/").at(-1),name:"Recovered member",password}).expect(200);
    assert.equal(result.body.user.id,memberId);
    await create("najm.manager@clarix.test").expect(404);
  });
  await t.test("audit is append-only and factory scoped including direct restricted SQL",async()=>{
    await accountTransaction(async c=>{
      await scope(c,"ethmar");
      const rows=(await c.query("SELECT factory_id FROM account_audit")).rows;
      assert.ok(rows.length>0&&rows.every(r=>r.factory_id==="ethmar"));
    });
    for(const sql of ["UPDATE account_audit SET action='changed'","DELETE FROM account_audit","TRUNCATE account_audit"])
      await assert.rejects(accountTransaction(async c=>{await scope(c,"ethmar");await c.query(sql);}));
    const owner=await pool.connect();
    try {
      for(const sql of ["UPDATE account_audit SET action='changed'","DELETE FROM account_audit","TRUNCATE account_audit"]) {
        await owner.query("BEGIN");
        await owner.query("ALTER TABLE account_audit NO FORCE ROW LEVEL SECURITY");
        await assert.rejects(owner.query(sql),/append-only/);
        await owner.query("ROLLBACK");
      }
    } finally {await owner.query("ROLLBACK");owner.release();}
    const all=(await manager.a.get("/api/members").expect(200)).body.items;
    assert.ok(all.find((u:any)=>u.id===memberId).loginSuccessCount>=1);
  });
  await t.test("concurrent acceptance consumes a token once",async()=>{
    const invite=await create(`race-${randomUUID()}@example.test`).expect(201);
    const a=await anonymous(),b=await anonymous();
    const results=await Promise.all([a,b].map(u=>u.a.post("/api/auth/invitation").set("X-CSRF-Token",u.csrf)
      .send({token:invite.body.path.split("/").at(-1),name:"Concurrent recipient",password})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,404]);
  });
  await t.test("concurrent manager demotions always retain an active manager",async()=>{
    const email2=`manager-${randomUUID()}@example.test`;
    const invite=await create(email2,"factory_manager").expect(201);
    const second=await anonymous();
    const joined=await second.a.post("/api/auth/invitation").set("X-CSRF-Token",second.csrf)
      .send({token:invite.body.path.split("/").at(-1),name:"Second manager",password}).expect(200);
    const clients=[{...manager,id:"test-manager"},{...second,csrf:joined.body.csrfToken,id:joined.body.user.id}];
    const changes=await Promise.all(clients.map(u=>u.a.patch(`/api/members/${u.id}`).set("X-CSRF-Token",u.csrf).send({role:"viewer"})));
    assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);
    const remaining=clients[changes.findIndex(r=>r.status===409)],demoted=clients[changes.findIndex(r=>r.status===200)];
    await remaining.a.patch(`/api/members/${demoted.id}`).set("X-CSRF-Token",remaining.csrf).send({role:"factory_manager"}).expect(200);
    await manager.a.patch(`/api/members/${joined.body.user.id}`).set("X-CSRF-Token",manager.csrf).send({role:"viewer"}).expect(200);
  });
  await t.test("generic login and invite rate limits",async()=>{
    const a=await anonymous();
    const invalid=()=>a.a.post("/api/auth/login").set("X-CSRF-Token",a.csrf).send({email:"unknown@example.test",password:"wrong"});
    const unknown=await invalid().expect(401);
    const known=await a.a.post("/api/auth/login").set("X-CSRF-Token",a.csrf).send({email,password:"wrong"}).expect(401);
    assert.deepEqual(unknown.body,known.body);
    let status=401;
    for(let i=0;i<35&&status!==429;i++)status=(await invalid()).status;
    assert.equal(status,429);
    status=404;
    for(let i=0;i<25&&status!==429;i++)status=(await a.a.post("/api/auth/invitation").set("X-CSRF-Token",a.csrf)
      .send({token:randomBytes(32).toString("base64url"),name:"Test",password})).status;
    assert.equal(status,429);
  });
});
