import type {Context,ImportRow} from "./service";
import {ImportError} from "./model";
export async function sourceState(ctx:Context) {
  return (await ctx.db.query("SELECT settings FROM factories WHERE id=$1",[ctx.factory])).rows[0]?.settings?.sourceArchives??{};
}
export async function assertActiveSource(ctx:Context,name:string) {
  if((await sourceState(ctx))[name]?.archived) throw new ImportError("SOURCE_ARCHIVED",409);
}
export async function sourceInfo(ctx:Context,row:ImportRow) {
  const other=(await ctx.db.query(`SELECT DISTINCT source_order_id AS "orderId",source_name AS "sourceName"
    FROM orders WHERE factory_id=$1 AND source_name<>$2 AND source_order_id=ANY($3::text[])
    ORDER BY source_order_id,source_name`,[ctx.factory,row.source_name,Object.keys(row.result?.runs??{})])).rows;
  return {sourceArchived:!!(await sourceState(ctx))[row.source_name]?.archived,otherSourceOrders:other};
}
export async function listSources(ctx:Context,page:number,search:string) {
  const archive=await sourceState(ctx);
  const rows=(await ctx.db.query(`WITH names AS(
    SELECT source_name FROM imports WHERE factory_id=$1 UNION
    SELECT source_name FROM column_mappings WHERE factory_id=$1)
    SELECT n.source_name AS name,
    (SELECT count(*)::int FROM orders o WHERE o.factory_id=$1 AND o.source_name=n.source_name AND o.current_import_id IS NOT NULL) AS "storedOrderCount",
    (SELECT max(approved_at) FROM imports i WHERE i.factory_id=$1 AND i.source_name=n.source_name AND status='approved') AS "lastApprovedAt"
    FROM names n WHERE strpos(lower(n.source_name),lower($2))>0 ORDER BY "lastApprovedAt" DESC NULLS LAST,name`,[ctx.factory,search])).rows;
  return {items:rows.slice((page-1)*20,page*20).map(r=>({...r,archived:!!archive[r.name]?.archived,orderCount:archive[r.name]?.archived?0:r.storedOrderCount})),total:rows.length,page};
}
export async function archiveSource(ctx:Context,name:string,archived:boolean) {
  const role=(await ctx.db.query("SELECT role FROM memberships WHERE factory_id=$1 AND user_id=$2",[ctx.factory,ctx.user])).rows[0]?.role;
  if(role!=="factory_manager") throw new ImportError("FORBIDDEN",403);
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[ctx.factory]);
  if(!(await ctx.db.query("SELECT 1 FROM imports WHERE factory_id=$1 AND source_name=$2 UNION SELECT 1 FROM column_mappings WHERE factory_id=$1 AND source_name=$2 LIMIT 1",[ctx.factory,name])).rowCount) throw new ImportError("NOT_FOUND",404);
  const entry={archived,by:ctx.user,at:new Date().toISOString()};
  await ctx.db.query(`UPDATE factories SET settings=jsonb_set(
    jsonb_set(settings,'{sourceArchives}',coalesce(settings->'sourceArchives','{}'::jsonb)||jsonb_build_object($2::text,$3::jsonb)),
    '{sourceArchiveEvents}',coalesce(settings->'sourceArchiveEvents','[]'::jsonb)||$4::jsonb) WHERE id=$1`,
    [ctx.factory,name,JSON.stringify(entry),JSON.stringify([{sourceName:name,...entry}])]);
  return {sourceName:name,...entry};
}
export async function recommendSource(ctx:Context,files:{name:string;headers:string[]}[]) {
  const archived=await sourceState(ctx);
  const mappings=(await ctx.db.query(`SELECT i.source_name,i.mapping FROM imports i
    WHERE i.factory_id=$1 AND i.status='approved' ORDER BY i.approved_at DESC`,[ctx.factory])).rows;
  // An approved mapping is already a validated template, even if not named/saved.
  const match=mappings.find(r=>!archived[r.source_name]?.archived && Object.values(r.mapping?.files??{}).every((spec:any)=>
    files.some(f=>f.name===spec.file && Object.values(spec.columns).filter(Boolean).every(c=>f.headers.includes(String(c))))));
  return {sourceName:match?.source_name??null};
}
const activeSql=`NOT coalesce((f.settings->'sourceArchives'->o.source_name->>'archived')::boolean,false)`;
export async function sourceRuns(ctx:Context,page:number,search:string) {
  const base=`FROM orders o JOIN factories f ON f.id=o.factory_id WHERE o.factory_id=$1 AND o.current_import_id IS NOT NULL AND ${activeSql}
    AND (strpos(lower(o.source_order_id),lower($2))>0 OR strpos(lower(o.source_name),lower($2))>0)`;
  const rows=(await ctx.db.query(`SELECT o.id,o.source_order_id AS "orderId",o.source_name AS "sourceName",
    EXISTS(SELECT 1 FROM orders x WHERE x.factory_id=o.factory_id AND x.source_order_id=o.source_order_id AND x.source_name<>o.source_name
    AND x.current_import_id IS NOT NULL AND NOT coalesce((f.settings->'sourceArchives'->x.source_name->>'archived')::boolean,false)) AS ambiguous
    ${base} ORDER BY o.source_order_id,o.source_name LIMIT 20 OFFSET $3`,[ctx.factory,search,(page-1)*20])).rows;
  const total=(await ctx.db.query(`SELECT count(*)::int AS n ${base}`,[ctx.factory,search])).rows[0].n;
  return {items:rows,total,page};
}
export async function sourcePair(ctx:Context,left:string,right:string) {
  if(left===right) throw new ImportError("INVALID_PAIR",400);
  const rows=(await ctx.db.query(`SELECT o.id,o.source_order_id AS "orderId",o.source_name AS "sourceName"
    FROM orders o JOIN factories f ON f.id=o.factory_id WHERE o.factory_id=$1 AND o.id=ANY($2::uuid[])
    AND o.current_import_id IS NOT NULL AND ${activeSql}`,[ctx.factory,[left,right]])).rows;
  if(rows.length!==2) throw new ImportError("NOT_FOUND",404);
  return {left:rows.find(r=>r.id===left),right:rows.find(r=>r.id===right)};
}
