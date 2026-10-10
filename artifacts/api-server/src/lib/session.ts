import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import type { Request, RequestHandler } from "express";
import { isProduction } from "./permissions";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
    activeFactoryId?: string;
    authenticatedAt?: number;
  }
}
const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error("SESSION_SECRET is required");
export const sessionStore = new (connectPgSimple(session))({
  pool, schemaName: process.env.CLARIX_TEST_SCHEMA || "public", tableName: "sessions", createTableIfMissing: false,
});
export const sessionMiddleware = session({
  name: "clarix.sid", secret, store: sessionStore,
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProduction(), sameSite: "lax", maxAge: 8 * 60 * 60 * 1000, path: "/" },
});
export function csrfToken(req: Request) {
  return req.session.csrfToken ??= randomBytes(32).toString("hex");
}
export const csrfGuard: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const token = req.get("X-CSRF-Token");
  const expected = req.session.csrfToken;
  if (!token || !expected || !/^[a-f0-9]{64}$/.test(token) || token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    res.status(403).json({ error: "INVALID_CSRF" }); return;
  }
  next();
};
export function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
}
