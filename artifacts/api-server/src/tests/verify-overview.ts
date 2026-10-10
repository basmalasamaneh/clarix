import "./../testing/require-isolation";
import assert from "node:assert/strict";
import type {TestContext} from "node:test";
import type {Agent} from "supertest";
import {withTenant} from "../lib/tenancy";
import {overview} from "../imports/overview";

type Actor={a:Agent;token:string;user:string;factory:string};
export async function verifyOverview(t:TestContext,viewer:Actor,najm:Actor,manager:Actor) {
  await t.test("Overview equals Data Quality and Runs; Viewer read, factory isolation and latest five",async()=>{
    for(const who of [viewer,najm]) {
      const o=(await who.a.get("/api/overview").query({factoryId:who===viewer?najm.factory:viewer.factory}).expect(200)).body;
      const q=(await who.a.get("/api/quality").expect(200)).body;
      const r=(await who.a.get("/api/runs").expect(200)).body;
      assert.deepEqual(o.statuses,q.summary.orders);
      assert.equal(o.errors,q.summary.errors);assert.equal(o.warnings,q.summary.warnings);
      assert.equal(o.currentOrders,r.total);
      assert.ok(o.latestImports.length<=5);assert.ok(o.comparisonRuns.length<=2);
      await withTenant(who.user,who.factory,async db=>{
        const rows=(await db.query(`SELECT i.id,i.source_name,i.status,i.created_at FROM imports i JOIN factories f ON f.id=i.factory_id
          WHERE i.factory_id=$1 AND NOT coalesce((f.settings->'sourceArchives'->i.source_name->>'archived')::boolean,false)
          ORDER BY i.created_at DESC,i.id`,[who.factory])).rows;
        assert.equal(o.approvedImports,rows.filter(x=>x.status==="approved").length);
        assert.deepEqual(o.latestImports.map((x:any)=>x.id),rows.slice(0,5).map(x=>x.id));
        for(const run of o.comparisonRuns) {
          assert.notEqual(run.overall,"red");assert.notEqual(run.date,null);
          assert.equal((await db.query("SELECT count(*)::int AS n FROM orders WHERE id=$1 AND factory_id=$2",[run.id,who.factory])).rows[0].n,1);
        }
      });
      if(o.comparisonRuns.length===2) {
        assert.ok(o.comparisonRuns[0].date>=o.comparisonRuns[1].date);
        await who.a.get("/api/comparison").query({a:o.comparisonRuns[0].id,b:o.comparisonRuns[1].id}).expect(200);
        await (who===viewer?najm:viewer).a.get(`/api/runs/${o.comparisonRuns[0].id}`).expect(404);
      }
    }
    await viewer.a.get("/api/imports").expect(403);
    await viewer.a.post("/api/overview").set("X-CSRF-Token",viewer.token).send({}).expect(404);
  });
  await t.test("Overview excludes archived sources from all sections and restores reversibly",async()=>{
    const before=(await viewer.a.get("/api/overview").expect(200)).body;
    const sourceName=before.comparisonRuns[0].sourceName;
    await manager.a.patch("/api/data-sources/archive").set("X-CSRF-Token",manager.token).send({sourceName,archived:true}).expect(200);
    const archived=(await viewer.a.get("/api/overview").expect(200)).body;
    assert.ok(archived.approvedImports<before.approvedImports);
    assert.ok(archived.currentOrders<before.currentOrders);
    assert.ok([...archived.latestImports,...archived.comparisonRuns].every(x=>x.sourceName!==sourceName));
    assert.deepEqual(archived.statuses,(await viewer.a.get("/api/quality").expect(200)).body.summary.orders);
    assert.equal(archived.currentOrders,(await viewer.a.get("/api/runs").expect(200)).body.total);
    await manager.a.patch("/api/data-sources/archive").set("X-CSRF-Token",manager.token).send({sourceName,archived:false}).expect(200);
    assert.deepEqual((await viewer.a.get("/api/overview").expect(200)).body,before);
  });
  await t.test("Shortcut ignores missing dates, does not substitute upload dates, and handles one dated run",async()=>{
    await withTenant(manager.user,manager.factory,async db=>{
      await db.query("SAVEPOINT overview_dates");
      try {
        const ctx={db,user:manager.user,factory:manager.factory,settings:{}};
        const first=(await overview(ctx)).comparisonRuns[0];
        await db.query("UPDATE production_records SET date=NULL WHERE factory_id=$1",[manager.factory]);
        assert.equal((await overview(ctx)).comparisonRuns.length,0);
        await db.query("UPDATE production_records SET date='2026-01-02' WHERE factory_id=$1 AND order_id=$2",[manager.factory,first.id]);
        const one=await overview(ctx);
        assert.equal(one.comparisonRuns.length,1);assert.equal(one.comparisonRuns[0].id,first.id);
        assert.equal(one.comparisonRuns[0].date,"2026-01-02");
      } finally {await db.query("ROLLBACK TO SAVEPOINT overview_dates");}
    });
  });
}
