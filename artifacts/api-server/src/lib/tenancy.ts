import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

// All factory reads run with a non-owner, non-bypass role. Context is transaction
// local: pooled connections cannot retain another user's tenant or identity.
export async function withTenant<T>(
  userId: string,
  factoryId: string | null,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(factoryId === null ? "SET LOCAL ROLE clarix_identity" : "SET LOCAL ROLE clarix_runtime");
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.factory_id', $2, true)", [userId, factoryId ?? ""]);
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
  return withTenant(userId, null, async (client) => {
    const result = await client.query<{ factoryId: string; factoryName: string; role: string }>(
      `SELECT m.factory_id AS "factoryId", f.name AS "factoryName", m.role
       FROM memberships m JOIN factories f ON f.id=m.factory_id
       WHERE m.user_id=$1 AND f.status='active' ORDER BY f.name`, [userId],
    );
    return result.rows;
  });
}
