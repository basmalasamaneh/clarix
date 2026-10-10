export const pagesByRole = {
  factory_manager: ["overview", "imports", "runs", "comparison", "quality", "settings", "members"],
  analyst: ["overview", "imports", "runs", "comparison", "quality"],
  viewer: ["overview", "runs", "comparison", "quality"],
} as const;
export type FactoryRole = keyof typeof pagesByRole;
export function allowedPages(role: string | undefined): string[] {
  return role && Object.hasOwn(pagesByRole, role) ? [...pagesByRole[role as FactoryRole]] : [];
}
export function isProduction(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" || env.REPLIT_DEPLOYMENT === "1";
}
export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (isProduction(env)) throw new Error("Test seeding is forbidden in production");
  if (env.SEED_TEST_USERS !== "true") throw new Error("Test seeding requires SEED_TEST_USERS=true");
  if (!env.SEED_TEST_PASSWORD || env.SEED_TEST_PASSWORD.length < 12) {
    throw new Error("SEED_TEST_PASSWORD must be configured with at least 12 characters");
  }
}
