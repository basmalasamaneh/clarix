import pg, { type PoolClient } from "pg";
import type { Request } from "express";
import {runtimeConfig} from "@workspace/db";

// Every connection authenticates as clarix_runtime. Identity discovery uses a
// subordinate, non-login role; no application connection authenticates as owner.
const runtimePool = new pg.Pool(runtimeConfig());
const discoveryPool = new pg.Pool(runtimeConfig("clarix_identity"));
export async function closeTenantPools() {
  await Promise.all([runtimePool.end(), discoveryPool.end()]);
}

export class TenantAccessError extends Error {
  constructor() { super("Factory access denied"); }
}

// Only server code may supply identity and active-factory session values.
// Request handlers should call withRequestTenant, never pass req.body/params.
export async function withTenant<T>(
  userId: string,
  factoryId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!userId || !factoryId) throw new TenantAccessError();
  const client = await runtimePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.factory_id', $2, true)", [userId, factoryId]);
    const membership = await client.query(
      "SELECT 1 FROM memberships m JOIN factories f ON f.id=m.factory_id WHERE m.user_id=$1 AND m.factory_id=$2 AND m.active AND NOT m.recovery_required AND f.status='active'",
      [userId, factoryId],
    );
    if (!membership.rowCount) throw new TenantAccessError();
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getMemberships(userId: string) {
  const client = await discoveryPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id',$1,true)", [userId]);
    const result = await client.query<{ factoryId: string; factoryName: string; role: string }>(
      `SELECT m.factory_id AS "factoryId", f.name AS "factoryName", m.role, coalesce(f.settings->>'demo'='true',false) AS demo
       FROM memberships m JOIN factories f ON f.id=m.factory_id
       WHERE m.user_id=$1 AND m.active AND NOT m.recovery_required AND f.status='active' ORDER BY f.name`, [userId],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export function withRequestTenant<T>(req: Request, operation: (client: PoolClient) => Promise<T>) {
  // Neither route params, headers nor body can select the scope of a query.
  return withTenant(req.session.userId ?? "", req.session.activeFactoryId ?? "", operation);
}
