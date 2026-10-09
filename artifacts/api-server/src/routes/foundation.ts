import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { LoginBody, UpdatePreferencesBody, SelectFactoryBody, GetPageParams, GetPageResponse } from "@workspace/api-zod";
import { sessionView } from "../lib/identity";
import { saveSession } from "../lib/session";
import { isProduction, allowedPages } from "../lib/permissions";
import { withRequestTenant } from "../lib/tenancy";

const router: IRouter = Router();
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  skipSuccessfulRequests: true, message: { error: "TOO_MANY_ATTEMPTS" },
});
// A random dummy hash equalizes nonexistent-user verification cost without any
// reusable password or hard-coded credential.
const dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

router.get("/auth/session", async (req, res) => {
  res.json(await sessionView(req));
});
router.post("/auth/login", loginLimit, async (req, res) => {
  const input = LoginBody.strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "INVALID_INPUT" }); return; }
  const [user] = await db.select().from(users).where(eq(users.email, input.data.email.trim().toLowerCase()));
  const valid = await argon2.verify(user?.passwordHash ?? await dummyHash, input.data.password);
  if (!user || !valid || (user.testAccount && isProduction())) {
    res.status(401).json({ error: "INVALID_CREDENTIALS" }); return;
  }
  await new Promise<void>((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
  req.session.userId = user.id;
  req.session.authenticatedAt = Date.now();
  const view = await sessionView(req);
  await saveSession(req);
  req.log.info({ userId: user.id }, "User authenticated");
  res.json(view);
});
router.post("/auth/logout", async (req, res) => {
  await new Promise<void>((resolve, reject) => req.session.destroy((err) => err ? reject(err) : resolve()));
  res.clearCookie("clarix.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: isProduction() });
  res.status(204).end();
});

router.use(async (req, res, next) => {
  const view = await sessionView(req);
  if (!view.user) { res.status(401).json({ error: "UNAUTHENTICATED" }); return; }
  res.locals.identity = view;
  next();
});
router.patch("/preferences", async (req, res) => {
  const input = UpdatePreferencesBody.strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "INVALID_INPUT" }); return; }
  if (Object.keys(input.data).length) {
    await db.update(users).set(input.data).where(eq(users.id, req.session.userId!));
  }
  res.json(await sessionView(req));
});
router.post("/active-factory", async (req, res) => {
  const input = SelectFactoryBody.strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "INVALID_INPUT" }); return; }
  const view = await sessionView(req);
  if (!view.memberships.some((m) => m.factoryId === input.data.factoryId)) {
    res.status(403).json({ error: "FORBIDDEN" }); return;
  }
  req.session.activeFactoryId = input.data.factoryId;
  const next = await sessionView(req);
  await saveSession(req);
  res.json(next);
});
router.get("/factories/:factoryId/pages/:page", async (req, res) => {
  const input = GetPageParams.safeParse(req.params);
  if (!input.success) { res.status(400).json({ error: "INVALID_INPUT" }); return; }
  const view = await sessionView(req);
  const membership = view.memberships.find((m) => m.factoryId === input.data.factoryId);
  if (view.user?.platformAdmin || !membership || input.data.factoryId !== view.activeFactoryId ||
      !allowedPages(membership.role).includes(input.data.page)) {
    res.status(403).json({ error: "FORBIDDEN" }); return;
  }
  const found = await withRequestTenant(req, async (client) =>
    client.query("SELECT id FROM factories WHERE id=$1 AND status='active'", [membership.factoryId]));
  if (!found.rowCount) { res.status(403).json({ error: "FORBIDDEN" }); return; }
  res.json(GetPageResponse.parse({ page: input.data.page, factoryId: membership.factoryId, state: "empty" }));
});
// Later-phase writes are not implemented, and cannot be used to escape RBAC.
router.all("/factories/{*rest}", (_req, res) => { res.status(403).json({ error: "FORBIDDEN" }); });
export default router;
