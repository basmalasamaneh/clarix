import {randomUUID} from "node:crypto";
import type {SnapshotReport} from "@workspace/api-zod";
import type {Context} from "../imports/service";
import {ImportError} from "../imports/model";

const MAX_BYTES=2_000_000;
export function reportFilename(factory:string,id:string,language:"en"|"ar") {
  const slug=factory.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"factory";
  return `clarix-${slug}-${id}-${language}.pdf`;
}

/** Only persisted snapshot/reconciliation data. Never calls live comparison or the engine. */
export async function prepareReport(ctx:Context,id:string,language:"en"|"ar"):Promise<SnapshotReport> {
  try { return await prepareBoundedReport(ctx,id,language); }
  catch(e) {
    if(e && typeof e==="object" && "code" in e && e.code==="57014")throw new ImportError("REPORT_TIMEOUT",503);
    throw e;
  }
}
async function prepareBoundedReport(ctx:Context,id:string,language:"en"|"ar"):Promise<SnapshotReport> {
  const deadline=Date.now()+5000;
  const query=async(text:string,values?:unknown[])=>{
    const remaining=deadline-Date.now();
    if(remaining<=0)throw new ImportError("REPORT_TIMEOUT",503);
    await ctx.db.query(`SET LOCAL statement_timeout='${remaining}ms'`);
    return ctx.db.query(text,values);
  };
  const meta=(await query(`SELECT octet_length(payload::text)+octet_length(provenance::text) AS bytes
    FROM analysis_snapshots WHERE factory_id=$1 AND id=$2`,[ctx.factory,id])).rows[0];
  if(!meta)throw new ImportError("NOT_FOUND",404);
  const size=(await query(`SELECT count(*)::int n,coalesce(sum(octet_length(payload::text)),0)::text bytes
    FROM reconciliations WHERE factory_id=$1 AND snapshot_id=$2`,[ctx.factory,id])).rows[0];
  if(size.n>100 || Number(meta.bytes)+Number(size.bytes)>MAX_BYTES)throw new ImportError("REPORT_TOO_LARGE",413);
  // A transaction-scoped advisory lock makes the audit-based limit work across
  // production instances. It is deliberately not a process-local limiter.
  if(!(await query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked",
    [`report:${ctx.factory}:${ctx.user}`])).rows[0].locked)throw new ImportError("REPORT_BUSY",429);
  const recent=(await query(`SELECT count(*)::int n FROM snapshot_audit
    WHERE factory_id=$1 AND actor_id=$2 AND action IN ('report_prepared_en','report_prepared_ar')
    AND created_at>now()-interval '10 minutes'`,[ctx.factory,ctx.user])).rows[0].n;
  if(recent>=10)throw new ImportError("REPORT_RATE_LIMIT",429);
  const row=(await query("SELECT * FROM analysis_snapshots WHERE factory_id=$1 AND id=$2",[ctx.factory,id])).rows[0];
  const factory=(await query("SELECT name FROM factories WHERE id=$1",[ctx.factory])).rows[0];
  const recs=(await query(`SELECT id,author,created_at,payload FROM reconciliations
    WHERE factory_id=$1 AND snapshot_id=$2 ORDER BY created_at,id LIMIT 101`,[ctx.factory,id])).rows;
  if(recs.length>100)throw new ImportError("REPORT_TOO_LARGE",413);
  const frozenIssues=[...row.payload.a.issues,...row.payload.b.issues] as SnapshotReport["comparison"]["a"]["issues"];
  // Historical issue identities come only from the frozen payload. Read only
  // immutable original file/line metadata, never raw cell contents/current runs.
  const refs=(await query(`SELECT d.id,r.file,r.line_number AS line FROM data_issues d
    JOIN raw_rows r ON r.factory_id=d.factory_id AND r.import_id=d.import_id AND r.id=ANY(d.raw_row_ids)
    WHERE d.factory_id=$1 AND d.id=ANY($2::uuid[]) ORDER BY d.id,r.file,r.line_number LIMIT 5001`,
    [ctx.factory,frozenIssues.map(i=>i.id)])).rows;
  if(refs.length>5000)throw new ImportError("REPORT_TOO_LARGE",413);
  const report:SnapshotReport={
    filename:reportFilename(factory.name,id,language),language,exportedAt:new Date().toISOString(),factoryName:factory.name,
    snapshot:{id,title:row.title,note:row.note,author:row.author,createdAt:row.created_at.toISOString(),overall:row.payload.overall,
      runs:[row.payload.a,row.payload.b].map(r=>`${r.orderId} [${r.sourceName}]`),changed:false},
    comparison:row.payload,definitionsVersion:row.definitions_version,
    provenance:row.provenance.map((p:{id:string;files:{name:string;sha256:string}[]})=>({importId:p.id,files:p.files})),
    reconciliations:recs.map(r=>({id:r.id,author:r.author,createdAt:r.created_at.toISOString(),result:r.payload})),
    issues:frozenIssues.filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).map(i=>({
      code:i.code,group:i.group,severity:i.severity,orderId:i.orderId,sourceName:i.sourceName,
      refs:refs.filter(r=>r.id===i.id).map(r=>({file:r.file,line:r.line})),
    })),
  };
  // Check actual uncompressed wire size too; never silently truncate any section.
  if(Buffer.byteLength(JSON.stringify(report))>MAX_BYTES)throw new ImportError("REPORT_TOO_LARGE",413);
  await query(`INSERT INTO snapshot_audit(id,factory_id,snapshot_id,actor_id,action)
    VALUES($1,$2,$3,$4,$5)`,[randomUUID(),ctx.factory,id,ctx.user,`report_prepared_${language}`]);
  // This audit means preparation, not that the browser saved a PDF successfully.
  return report;
}
