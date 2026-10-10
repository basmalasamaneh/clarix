import { randomUUID,createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { calculate,csvAdapter,contentHash,parseCsv,decodeBytes,D,fmt,type Mapping,type SourceFile,type EngineResult,type CanonicalDataset } from "@workspace/calculation";
import { fileStorage } from "./storage";
import { importJobs } from "./jobs";
import {duplicateState,replacementOrders,eventCodes,recordDecisions,assertChoices,type ReviewMapping} from "./review";
import { ImportError,inspect,limitConfig,suggestMapping,validateMapping,type StoredFile } from "./model";
import {sourceInfo,assertActiveSource} from "./sources";
import {preview} from "./review-pages";
import {importCpu} from "./cpu-client";
export interface Context { db:PoolClient; factory:string; user:string; userName?:string; settings:Record<string,unknown> }
export interface ImportRow {
  id:string;source_name:string;status:string;created_at:string;files:StoredFile[];
  content_hash:string;mapping:ReviewMapping|null;result:EngineResult|null;counts:Record<string,number>|null;
  decision_audit:{code:string;choice:string|null;chosenBy:string;chosenAt:string}[];
  replaced_orders:string[];
  finalized:boolean;progress:number;
}
export async function getRow(ctx:Context,id:string,lock=false):Promise<ImportRow> {
  const {rows}=await ctx.db.query("SELECT * FROM imports WHERE factory_id=$1 AND id=$2"+(lock?" FOR UPDATE":""),[ctx.factory,id]);
  if(!rows[0]) throw new ImportError("NOT_FOUND",404);
  return rows[0];
}
export function editable(row:ImportRow) {
  if(!["draft","checked"].includes(row.status)) throw new ImportError("IMPORT_FINAL",409);
}
export async function replacementCount(ctx:Context,row:ImportRow) {
  const ids=Object.keys(row.result?.runs??{});
  const r=await ctx.db.query("SELECT count(*)::int AS n FROM orders WHERE factory_id=$1 AND source_name=$2 AND source_order_id=ANY($3::text[]) AND current_import_id IS NOT NULL",[ctx.factory,row.source_name,ids]);
  return r.rows[0].n as number;
}
export async function duplicate(ctx:Context,row:ImportRow) {
  return (await duplicateState(ctx,row)).duplicateOf;
}
export async function view(ctx:Context,row:ImportRow,uploads=false) {
  const files=await Promise.all(row.files.map(async({stage,original,...f})=>({...f,...(uploads && !row.finalized ? {uploadUrl:await fileStorage.uploadUrl(stage)}:{})})));
  const source=await sourceInfo(ctx,row);
  const replacing=row.status==="approved"?[]:await replacementOrders(ctx,row);
  const replaced=row.replaced_orders??[];
  const duplicateInfo=row.status==="approved"||row.status==="rejected"?{duplicateOf:null,duplicateReason:null,settingsDifferences:[],comparisonSource:null}:await duplicateState(ctx,row);
  return {id:row.id,sourceName:row.source_name,status:row.status,createdAt:row.created_at,files,
    ...source,otherSourceOrders:preview(source.otherSourceOrders),
    reviewCounts:{replacementOrders:replacing.length,replacedOrders:replaced.length,otherSourceOrders:source.otherSourceOrders.length,settingsDifferences:duplicateInfo.settingsDifferences.length,resultRuns:Object.keys(row.result?.runs??{}).length},
    finalized:row.finalized,progress:importJobs.progress(row.id)??row.progress,
    replacementCount:row.status==="approved"?(row.replaced_orders??[]).length:await replacementCount(ctx,row),
    replacementOrders:preview(replacing),replacedOrders:preview(replaced),
    ...duplicateInfo,settingsDifferences:preview(duplicateInfo.settingsDifferences),
    ...(row.mapping?{mapping:row.mapping}:{}),...(row.result?{result:preview(row.result)}:{}),
    ...(row.counts?{counts:row.counts}:{}),
  };
}
export async function create(ctx:Context,input:{sourceName:string;files:{name:string;size:number;mime:string}[]}) {
  await assertActiveSource(ctx,input.sourceName);
  const limits=limitConfig(ctx.settings);
  if(input.files.length<2 || input.files.length>limits.maxFiles || new Set(input.files.map(f=>f.name)).size!==input.files.length) throw new ImportError("INVALID_FILES");
  if(input.files.some(f=>f.size>limits.maxFileBytes) || input.files.reduce((a,f)=>a+f.size,0)>limits.maxTotalBytes) throw new ImportError("FILE_TOO_LARGE",413);
  const id=randomUUID();
  const files:StoredFile[]=input.files.map(f=>{
    if(!/\.csv$/i.test(f.name) || /[\/\\:\x00-\x1f]/.test(f.name) || !["","text/csv","text/plain","application/csv","application/vnd.ms-excel","application/octet-stream"].includes(f.mime)) throw new ImportError("INVALID_FILE_TYPE",400,{file:f.name});
    const fid=randomUUID();
    return {...f,id:fid,stage:`staging/${ctx.factory}/${id}/${fid}`};
  });
  await ctx.db.query(`INSERT INTO imports(id,factory_id,source_name,file_names,content_hash,status,uploaded_by,files)
    VALUES($1,$2,$3,$4,$5,'draft',$6,$7)`,[id,ctx.factory,input.sourceName,JSON.stringify(files.map(f=>f.name)),`draft:${id}`,ctx.user,JSON.stringify(files)]);
  return view(ctx,await getRow(ctx,id),true);
}
export async function finalize(ctx:Context,row:ImportRow) {
  editable(row);
  if(row.finalized) return view(ctx,row);
  return importJobs.run(row.id,async progress=>{
    const limits=limitConfig(ctx.settings),sources:SourceFile[]=[];
    let total=0;
    for(const [index,f] of row.files.entries()) {
      let bytes:Buffer;
      try {bytes=await fileStorage.read(f.stage,limits.maxFileBytes);} catch(e) {
        if(e instanceof Error && e.message==="FILE_TOO_LARGE") throw new ImportError("FILE_TOO_LARGE",413,{file:f.name});
        throw new ImportError("UPLOAD_INCOMPLETE",400,{file:f.name});
      }
      total+=bytes.length;
      if(total>limits.maxTotalBytes || bytes.length!==f.size) throw new ImportError("FILE_SIZE_MISMATCH",400,{file:f.name});
      const {encoding,delimiter,table}=await importCpu("inspect",[{name:f.name,bytes}]) as ReturnType<typeof inspect>;
      const original=`originals/${ctx.factory}/${row.id}/${randomUUID()}`;
      await fileStorage.preserve(original,bytes);
      Object.assign(f,{original,sha256:createHash("sha256").update(bytes).digest("hex"),encoding,delimiter,
        header:table.header,preview:table.rows.slice(0,20),rowCount:table.rows.length});
      sources.push({name:f.name,bytes});
      // Raw cells are untrimmed. Header is retained in file metadata and original.
      await ctx.db.query(`INSERT INTO raw_rows(factory_id,source_name,import_id,file,line_number,record_end_line,cells)
        SELECT $1,$2,$3,$4,r.start_line,r.end_line,r.cells FROM jsonb_to_recordset($5::jsonb) AS r(start_line int,end_line int,cells jsonb)`,
        [ctx.factory,row.source_name,row.id,f.name,JSON.stringify(table.rows)]);
      progress(Math.round((index+1)/row.files.length*90));
    }
    // File-set identity ignores filenames and upload order; renaming cannot
    // bypass duplicate approval. Multiplicity is retained in the sorted hashes.
    const hash=createHash("sha256").update(row.files.map(f=>f.sha256!).sort().join("\0")).digest("hex"),mapping=suggestMapping(row.files,row.source_name);
    const settings=ctx.settings;
    if(settings.unit_factors_to_kg) mapping.unit_factors_to_kg=settings.unit_factors_to_kg as Mapping["unit_factors_to_kg"];
    if(settings.tolerances) mapping.tolerances=settings.tolerances as Mapping["tolerances"];
    if(settings.event_code_map) mapping.event_code_map=settings.event_code_map as Mapping["event_code_map"];
    await ctx.db.query(`UPDATE imports SET files=$3,content_hash=$4,mapping=$5,finalized=true,progress=100 WHERE factory_id=$1 AND id=$2`,
      [ctx.factory,row.id,JSON.stringify(row.files),hash,JSON.stringify(mapping)]);
    progress(100);
    return view(ctx,await getRow(ctx,row.id));
  });
}
export async function sources(ctx:Context,row:ImportRow):Promise<SourceFile[]> {
  if(!row.finalized) throw new ImportError("UPLOAD_INCOMPLETE");
  const limit=limitConfig(ctx.settings).maxFileBytes;
  return Promise.all(row.files.map(async f=>({name:f.name,bytes:await fileStorage.read(f.original!,limit)})));
}
export async function saveMapping(ctx:Context,row:ImportRow,input:unknown) {
  editable(row);
  const mapping=validateMapping(input,row.source_name,row.files.map(f=>f.name)) as ReviewMapping;
  // Explicit ignore is an audited wizard choice, NOT a new engine event type.
  for(const code of mapping.ignored_event_codes??[]) delete mapping.event_code_map[code];
  const decisions=await recordDecisions(ctx,row,mapping);
  const files=await sources(ctx,row);
  const samples=await importCpu("mapping",files,mapping);
  await ctx.db.query("DELETE FROM data_issues WHERE factory_id=$1 AND import_id=$2",[ctx.factory,row.id]);
  await ctx.db.query("UPDATE imports SET mapping=$3,decision_audit=$4,result=NULL,counts=NULL,status='draft' WHERE factory_id=$1 AND id=$2",[ctx.factory,row.id,JSON.stringify(mapping),JSON.stringify(decisions)]);
  return {...await view(ctx,await getRow(ctx,row.id)),samples};
}
export async function runEngine(ctx:Context,row:ImportRow) {
  const mapping=validateMapping(row.mapping,row.source_name,row.files.map(f=>f.name));
  return await importCpu("calculate",await sources(ctx,row),mapping) as {canonical:CanonicalDataset;result:EngineResult;collected:{order:string;code:string;severity:string;groups:string[];refs:string[]}[]};
}
export async function check(ctx:Context,row:ImportRow) {
  editable(row);
  await assertChoices(ctx,row);
  return importJobs.run(row.id,async progress=>{
    progress(15);
    const {canonical,result,collected}=await runEngine(ctx,row);
    const raw=(await ctx.db.query("SELECT id,file,line_number,cells FROM raw_rows WHERE factory_id=$1 AND import_id=$2",[ctx.factory,row.id])).rows;
    const byRef=new Map(raw.map(r=>[`${r.file}:${r.line_number}`,r.id]));
    const groups=new Map<string,{order:string|null;code:string;severity:string;group:string;refs:Set<string>}>();
    for(const item of collected) {
      const key=JSON.stringify([item.order,item.code,item.severity,item.groups]);
      const existing=groups.get(key)??{order:item.order,code:item.code,severity:item.severity,group:item.groups.join(","),refs:new Set<string>()};
      let refs=item.refs;
      if(!refs.length) {
        const run=result.runs[item.order];
        refs=item.groups.flatMap(g=>run[g as "volume"|"changeover"|"downtime"].source_lines);
        if(!refs.length) {
          const spec=canonical.mapping.files.orders;
          refs=raw.filter(r=>r.file===spec.file && r.cells[spec.columns.order_id]?.trim()===item.order).map(r=>`${r.file}:${r.line_number}`);
        }
      }
      refs.forEach(r=>existing.refs.add(r)); groups.set(key,existing);
    }
    for(const issue of result.file_issues) {
      const [code,severity]=issue.split(":");
      const refs=code==="FORMULA_LIKE_CELL" ? result.formula_like_cells.map(r=>r.replace(/:[^:]+$/,"")) :
        [...canonical.records,...canonical.events].filter(r=>!r.order).map(r=>`${r.file}:${r.line}`);
      groups.set(issue,{order:null,code,severity,group:"file",refs:new Set(refs)});
    }
    await ctx.db.query("DELETE FROM data_issues WHERE factory_id=$1 AND import_id=$2",[ctx.factory,row.id]);
    const counts={info:0,warning:0,error:0};
    for(const issue of groups.values()) {
      counts[issue.severity as keyof typeof counts]++;
      const ids=[...issue.refs].map(r=>byRef.get(r)).filter(Boolean);
      await ctx.db.query(`INSERT INTO data_issues(factory_id,import_id,code,severity,source_order_id,"group",raw_row_ids)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[ctx.factory,row.id,issue.code,issue.severity,issue.order,issue.group,ids]);
    }
    progress(95);
    await ctx.db.query("UPDATE imports SET result=$3,counts=$4,status='checked',progress=100 WHERE factory_id=$1 AND id=$2",[ctx.factory,row.id,JSON.stringify(result),JSON.stringify(counts)]);
    progress(100);
    return view(ctx,await getRow(ctx,row.id));
  });
}
export async function loadRaw(ctx:Context,row:ImportRow) {
  const {rows}=await ctx.db.query("SELECT * FROM raw_rows WHERE factory_id=$1 AND import_id=$2 ORDER BY file,line_number",[ctx.factory,row.id]);
  return rows;
}
