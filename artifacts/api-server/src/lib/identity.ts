import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { getMemberships } from "./tenancy";
import { allowedPages, isProduction } from "./permissions";
import { csrfToken } from "./session";
import {absoluteTimeout,idleTimeout} from "./session";
import {needsFactor,sessionRevoked} from "../accounts/security";
import { GetSessionResponse } from "@workspace/api-zod";

export async function sessionView(req: Request) {
  const id = req.session.userId;
  const [user] = id ? await db.select().from(users).where(eq(users.id, id)) : [];
  const expired = req.session.authenticatedAt && (Date.now()-req.session.authenticatedAt>absoluteTimeout ||
    Date.now()-(req.session.lastActiveAt??req.session.authenticatedAt)>idleTimeout);
  const revoked=id?await sessionRevoked(id,req.sessionID):false;
  const missingFactor=user?await needsFactor(user.id)&&!req.session.factorVerified:false;
  if (!user || expired || revoked || missingFactor || (user.testAccount && isProduction()) || (req.session.authVersion??0)!==user.sessionVersion) {
    delete req.session.userId;
    delete req.session.activeFactoryId;
    return { user: null, csrfToken: csrfToken(req), memberships: [], activeFactoryId: null, allowedPages: [], pendingSecondFactor:!!req.session.pendingFactor&&Date.now()-req.session.pendingFactor.at<300000 };
  }
  const memberships = user.platformAdmin ? [] : await getMemberships(user.id);
  if(!user.platformAdmin&&!memberships.length) {
    delete req.session.userId;
    delete req.session.activeFactoryId;
    return {user:null,csrfToken:csrfToken(req),memberships:[],activeFactoryId:null,allowedPages:[]};
  }
  const active = memberships.find((m) => m.factoryId === req.session.activeFactoryId) ?? memberships[0];
  req.session.activeFactoryId = active?.factoryId;
  req.session.lastActiveAt=Date.now();
  return GetSessionResponse.parse({
    user: { id: user.id, name: user.name, email: user.email, platformAdmin: user.platformAdmin,
      language: user.language, theme: user.theme, tourCompleted: user.tourCompleted },
    memberships, activeFactoryId: active?.factoryId ?? null,
    allowedPages: user.platformAdmin ? ["platform"] : allowedPages(active?.role),
    csrfToken: csrfToken(req),
  });
}
