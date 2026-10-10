import argon2 from "argon2";
import { factories, users, memberships } from "@workspace/db/schema";
import {db,pool} from "@workspace/db/admin";
import { assertSeedAllowed } from "../lib/permissions";
import { logger } from "../lib/logger";
import { sql } from "drizzle-orm";

assertSeedAllowed();
const accounts = [
  { id: "test-platform", email: "platform.admin@clarix.test", name: "Platform Administrator", platformAdmin: true, factoryId: null, role: null },
  { id: "test-manager", email: "ethmar.manager@clarix.test", name: "Ethmar Manager", factoryId: "ethmar", role: "factory_manager" },
  { id: "test-analyst", email: "ethmar.analyst@clarix.test", name: "Ethmar Analyst", factoryId: "ethmar", role: "analyst" },
  { id: "test-viewer", email: "ethmar.viewer@clarix.test", name: "Ethmar Viewer", factoryId: "ethmar", role: "viewer" },
  { id: "test-najm", email: "najm.manager@clarix.test", name: "Najm Manager", factoryId: "najm", role: "factory_manager" },
] as const;
try {
  await db.transaction(async (tx) => {
    // The explicit development-only seed runs as the table owner. RLS remains
    // ENABLED for tenant roles; temporarily allow only the owner's standard
    // bypass inside this transaction. ALTER TABLE locks prevent other sessions
    // observing the intermediate state, and rollback restores FORCE on errors.
    await tx.execute(sql`ALTER TABLE factories NO FORCE ROW LEVEL SECURITY`);
    await tx.execute(sql`ALTER TABLE memberships NO FORCE ROW LEVEL SECURITY`);
    await tx.insert(factories).values([
      { id: "ethmar", name: "Ethmar Plastics" },
      { id: "najm", name: "Najm Packaging" },
    ]).onConflictDoNothing();
    for (const account of accounts) {
      const passwordHash = await argon2.hash(process.env.SEED_TEST_PASSWORD!, {
        type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
      });
      await tx.insert(users).values({
        id: account.id, email: account.email, name: account.name, passwordHash,
        platformAdmin: "platformAdmin" in account, testAccount: true,
      }).onConflictDoNothing();
      if (account.factoryId && account.role) {
        await tx.insert(memberships).values({
          userId: account.id, factoryId: account.factoryId, role: account.role,
        }).onConflictDoNothing();
      }
    }
    await tx.execute(sql`ALTER TABLE factories FORCE ROW LEVEL SECURITY`);
    await tx.execute(sql`ALTER TABLE memberships FORCE ROW LEVEL SECURITY`);
  });
  logger.info("Five development test accounts seeded; passwords were not output");
} finally {
  await pool.end();
}
