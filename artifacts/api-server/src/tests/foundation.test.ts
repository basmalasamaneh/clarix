import "../testing/require-isolation";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../app";
import { pool } from "@workspace/db";
import { assertSeedAllowed, allowedPages } from "../lib/permissions";
import { withTenant, closeTenantPools } from "../lib/tenancy";
import { sessionStore } from "../lib/session";

after(async () => { sessionStore.close(); await closeTenantPools(); await pool.end(); });
test("clean-setup verification uses a genuine non-bypass owner", { skip: process.env.EXPECT_NON_BYPASS_OWNER !== "true" }, async () => {
  const result = await pool.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
  assert.equal(result.rows[0].rolsuper, false);
  assert.equal(result.rows[0].rolbypassrls, false);
  const owner = await pool.query("SELECT tableowner=current_user AS owned FROM pg_tables WHERE schemaname=current_schema() AND tablename='factories'");
  assert.equal(owner.rows[0].owned, true);
});
const accounts = [
  ["platform.admin@clarix.test", null, ["platform"]],
  ["ethmar.manager@clarix.test", "ethmar", ["overview", "imports", "runs", "comparison", "quality", "settings"]],
  ["ethmar.analyst@clarix.test", "ethmar", ["overview", "imports", "runs", "comparison", "quality"]],
  ["ethmar.viewer@clarix.test", "ethmar", ["comparison","quality"]],
  ["najm.manager@clarix.test", "najm", ["overview", "imports", "runs", "comparison", "quality", "settings"]],
] as const;

test("seeding is explicit and never permitted in production", () => {
  // Runtime-only test value, never a seeded credential.
  const env = { SEED_TEST_USERS: "true", SEED_TEST_PASSWORD: "x".repeat(20) };
  assert.throws(() => assertSeedAllowed({ ...env, NODE_ENV: "production" }));
  assert.throws(() => assertSeedAllowed({ ...env, REPLIT_DEPLOYMENT: "1" }));
  assert.throws(() => assertSeedAllowed({ ...env, SEED_TEST_USERS: "false" }));
  assert.throws(() => assertSeedAllowed({ SEED_TEST_USERS: "true" }));
  assert.doesNotThrow(() => assertSeedAllowed({ ...env, NODE_ENV: "development" }));
  assert.deepEqual(allowedPages("invented"), []);
});

test("unauthenticated and CSRF requests are denied", async () => {
  await request(app).get("/api/factories/ethmar/pages/overview").expect(401);
  await request(app).post("/api/auth/login").send({}).expect(403);
  const agent = request.agent(app);
  const session = await agent.get("/api/auth/session").expect(200);
  await agent.post("/api/auth/login").set("X-CSRF-Token", session.body.csrfToken)
    .send({ email: "missing@clarix.test", password: "not-a-valid-login" }).expect(401);
});

for (const [email, factory, pages] of accounts) {
  test(`actual password login and permissions: ${email}`, async () => {
    assertSeedAllowed();
    const agent = request.agent(app);
    const initial = await agent.get("/api/auth/session").expect(200);
    const login = await agent.post("/api/auth/login").set("X-CSRF-Token", initial.body.csrfToken)
      .send({ email, password: process.env.SEED_TEST_PASSWORD }).expect(200);
    const token = login.body.csrfToken;
    assert.notEqual(token, initial.body.csrfToken, "CSRF rotates after authentication");
    assert.equal(login.body.user.email, email);
    assert.deepEqual(login.body.allowedPages, [...pages]);
    assert.equal(login.body.activeFactoryId, factory);
    const cookies = login.headers["set-cookie"] as unknown as string[];
    assert.ok(cookies.some((c) => c.includes("HttpOnly") && c.includes("SameSite=Lax")));
    assert.deepEqual(login.body.memberships.map((m: {factoryId: string}) => m.factoryId), factory ? [factory] : []);
    const other = factory === "najm" ? "ethmar" : "najm";
    await agent.get(`/api/factories/${other}/pages/comparison`).expect(403);
    await agent.post("/api/active-factory").set("X-CSRF-Token", token).send({ factoryId: other }).expect(403);
    for (const page of ["overview", "imports", "runs", "comparison", "quality", "settings"]) {
      await agent.get(`/api/factories/${factory ?? "ethmar"}/pages/${page}`)
        .expect((pages as readonly string[]).includes(page) ? 200 : 403);
    }
    await agent.patch("/api/preferences").set("X-CSRF-Token", token)
      .send({ platformAdmin: true, role: "factory_manager" }).expect(400);
    await agent.patch("/api/preferences").set("X-CSRF-Token", token)
      .send({ userId: "test-najm", language: "ar" }).expect(400);
    await agent.patch("/api/preferences").set("X-CSRF-Token", token).send({ language: "ar", theme: "dark" }).expect(200);
    const reload = await agent.get("/api/auth/session").expect(200);
    assert.equal(reload.body.user.language, "ar");
    assert.equal(reload.body.user.theme, "dark");
    await agent.patch("/api/preferences").set("X-CSRF-Token", token).send({ language: "en", theme: "system" }).expect(200);
    for (const action of ["upload", "approve", "settings"]) {
      await agent.post(`/api/factories/${factory ?? "ethmar"}/${action}`).set("X-CSRF-Token", token).send({}).expect(403);
    }
    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    await agent.post("/api/auth/logout").set("X-CSRF-Token", token).expect(204);
    await request(app).get("/api/factories/ethmar/pages/comparison").set("Cookie", cookie).expect(401);
  });
}

test("RLS rejects missing context, forged factory context, and cross-user membership reads", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE clarix_runtime");
    let rows = await client.query("SELECT id FROM factories");
    assert.equal(rows.rowCount, 0);
    await client.query("SELECT set_config('app.user_id','test-manager',true)");
    rows = await client.query("SELECT id FROM factories");
    assert.equal(rows.rowCount, 0, "missing factory context must deny");
    await client.query("ROLLBACK");
  } finally { client.release(); }
  await withTenant("test-manager", "ethmar", async (client) => {
    const rows = await client.query("SELECT id FROM factories");
    assert.deepEqual(rows.rows, [{id: "ethmar"}]);
    const members = await client.query("SELECT user_id FROM memberships");
    assert.deepEqual(members.rows, [{user_id: "test-manager"}]);
    const forbidden = await client.query("SELECT id FROM factories WHERE id='najm'");
    assert.equal(forbidden.rowCount, 0);
  });
  await assert.rejects(withTenant("test-manager", "najm", async () => {}));
  await assert.rejects(withTenant("test-platform", "ethmar", async () => {}));
});
