import app from "./app";
import { logger } from "./lib/logger";
import {pool} from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const identity=(await pool.query(`SELECT session_user,current_user,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
  FROM pg_roles WHERE rolname=current_user`)).rows[0];
if(identity.session_user!=="clarix_runtime"||identity.current_user!=="clarix_runtime"||
   identity.rolsuper||identity.rolbypassrls||identity.rolcreatedb||identity.rolcreaterole)
  throw new Error("Application requires a direct least-privilege runtime database login");
logger.info({databaseRole:identity.current_user},"Runtime database identity verified");
const unsafeTenantTables=(await pool.query(`SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind='r'
  AND (c.relname='factories' OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='factory_id'))
  AND NOT(c.relrowsecurity AND c.relforcerowsecurity)`)).rows;
if(unsafeTenantTables.length)throw new Error("Tenant tables require ENABLE and FORCE RLS before startup");
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
