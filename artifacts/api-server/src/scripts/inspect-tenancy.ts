import { withTenant, closeTenantPools } from "../lib/tenancy";
import { logger } from "../lib/logger";

// Development evidence only; no credentials are read out or logged.
try {
  await withTenant("test-manager", "ethmar", async (c) => {
    const role = await c.query(`SELECT session_user AS connection_identity,
      current_user AS effective_role, rolsuper, rolbypassrls
      FROM pg_roles WHERE rolname=current_user`);
    const tables = await c.query(`SELECT c.relname AS table_name,
      pg_get_userbyid(c.relowner) AS owner,
      pg_get_userbyid(c.relowner)=current_user AS runtime_owns_table,
      c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[])
      ORDER BY c.relname`, [["imports","raw_rows","column_mappings","orders","production_records","events","data_issues"]]);
    await c.query("SELECT set_config('app.factory_id','',true)");
    const noContext = await c.query("SELECT count(*) AS visible_orders FROM orders");
    logger.info({ role: role.rows[0], tables: tables.rows, noFactoryContext: noContext.rows[0] }, "Tenant isolation evidence");
  });
} finally { await closeTenantPools(); }
