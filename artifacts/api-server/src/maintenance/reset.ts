import type {PoolClient} from "pg";
export const importedTables=["events_history","production_records_history","orders_history","data_issues","events","production_records","orders","raw_rows","imports","column_mappings"];
export const protectedTables=["users","factories","memberships","sessions","invitations","account_audit","platform_audit","factory_settings_audit","platform_invitations","analysis_snapshots","reconciliations","source_row_links","snapshot_audit"];
export async function requireUnfilteredObserver(c:PoolClient) {
  const role=(await c.query("SELECT rolsuper OR rolbypassrls AS allowed FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(role?.allowed!==true) throw new Error("Isolation evidence requires a privileged BYPASSRLS setup observer; refusing filtered fingerprints");
  // This does not disable RLS. PostgreSQL raises an error instead of silently
  // filtering rows if this observer ever loses its bypass privilege.
  await c.query("SET row_security=off");
}
export async function roleFingerprint(c:PoolClient) {
  return (await c.query(`SELECT
    (SELECT md5(string_agg(row(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolconfig)::text,E'\\n' ORDER BY rolname)) FROM pg_roles) AS roles,
    (SELECT md5(coalesce(string_agg(row(roleid,member,grantor,admin_option)::text,E'\\n' ORDER BY roleid,member,grantor),'')) FROM pg_auth_members) AS grants`)).rows[0];
}
export function guardReset(args:string[],env:NodeJS.ProcessEnv=process.env) {
  if(env.NODE_ENV==="production"||env.REPLIT_DEPLOYMENT==="1") throw new Error("Reset is forbidden in production/deployments");
  if(env.SEED_TEST_USERS!=="true") throw new Error("Reset requires SEED_TEST_USERS=true");
  const clean=args.filter(x=>x!=="--");
  if(clean.length!==4||clean[0]!=="--factory"||clean[2]!=="--confirm"||!/^[a-z][a-z0-9-]{0,100}$/.test(clean[1])||clean[1]!==clean[3])
    throw new Error("Use --factory <exact-slug> --confirm <same-slug>");
  return clean[1];
}
export async function fingerprint(c:PoolClient,schema="public",factory?:string,omitArchive=false) {
  if(!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
  const result:Record<string,{count:number;hash:string}>={};
  for(const table of [...protectedTables,...importedTables]) {
    let where="";
    const parameters:string[]=[];
    // Users/sessions are global tables: never bind a factory to those queries.
    if(factory!==undefined && table!=="users" && table!=="sessions" && table!=="platform_invitations") {
      where=table==="factories"?" WHERE t.id=$1":" WHERE t.factory_id=$1";
      parameters.push(factory);
    }
    const row=table==="factories"&&omitArchive
      ? "to_jsonb(t)||jsonb_build_object('settings',t.settings-'sourceArchives'-'sourceArchiveEvents')":"to_jsonb(t)";
    result[table]=(await c.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(v,E'\\n' ORDER BY v),'')) AS hash FROM (SELECT (${row})::text AS v FROM "${schema}"."${table}" t${where}) s`,parameters)).rows[0];
  }
  return result;
}
export async function resetFactory(c:PoolClient,args:string[],env:NodeJS.ProcessEnv=process.env) {
  const factory=guardReset(args,env);
  await c.query("BEGIN");
  try {
    const identity=(await c.query("SELECT current_user AS u,current_schema() AS s")).rows[0];
    if(["clarix_runtime","clarix_identity"].includes(identity.u)) throw new Error("Privileged setup connection required");
    const owner=(await c.query("SELECT pg_get_userbyid(relowner)=current_user AS owns FROM pg_class WHERE oid='imports'::regclass")).rows[0];
    if(!owner?.owns) throw new Error("Privileged table-owner setup connection required");
    await c.query("SET LOCAL lock_timeout='10s'");
    await c.query("LOCK TABLE users,memberships,sessions IN SHARE MODE");
    // Exclusive locks and transaction-local DDL make bypass unobservable to other
    // connections. Rollback restores all guards, including on a failed delete.
    await c.query(`LOCK TABLE ${[...importedTables,"factories"].map(t=>`"${t}"`).join(",")} IN ACCESS EXCLUSIVE MODE`);
    for(const t of [...importedTables,"factories","memberships"]) await c.query(`ALTER TABLE "${t}" NO FORCE ROW LEVEL SECURITY`);
    if((await c.query("SELECT id FROM factories WHERE id=$1",[factory])).rowCount!==1) throw new Error("Unknown factory slug");
    const before=await fingerprint(c,identity.s);
    const rolesBefore=await roleFingerprint(c);
    const sourcesBefore=Number((await c.query("SELECT count(*) AS n FROM (SELECT source_name FROM imports WHERE factory_id=$1 UNION SELECT source_name FROM column_mappings WHERE factory_id=$1) s",[factory])).rows[0].n);
    const scopedBefore=await fingerprint(c,identity.s,factory);
    const otherBefore=(await c.query("SELECT id FROM factories WHERE id<>$1 ORDER BY id",[factory])).rows;
    const otherStates=await Promise.all(otherBefore.map(r=>fingerprint(c,identity.s,r.id)));
    const protectedBefore=await fingerprint(c,identity.s,undefined,true);
    for(const t of ["raw_rows",...importedTables.filter(t=>t.endsWith("_history"))])
      await c.query(`ALTER TABLE "${t}" DISABLE TRIGGER "${t==="raw_rows"?"raw_rows_immutable":"history_immutable"}"`);
    for(const t of importedTables) await c.query(`DELETE FROM "${t}" WHERE factory_id=$1`,[factory]);
    // The user explicitly approved this sole exception to preserving factories.
    await c.query("UPDATE factories SET settings=settings-'sourceArchives'-'sourceArchiveEvents' WHERE id=$1",[factory]);
    for(const t of ["raw_rows",...importedTables.filter(t=>t.endsWith("_history"))])
      await c.query(`ALTER TABLE "${t}" ENABLE TRIGGER "${t==="raw_rows"?"raw_rows_immutable":"history_immutable"}"`);
    const after=await fingerprint(c,identity.s),scopedAfter=await fingerprint(c,identity.s,factory);
    if(JSON.stringify(rolesBefore)!==JSON.stringify(await roleFingerprint(c))) throw new Error("Database roles changed");
    const protectedAfter=await fingerprint(c,identity.s,undefined,true);
    for(const t of protectedTables) if(JSON.stringify(protectedBefore[t])!==JSON.stringify(protectedAfter[t])) throw new Error(`Protected table changed: ${t}`);
    for(let i=0;i<otherBefore.length;i++)
      if(JSON.stringify(otherStates[i])!==JSON.stringify(await fingerprint(c,identity.s,otherBefore[i].id))) throw new Error("Another factory changed");
    for(const t of importedTables) if(scopedAfter[t].count) throw new Error(`Reset incomplete: ${t}`);
    for(const t of [...importedTables,"factories","memberships"]) await c.query(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`);
    await c.query("COMMIT");
    return {factory,before:scopedBefore,after:scopedAfter,sources:{before:sourcesBefore,after:0},rolesUnchanged:true,protectedUnchanged:true,otherFactoriesUnchanged:true,
      globalCounts:{before:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.count])),after:Object.fromEntries(Object.entries(after).map(([k,v])=>[k,v.count]))}};
  } catch(error){await c.query("ROLLBACK");throw error;}
}
