import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { getMemberships } from "./tenancy";
import { allowedPages, isProduction } from "./permissions";
import { csrfToken } from "./session";
import { GetSessionResponse } from "@workspace/api-zod";

export async function sessionView(req: Request) {
  const id = req.session.userId;
  const [user] = id ? await db.select().from(users).where(eq(users.id, id)) : [];
  const expired = req.session.authenticatedAt && Date.now() - req.session.authenticatedAt > 8 * 60 * 60 * 1000;
  if (!user || expired || (user.testAccount && isProduction()) || (req.session.authVersion??0)!==user.sessionVersion) {
    delete req.session.userId;
    delete req.session.activeFactoryId;
    return { user: null, csrfToken: csrfToken(req), memberships: [], activeFactoryId: null, allowedPages: [] };
  }
  const memberships = user.platformAdmin ? [] : await getMemberships(user.id);
  if(!user.platformAdmin&&!memberships.length) {
    delete req.session.userId;
    delete req.session.activeFactoryId;
    return {user:null,csrfToken:csrfToken(req),memberships:[],activeFactoryId:null,allowedPages:[]};
  }
  const active = memberships.find((m) => m.factoryId === req.session.activeFactoryId) ?? memberships[0];
  req.session.activeFactoryId = active?.factoryId;
  return GetSessionResponse.parse({
    user: { id: user.id, name: user.name, email: user.email, platformAdmin: user.platformAdmin,
      language: user.language, theme: user.theme, tourCompleted: user.tourCompleted },
    memberships, activeFactoryId: active?.factoryId ?? null,
    allowedPages: user.platformAdmin ? ["platform"] : allowedPages(active?.role),
    csrfToken: csrfToken(req),
  });
}
