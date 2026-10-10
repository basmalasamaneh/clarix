import {randomUUID} from "node:crypto";
import type {Run,Mapping} from "@workspace/calculation";
import type {RunComparison,SnapshotInput,SnapshotDetail,SnapshotSummary,SnapshotChange,ReportFigures} from "@workspace/api-zod";
import type {Context} from "../imports/service";
import {ImportError} from "../imports/model";
import {compare,getRuns} from "../metrics/service";
import {reconcile} from "./reconciliation";
import {importJobs} from "../imports/jobs";

type Stored={id:string;title:string;note:string;author:string;created_at:Date;payload:RunComparison;definitions_version:string};
export async function loadSnapshot(ctx:Context,id:string):Promise<Stored> {
  const row=(await ctx.db.query("SELECT * FROM analysis_snapshots WHERE factory_id=$1 AND id=$2",[ctx.factory,id])).rows[0];
  if(!row)throw new ImportError("NOT_FOUND",404);
  return row;
}
async function changes(ctx:Context,comparison:RunComparison):Promise<SnapshotChange[]> {
  const result:SnapshotChange[]=[];
  for(const side of ["a","b"] as const) {
    const before=comparison[side];
    let current;
    try {current=(await getRuns(ctx,[before.id]))[0];}
    catch(e) {if(!(e instanceof ImportError&&e.status===404))throw e;}
    if(!current) {result.push({side,kind:"unavailable",key:"run",before:before.orderId,after:null});continue;}
    if(current.importId!==before.importId)result.push({side,kind:"import",key:"import",before:before.importId,after:current.importId});
    for(const key of ["overall","volume","changeover","downtime"]) {
      const old=key==="overall"?before.overall:before.groups[key],now=key==="overall"?current.overall:current.groups[key];
      if(old!==now)result.push({side,kind:"status",key,before:old,after:now});
    }
    for(const old of before.metrics) {
      const now=current.metrics.find(m=>m.key===old.key)?.value??null;
      if(old.value!==now)result.push({side,kind:"metric",key:old.key,before:old.value,after:now});
    }
  }
  return result;
}
function summary(row:Stored,changed:boolean):SnapshotSummary {
  return {id:row.id,title:row.title,note:row.note,author:row.author,createdAt:row.created_at.toISOString(),
    overall:row.payload.overall,runs:[row.payload.a,row.payload.b].map(r=>`${r.orderId} [${r.sourceName}]`),changed};
}
export async function snapshotDetail(ctx:Context,id:string):Promise<SnapshotDetail> {
  const row=await loadSnapshot(ctx,id),diff=await changes(ctx,row.payload);
  return {snapshot:summary(row,diff.length>0),comparison:row.payload,definitionsVersion:row.definitions_version,changes:diff};
}
export async function listSnapshots(ctx:Context,page:number,search:string) {
  const where="factory_id=$1 AND (strpos(lower(title),lower($2))>0 OR strpos(lower(order_search),lower($2))>0)";
  const rows=(await ctx.db.query(`SELECT * FROM analysis_snapshots WHERE ${where} ORDER BY created_at DESC,id LIMIT 20 OFFSET $3`,[ctx.factory,search,(page-1)*20])).rows as Stored[];
  const total=(await ctx.db.query(`SELECT count(*)::int AS n FROM analysis_snapshots WHERE ${where}`,[ctx.factory,search])).rows[0].n;
  const items=[];
  for(const row of rows)items.push(summary(row,(await changes(ctx,row.payload)).length>0));
  return {items,page,total};
}
async function audit(ctx:Context,id:string,action:string) {
  await ctx.db.query("INSERT INTO snapshot_audit(id,factory_id,snapshot_id,actor_id,action) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(),ctx.factory,id,ctx.user,action]);
}
export async function addReconciliation(ctx:Context,id:string,figures:ReportFigures) {
  const row=await loadSnapshot(ctx,id),result=reconcile(row.payload,figures);
  const recordId=randomUUID(),author=ctx.userName??ctx.user;
  const saved=(await ctx.db.query(`INSERT INTO reconciliations(id,factory_id,snapshot_id,created_by,author,payload)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING created_at`,[recordId,ctx.factory,id,ctx.user,author,JSON.stringify(result)])).rows[0];
  await audit(ctx,id,"reconciliation_added");
  return {id:recordId,author,createdAt:saved.created_at.toISOString(),result};
}
export async function listReconciliations(ctx:Context,id:string,page:number) {
  await loadSnapshot(ctx,id);
  const rows=(await ctx.db.query(`SELECT id,author,created_at,payload FROM reconciliations WHERE factory_id=$1 AND snapshot_id=$2
    ORDER BY created_at DESC,id LIMIT 20 OFFSET $3`,[ctx.factory,id,(page-1)*20])).rows;
  const total=(await ctx.db.query("SELECT count(*)::int AS n FROM reconciliations WHERE factory_id=$1 AND snapshot_id=$2",[ctx.factory,id])).rows[0].n;
  return {items:rows.map(r=>({id:r.id,author:r.author,createdAt:r.created_at.toISOString(),result:r.payload})),total,page};
}
export async function saveSnapshot(ctx:Context,input:SnapshotInput) {
  const title=input.title.trim();
  if(!title)throw new ImportError("INVALID_INPUT",400);
  // Same factory lock as approval: snapshot pair, source links and optional
  // reconciliation commit atomically against one coherent approved version.
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[ctx.factory]);
  const id=randomUUID();
  return importJobs.run(id,async progress=>{
    const comparison=await compare(ctx,input.a,input.b);
    if ((input.expectedImportA && input.expectedImportA !== comparison.a.importId)
      || (input.expectedImportB && input.expectedImportB !== comparison.b.importId)) {
      throw new ImportError("SNAPSHOT_SOURCE_CHANGED",409);
    }
    if(input.figures)reconcile(comparison,input.figures); // validate before inserts
    const imports=(await ctx.db.query(`SELECT i.id,i.content_hash,i.files,i.mapping,i.mapping_id,i.result,m.version
      FROM imports i LEFT JOIN column_mappings m ON m.factory_id=i.factory_id AND m.id=i.mapping_id
      WHERE i.factory_id=$1 AND i.id=ANY($2::uuid[])`,
      [ctx.factory,[comparison.a.importId,comparison.b.importId]])).rows;
    const provenance=imports.map(i=>({id:i.id,contentHash:i.content_hash,
      files:i.files.map((f:{name:string;sha256:string})=>({name:f.name,sha256:f.sha256})),
      mappingId:i.mapping_id,mappingVersion:i.version??null,mapping:i.mapping}));
    await ctx.db.query(`INSERT INTO analysis_snapshots(id,factory_id,created_by,author,title,note,order_search,payload,provenance,definitions_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'clarix-locked-v1')`,
      [id,ctx.factory,ctx.user,ctx.userName??ctx.user,title,input.note.trim(),
        `${comparison.a.orderId}\n${comparison.b.orderId}`,JSON.stringify(comparison),JSON.stringify(provenance)]);
    progress(25);
    // Complete original references, not the bounded 20-row previews in the
    // comparison API. One link per raw row; preserve mapped column names.
    for(const imp of imports) {
      const mapping=imp.mapping as Mapping;
      const refs=new Map<string,unknown[]>();
      for(const run of [comparison.a,comparison.b].filter(r=>r.importId===imp.id)) {
        const result=imp.result.runs[run.orderId] as Run;
        for(const group of ["volume","changeover","downtime"] as const) {
          for(const [kind,lines] of [["included",result[group].source_lines],["excluded",result[group].excluded_source_lines],["quarantined",result[group].quarantined_source_lines]] as const) {
            for(const line of lines) {
              const match=/^(.*):(\d+)$/.exec(line)!;
              const spec=Object.values(mapping.files).find(s=>s?.file===match[1]);
              const entries=refs.get(line)??[];
              entries.push({runId:run.id,group,kind,file:match[1],line:Number(match[2]),columns:spec?.columns??{}});
              refs.set(line,entries);
            }
          }
        }
      }
      const entries=[...refs].map(([line,refs])=>({line,refs}));
      for(let start=0;start<entries.length;start+=1000) {
        await ctx.db.query(`INSERT INTO source_row_links(id,factory_id,snapshot_id,import_id,raw_row_id,refs)
          SELECT gen_random_uuid(),r.factory_id,$2,r.import_id,r.id,x.refs
          FROM jsonb_to_recordset($4::jsonb) x(line text,refs jsonb)
          JOIN raw_rows r ON r.factory_id=$1 AND r.import_id=$3 AND r.file||':'||r.line_number::text=x.line`,
          [ctx.factory,id,imp.id,JSON.stringify(entries.slice(start,start+1000))]);
      }
    }
    progress(90);
    await audit(ctx,id,"snapshot_saved");
    if(input.figures)await addReconciliation(ctx,id,input.figures);
    progress(100);
    return snapshotDetail(ctx,id);
  });
}
