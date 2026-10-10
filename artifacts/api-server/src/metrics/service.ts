import type {Context} from "../imports/service";
import type {Mapping,Run} from "@workspace/calculation";
import type {ProductionRun} from "@workspace/api-zod";
import {ImportError} from "../imports/model";
import {runMetrics,references,differences,groups} from "./values";
import {summary,questions} from "./i18n";
import {worstStatus} from "../imports/quality";

const from=`FROM orders o JOIN imports i ON i.factory_id=o.factory_id AND i.id=o.current_import_id
 JOIN factories f ON f.id=o.factory_id`;
const active=`o.factory_id=$1 AND i.status='approved'
 AND NOT coalesce((f.settings->'sourceArchives'->o.source_name->>'archived')::boolean,false)`;
const columns=`o.id,o.source_order_id AS "orderId",o.source_name AS "sourceName",
 o.current_import_id AS "importId",o.metrics,i.mapping`;
type Stored={id:string;orderId:string;sourceName:string;importId:string;metrics:Run;mapping:Mapping};
async function views(ctx:Context,rows:Stored[]):Promise<ProductionRun[]> {
  if(!rows.length) return [];
  const ids=rows.map(r=>r.id);
  const issues=(await ctx.db.query(`SELECT d.id,d.import_id AS "importId",d.order_id AS "runId",d.code,d.severity,d."group",
    d.source_order_id AS "orderId",i.source_name AS "sourceName"
    FROM data_issues d JOIN imports i ON i.factory_id=d.factory_id AND i.id=d.import_id
    WHERE d.factory_id=$1 AND (d.order_id=ANY($2::uuid[]) OR (d.source_order_id IS NULL AND d.import_id=ANY($3::uuid[])))
    ORDER BY CASE d.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,d.code,d.id`,
    [ctx.factory,ids,rows.map(r=>r.importId)])).rows;
  // Dates come from the earliest INCLUDED production record, not upload time.
  const dates=(await ctx.db.query(`SELECT p.order_id AS id,min(p.date)::text AS date FROM production_records p
    WHERE p.factory_id=$1 AND p.order_id=ANY($2::uuid[]) GROUP BY p.order_id`,[ctx.factory,ids])).rows;
  return rows.map(row=>{
    const run=row.metrics;
    if(!run?.volume || !run.changeover || !run.downtime) throw new ImportError("METRICS_UNAVAILABLE",500);
    return {id:row.id,orderId:row.orderId,sourceName:row.sourceName,importId:row.importId,
      date:dates.find(d=>d.id===row.id)?.date??null,
      dateRefs:references(row.id,row.importId,row.mapping,run.volume.source_lines,["record_date"],"included",row),
      capabilityLevel:row.mapping.capability_level,overall:run.overall,
      groups:Object.fromEntries(groups.map(g=>[g,run[g].status])),
      metrics:runMetrics(row.id,row.importId,run,row.mapping,row),
      issues:issues.filter(i=>i.importId===row.importId&&(i.runId===row.id||i.orderId===null)),
    };
  });
}
export type RunFilters={page:number;search:string;source?:string;status?:string;sort:"order"|"status"};
export async function listRuns(ctx:Context,f:RunFilters) {
  const where=`${active} AND strpos(lower(o.source_order_id),lower($2))>0
    AND ($3::text IS NULL OR o.source_name=$3) AND ($4::text IS NULL OR o.metrics->>'overall'=$4)`;
  const params=[ctx.factory,f.search,f.source??null,f.status??null];
  const order=f.sort==="status"?`CASE o.metrics->>'overall' WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END,`:"";
  const rows=(await ctx.db.query(`SELECT ${columns} ${from} WHERE ${where}
    ORDER BY ${order} o.source_order_id,o.source_name,o.id LIMIT 20 OFFSET $5`,[...params,(f.page-1)*20])).rows;
  const total=(await ctx.db.query(`SELECT count(*)::int AS n ${from} WHERE ${where}`,params)).rows[0].n;
  return {items:await views(ctx,rows),page:f.page,total};
}
export async function getRuns(ctx:Context,ids:string[]) {
  const rows=(await ctx.db.query(`SELECT ${columns} ${from} WHERE ${active} AND o.id=ANY($2::uuid[])`,[ctx.factory,ids])).rows;
  if(rows.length!==ids.length) throw new ImportError("NOT_FOUND",404);
  const result=await views(ctx,rows);
  return ids.map(id=>result.find(r=>r.id===id)!);
}
export async function compare(ctx:Context,left:string,right:string) {
  if(left===right) throw new ImportError("INVALID_PAIR",400);
  const [a,b]=await getRuns(ctx,[left,right]);
  const diff=differences(a,b);
  const statuses=Object.fromEntries(groups.map(g=>[g,worstStatus([a.groups[g],b.groups[g]])]));
  // The user chose per-group refusal, not whole-comparison refusal. Preserve
  // good groups and golden engine behavior even when the overall badge is red.
  return {a,b,differences:diff,groups:statuses,overall:worstStatus([a.overall,b.overall]),
    hasWarnings:[...a.issues,...b.issues].some(i=>i.severity==="warning"),
    hasBlockedGroups:Object.values(statuses).includes("red"),summary:summary(a,b,diff),questions:questions(a,b,diff)};
}
