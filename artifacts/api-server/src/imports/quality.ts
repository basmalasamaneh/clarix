import type {Context} from "./service";
import {ImportError} from "./model";
export type QualityStatus="green"|"yellow"|"red";
export function severityStatus(severity:string):QualityStatus {
  return severity==="error"?"red":severity==="warning"?"yellow":"green";
}
export function worstStatus(parts:QualityStatus[]):QualityStatus {
  return parts.includes("red")?"red":parts.includes("yellow")?"yellow":"green";
}
export type QualityFilters={page:number;severity?:string;group?:string;order?:string;source?:string;includeArchived:boolean};
function selection(ctx:Context,f:QualityFilters) {
  const values=[ctx.factory,f.includeArchived,f.severity??null,f.group??null,f.order??null,f.source??null];
  const sql=`d.factory_id=$1 AND i.factory_id=$1 AND i.status='approved'
    AND ($2::boolean OR coalesce((f.settings->'sourceArchives'->i.source_name->>'archived')::boolean,false)=false)
    AND ($3::text IS NULL OR d.severity=$3)
    AND ($4::text IS NULL OR $4=ANY(string_to_array(d."group",',')))
    AND ($5::text IS NULL OR d.source_order_id=$5)
    AND ($6::text IS NULL OR i.source_name=$6)`;
  return {values,sql};
}
const joins="FROM data_issues d JOIN imports i ON i.id=d.import_id AND i.factory_id=d.factory_id JOIN factories f ON f.id=d.factory_id";
function item(r:any) {
  const run=r.run??null;
  return {...r,approvedAt:r.approvedAt?.toISOString?.()??r.approvedAt,run:undefined,raw_row_ids:undefined,
    groupStatuses:run?{volume:run.volume.status,changeover:run.changeover.status,downtime:run.downtime.status}:null,
    overallStatus:run?worstStatus([run.volume.status,run.changeover.status,run.downtime.status]):null,
    severityStatus:severityStatus(r.severity),
    blockedReasons:run?.issues?.filter((s:string)=>s.endsWith(":error")).map((s:string)=>s.split(":")[0])??[],
    comparable:run?worstStatus([run.volume.status,run.changeover.status,run.downtime.status])!=="red":null};
}
const columns=`d.id,d.import_id AS "importId",d.code,d.severity,d.source_order_id AS "orderId",d."group",
 i.source_name AS "sourceName",i.approved_at AS "approvedAt",cardinality(d.raw_row_ids) AS "referenceCount",
 coalesce((f.settings->'sourceArchives'->i.source_name->>'archived')::boolean,false) AS archived,
 i.result->'runs'->d.source_order_id AS run,
 CASE WHEN d.source_order_id IS NULL THEN false ELSE NOT EXISTS(SELECT 1 FROM orders o WHERE o.factory_id=d.factory_id AND o.source_name=i.source_name AND o.source_order_id=d.source_order_id AND o.current_import_id=i.id) END AS superseded,
 coalesce((SELECT jsonb_agg(jsonb_build_object('file',r.file,'line',r.line_number) ORDER BY r.file,r.line_number)
 FROM (SELECT file,line_number FROM raw_rows WHERE factory_id=d.factory_id AND import_id=d.import_id AND id=ANY(d.raw_row_ids)
 ORDER BY file,line_number LIMIT 20) r),'[]') AS refs`;
export async function qualityPage(ctx:Context,filters:QualityFilters) {
  const {values,sql}=selection(ctx,filters);
  const items=(await ctx.db.query(`SELECT ${columns} ${joins} WHERE ${sql}
    ORDER BY CASE d.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,i.approved_at DESC,d.id LIMIT 20 OFFSET $7`,[...values,(filters.page-1)*20])).rows.map(item);
  const summary=(await ctx.db.query(`SELECT count(*)::int AS total,
    count(*) FILTER(WHERE d.severity='error')::int AS errors,
    count(*) FILTER(WHERE d.severity='warning')::int AS warnings,
    count(*) FILTER(WHERE d.severity='info')::int AS notes ${joins} WHERE ${sql}`,values)).rows[0];
  // Current order counts are separate from the complete historical issue list.
  // Locked engine output remains authoritative; the browser never recomputes.
  const orders=(await ctx.db.query(`SELECT i.result->'runs'->o.source_order_id->>'overall' AS status,count(*)::int AS count
    FROM orders o JOIN imports i ON i.id=o.current_import_id AND i.factory_id=o.factory_id JOIN factories f ON f.id=o.factory_id
    WHERE o.factory_id=$1 AND i.status='approved'
    AND ($2::boolean OR coalesce((f.settings->'sourceArchives'->o.source_name->>'archived')::boolean,false)=false)
    AND ($3::text IS NULL OR o.source_order_id=$3) AND ($4::text IS NULL OR o.source_name=$4)
    GROUP BY 1`,[ctx.factory,filters.includeArchived,filters.order??null,filters.source??null])).rows;
  if(orders.some(o=>!["green","yellow","red"].includes(o.status))) throw new ImportError("QUALITY_RESULT_UNAVAILABLE",500);
  return {items,page:filters.page,total:summary.total,summary:{...summary,orders:{green:0,yellow:0,red:0,...Object.fromEntries(orders.map(o=>[o.status,o.count]))}}};
}
export async function qualityDetail(ctx:Context,id:string) {
  const r=(await ctx.db.query(`SELECT ${columns},d.raw_row_ids,i.mapping ${joins}
    WHERE d.factory_id=$1 AND d.id=$2 AND i.status='approved'`,[ctx.factory,id])).rows[0];
  if(!r) throw new ImportError("NOT_FOUND",404);
  const rows=(await ctx.db.query(`SELECT file,line_number AS line,cells FROM raw_rows
    WHERE factory_id=$1 AND import_id=$2 AND id=ANY($3::uuid[]) ORDER BY file,line_number LIMIT 20`,[ctx.factory,r.importId,r.raw_row_ids])).rows;
  return {...item(r),mapping:undefined,rows:rows.map(row=>({...row,
    references:Object.keys(row.cells).map(column=>`${row.file}:${row.line}:${column}`)}))};
}
