import type {PoolClient} from "pg";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {randomBytes,pbkdf2Sync,createHmac,createHash} from "node:crypto";
import {deploymentInvitation} from "./deployment-invitation";

const quote=(s:string)=>`"${s.replaceAll('"','""')}"`;
const roles=["clarix_runtime","clarix_identity","clarix_accounts","clarix_platform"];
export const tenantTables=["factories","memberships","imports","raw_rows","column_mappings","orders","production_records","events","data_issues","orders_history","production_records_history","events_history","invitations","account_audit"];
export async function verifyDeploymentSecurity(c:PoolClient){
  const r=(await c.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,rolcanlogin
    FROM pg_roles WHERE rolname=ANY($1)`,[roles])).rows;
  if(r.length!==roles.length||r.some(v=>v.rolsuper||v.rolcreatedb||v.rolcreaterole||v.rolbypassrls||v.rolinherit||v.rolcanlogin!==(v.rolname==="clarix_runtime")))
    throw new Error("Unsafe database role attributes");
  const inherited=(await c.query(`WITH RECURSIVE reachable(id) AS (
    SELECT oid FROM pg_roles WHERE rolname=ANY($1) UNION
    SELECT m.roleid FROM pg_auth_members m JOIN reachable r ON m.member=r.id)
    SELECT rolname FROM pg_roles WHERE oid IN(SELECT id FROM reachable)`,[roles])).rows;
  if(inherited.some(v=>!roles.includes(v.rolname)))throw new Error("Unexpected runtime role membership");
  for(const role of roles){
    const elevated=(await c.query(`SELECT has_schema_privilege($1,'public','CREATE')
      OR has_database_privilege($1,current_database(),'CREATE,TEMPORARY')
      OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1))
      AS unsafe`,[role])).rows[0];
    if(elevated.unsafe)throw new Error("Unexpected runtime ownership or DDL privileges");
  }
  const tables=(await c.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')
    AND (c.relname='factories' OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='factory_id' AND NOT a.attisdropped))`)).rows;
  if(tenantTables.some(t=>!tables.some(r=>r.relname===t))||tables.some(r=>!r.relrowsecurity||!r.relforcerowsecurity||roles.includes(r.owner)))
    throw new Error("Unsafe tenant tables");
  for(const table of ["raw_rows","orders_history","production_records_history","events_history","account_audit","platform_audit","factory_settings_audit","analysis_snapshots","reconciliations","source_row_links","snapshot_audit"]){
    const triggers=(await c.query(`SELECT tgtype::int FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal AND tgenabled IN('O','A')`,[`public.${table}`])).rows;
    for(const bit of [8,16,32])if(!triggers.some(t=>(t.tgtype&bit)!==0))throw new Error("Immutable protection missing");
    for(const role of roles){
      const privileges=(await c.query("SELECT has_table_privilege($1,$2,'UPDATE,DELETE,TRUNCATE') AS unsafe",[role,`public.${table}`])).rows[0];
      if(privileges.unsafe)throw new Error("Immutable write privilege present");
    }
  }
}
/** Security-only provisioning of an already migrated schema, before any HTTP
 * listener. Never creates/migrates product tables; Replit Publish owns that. */
export async function configureDeployment(c:PoolClient,env:NodeJS.ProcessEnv,sqlDir=resolve("lib/db")){
  if(env.NODE_ENV!=="production"||env.SEED_TEST_USERS!=="false")throw new Error("Production setup guards required");
  const password=env.CLARIX_RUNTIME_PASSWORD;
  if(!password||password.length<32)throw new Error("Runtime secret missing or too short");
  await c.query("BEGIN");
  try{
    await c.query("SET LOCAL search_path=public; SET LOCAL lock_timeout='15s'");
    await c.query("SELECT pg_advisory_xact_lock(190011)");
    const nullable=(await c.query(`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='invitations' AND column_name='created_by'`)).rows[0];
    if(nullable?.is_nullable!=="YES")throw new Error("Publish schema changes before starting");
    for(const role of roles){
      if(!(await c.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount)
        await c.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    }
    await c.query("GRANT clarix_accounts,clarix_platform TO CURRENT_USER; GRANT USAGE ON SCHEMA public TO clarix_accounts,clarix_platform");
    for(const file of ["foundation-rls.sql","canonical-rls.sql","history-rls.sql","accounts-rls.sql","runtime-grants.sql","platform-rls.sql","snapshot-rls.sql"])
      await c.query(await readFile(resolve(sqlDir,file),"utf8"));
    // These SQL files deliberately restore policies/triggers, not table structure.
    for(const table of ["raw_rows","orders_history","production_records_history","events_history","account_audit"])
      await c.query(`REVOKE UPDATE,DELETE,TRUNCATE ON ${table} FROM PUBLIC,clarix_runtime,clarix_identity,clarix_accounts`);
    await c.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC',current_database()); END $$`);
    // Password never occurs in a SQL statement: only the SCRAM verifier does.
    const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,"sha256");
    const stored=createHash("sha256").update(createHmac("sha256",salted).update("Client Key").digest()).digest("base64");
    const server=createHmac("sha256",salted).update("Server Key").digest("base64");
    await c.query(`ALTER ROLE clarix_runtime LOGIN PASSWORD 'SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}'`);
    // Table owners without BYPASSRLS need a transaction-local owner policy.
    // No runtime role can use it, and it is removed before COMMIT.
    const owner=(await c.query("SELECT current_user AS name")).rows[0].name;
    if(roles.includes(owner))throw new Error("Privileged deployment connection required");
    for(const table of ["factories","invitations","account_audit","platform_invitations","platform_audit"])
      await c.query(`CREATE POLICY clarix_deploy_owner ON ${table} TO ${quote(owner)} USING(true) WITH CHECK(true)`);
    await deploymentInvitation(c,env);
    for(const table of ["factories","invitations","account_audit","platform_invitations","platform_audit"])
      await c.query(`DROP POLICY clarix_deploy_owner ON ${table}`);
    await verifyDeploymentSecurity(c);
    await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK");throw e;}
}
