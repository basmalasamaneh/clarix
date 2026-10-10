import type {Context} from "./service";
import {qualityPage} from "./quality";
import {getRuns} from "../metrics/service";

/** Aggregate navigation summary only: never invent or recalculate production metrics. */
export async function overview(ctx:Context) {
  const quality=await qualityPage(ctx,{page:1,includeArchived:false});
  const active=`i.factory_id=$1 AND NOT coalesce((f.settings->'sourceArchives'->i.source_name->>'archived')::boolean,false)`;
  const from=`FROM imports i JOIN factories f ON f.id=i.factory_id`;
  const approvedImports=(await ctx.db.query(`SELECT count(*)::int AS count ${from}
    WHERE ${active} AND i.status='approved'`,[ctx.factory])).rows[0].count;
  const latestImports=(await ctx.db.query(`SELECT i.id,i.source_name AS "sourceName",
    i.created_at AS date,i.status ${from} WHERE ${active}
    ORDER BY i.created_at DESC,i.id LIMIT 5`,[ctx.factory])).rows.map(r=>({...r,date:r.date?.toISOString()??null}));
  // Same comparability designation as Data Quality (non-red overall).
  // Use the same earliest included production date shown on Runs, never upload time.
  // Undated runs remain accessible on Runs but cannot be called "most recently produced".
  const candidates=(await ctx.db.query(`SELECT o.id,min(p.date) AS date
    FROM orders o JOIN imports i ON i.id=o.current_import_id AND i.factory_id=o.factory_id
    JOIN factories f ON f.id=o.factory_id
    JOIN production_records p ON p.order_id=o.id AND p.factory_id=o.factory_id
    WHERE ${active} AND i.status='approved' AND o.factory_id=$1
      AND o.metrics->>'overall' IN ('green','yellow')
    GROUP BY o.id HAVING min(p.date) IS NOT NULL ORDER BY date DESC,o.id LIMIT 2`,[ctx.factory])).rows;
  return {approvedImports,currentOrders:quality.summary.orders.green+quality.summary.orders.yellow+quality.summary.orders.red,
    statuses:quality.summary.orders,errors:quality.summary.errors,warnings:quality.summary.warnings,
    latestImports,comparisonRuns:await getRuns(ctx,candidates.map(r=>r.id))};
}
