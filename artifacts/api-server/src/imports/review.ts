import type {Mapping} from "@workspace/calculation";
import {ImportError} from "./model";
import type {Context,ImportRow} from "./service";
import {effectiveMapping,mappingDifferences} from "./mapping-identity";
export type ReviewMapping=Mapping & {ignored_event_codes?:string[]};
type Decision={code:string;choice:string|null;chosenBy:string;chosenAt:string};
export function mappingIdentity(mapping:ReviewMapping|null) {
  return effectiveMapping(mapping);
}
export async function eventCodes(ctx:Context,row:ImportRow,mapping:ReviewMapping) {
  const spec=mapping.files?.events;
  if(!spec?.columns?.event_code) return {items:[],total:0};
  if(!row.files.some(f=>f.name===spec.file && f.header?.includes(spec.columns.event_code))) throw new ImportError("COLUMN_NOT_FOUND");
  const rows=(await ctx.db.query("SELECT file,line_number AS line,cells FROM raw_rows WHERE factory_id=$1 AND import_id=$2 AND file=$3 ORDER BY line_number",[ctx.factory,row.id,spec.file])).rows;
  const groups=new Map<string,typeof rows>();
  for(const r of rows) {
    const code=String(r.cells[spec.columns.event_code]??"").trim();
    const group=groups.get(code);
    if(group) group.push(r); else groups.set(code,[r]);
  }
  const audit=row.decision_audit??[];
  const items=[...groups].map(([code,records])=>{
    const words=[code,...records.map(r=>String(r.cells[spec.columns.reason]??""))].join(" ").toLowerCase();
    const change=/\b(change|changeover|mold)\b/.test(words),stop=/\b(stop|downtime)\b/.test(words);
    const suggestion=change && !stop?"CHANGEOVER":stop && !change?(/\bplanned\b/.test(words) && !/\bunplanned\b/.test(words)?"PLANNED_STOP":"UNPLANNED_DOWNTIME"):null;
    const choice=mapping.ignored_event_codes?.includes(code)?"IGNORE":mapping.event_code_map?.[code]??null;
    const decision=[...audit].reverse().find(d=>d.code===code && d.choice===choice);
    return {code,count:records.length,sample:records[0],refs:records.map(r=>`${r.file}:${r.line}`),suggestion,choice,
      ...(decision?{chosenBy:decision.chosenBy,chosenAt:decision.chosenAt}:{})};
  });
  return {items,total:items.length};
}
export async function recordDecisions(ctx:Context,row:ImportRow,mapping:ReviewMapping) {
  const audit:Decision[]=[...(row.decision_audit??[])];
  const name=ctx.userName??ctx.user;
  for(const item of (await eventCodes(ctx,row,mapping)).items) {
    const old=[...audit].reverse().find(d=>d.code===item.code);
    if(old?.choice!==item.choice) audit.push({code:item.code,choice:item.choice,chosenBy:name,chosenAt:new Date().toISOString(),userId:ctx.user} as Decision);
  }
  return audit;
}
export async function assertChoices(ctx:Context,row:ImportRow) {
  const unassigned=(await eventCodes(ctx,row,row.mapping!)).items.filter(i=>!i.choice);
  if(unassigned.length) throw new ImportError("EVENT_CHOICES_REQUIRED",422,{codes:unassigned,codeCount:unassigned.length});
}
export async function replacementOrders(ctx:Context,row:ImportRow) {
  return (await ctx.db.query("SELECT source_order_id FROM orders WHERE factory_id=$1 AND source_name=$2 AND source_order_id=ANY($3::text[]) AND current_import_id IS NOT NULL ORDER BY source_order_id",[ctx.factory,row.source_name,Object.keys(row.result?.runs??{})])).rows.map(r=>r.source_order_id as string);
}
export async function duplicateState(ctx:Context,row:ImportRow) {
  if(!row.mapping || !row.finalized) return {duplicateOf:null,duplicateReason:null,settingsDifferences:[],comparisonSource:null};
  const matches=(await ctx.db.query(`SELECT i.id,i.source_name,i.files,
    EXISTS(SELECT 1 FROM orders o WHERE o.factory_id=i.factory_id AND o.current_import_id=i.id) AS current,
    i.mapping FROM imports i WHERE i.factory_id=$1 AND i.content_hash=$2 AND i.status='approved' AND i.id<>$3 AND i.source_name=$4
    ORDER BY approved_at DESC`,[ctx.factory,row.content_hash,row.id,row.source_name])).rows;
  async function identity(r:ImportRow) {
    const raw=(await ctx.db.query("SELECT file,cells FROM raw_rows WHERE factory_id=$1 AND import_id=$2",[ctx.factory,r.id])).rows;
    const codes=new Set<string>(),units=new Set<string>();
    for(const cell of raw) {
      const events=r.mapping?.files.events;
      if(events && cell.file===events.file) codes.add(String(cell.cells[events.columns.event_code]??"").trim());
      for(const spec of [r.mapping?.files.records,r.mapping?.files.totals]) if(spec && cell.file===spec.file) units.add(String(spec.columns.unit?cell.cells[spec.columns.unit]??"":spec.fixed_unit??"").trim().toLowerCase());
    }
    return effectiveMapping(r.mapping,{files:r.files,codes:[...codes],units:[...units]});
  }
  const here=await identity(row);
  let differences:ReturnType<typeof mappingDifferences>=[],comparisonSource:string|null=null;
  for(const m of matches.filter(m=>m.current)) {
    const diff=mappingDifferences(here,await identity(m));
    if(!diff.length) return {duplicateOf:m.id,duplicateReason:"CURRENT_SAME_MAPPING",settingsDifferences:[],comparisonSource:m.source_name};
    if(!comparisonSource) {differences=diff;comparisonSource=m.source_name;}
  }
  return {duplicateOf:null,duplicateReason:matches.some(m=>m.current)?"MAPPING_DIFFERS":matches.length?"FULLY_SUPERSEDED":null,settingsDifferences:differences,comparisonSource};
}
export async function issues(ctx:Context,row:ImportRow,p=1,errorsOnly=false) {
  const filter=errorsOnly?" AND severity='error'":"";
  const result=await ctx.db.query(`SELECT id,code,severity,source_order_id AS "order","group",raw_row_ids FROM data_issues
    WHERE factory_id=$1 AND import_id=$2 ${filter} ORDER BY code,id LIMIT 20 OFFSET $3`,
    [ctx.factory,row.id,(p-1)*20]);
  const codes=(await eventCodes(ctx,row,row.mapping!)).items;
  const raw=(await ctx.db.query('SELECT id,file,line_number AS line,cells FROM raw_rows WHERE factory_id=$1 AND import_id=$2 ORDER BY file COLLATE "C",line_number,id',[ctx.factory,row.id])).rows;
  const byRef=new Map(raw.map(r=>[`${r.file}:${r.line}`,r]));
  const eventSpec=row.mapping?.files.events;
  const items=result.rows.map(issue=>{
    const issueRowIds=new Set(issue.raw_row_ids);
    const rows=raw.filter(r=>issueRowIds.has(r.id));
    const orderCodes=codes.filter(c=>raw.some(r=>eventSpec && r.file===eventSpec.file && String(r.cells[eventSpec.columns.order_id]??"").trim()===issue.order && String(r.cells[eventSpec.columns.event_code]??"").trim()===c.code));
    const relevant=orderCodes.filter(c=>issue.code==="UNMAPPED_EVENT_CODE"?(!c.choice || c.choice==="IGNORE"):true).map(c=>{
      const refs=c.refs.filter(ref=>{
        const r=byRef.get(ref);
        return r && eventSpec && String(r.cells[eventSpec.columns.order_id]??"").trim()===issue.order;
      });
      return {...c,count:refs.length,refs};
    });
    const volumeRole=row.mapping?.files.totals?"totals":"records";
    const volumeSpec=row.mapping?.files[volumeRole];
    let field=issue.group.includes("volume")?`${volumeRole}.input`:"events.event_code";
    if(["INCOMPATIBLE_UNIT","UNIT_CONVERTED"].includes(issue.code)) field=`${volumeRole}.unit`;
    if(issue.code==="MISSING_VALUE") {
      const missing=["input","good","scrap"].find(k=>rows.some(r=>volumeSpec && r.file===volumeSpec.file && !String(r.cells[volumeSpec.columns[k]]??"").trim()));
      field=`${volumeRole}.${missing??"input"}`;
    }
    if(["INVALID_TIME_RANGE","DURATION_MISMATCH","POSSIBLE_OVERLAP"].includes(issue.code)) field="events.start";
    const values:Record<string,unknown>={};
    const volume=row.result?.runs[issue.order]?.volume;
    if(volume && issue.group.includes("volume")) Object.assign(values,{input:volume.input_kg,good:volume.good_kg,scrap:volume.scrap_kg});
    if(eventSpec && rows[0]?.file===eventSpec.file) for(const k of ["event_code","start","end","duration_min"]) {
      if(eventSpec.columns[k]) values[k]=rows[0].cells[eventSpec.columns[k]];
    }
    return {id:issue.id,code:issue.code,severity:issue.severity,order:issue.order,group:issue.group,refs:rows.map(r=>`${r.file}:${r.line}`),
      details:{rows,rowCount:rows.length,eventCodeCount:relevant.length,eventCodes:relevant.map(c=>({...c,ignored:c.choice==="IGNORE"})),hasUnmappedEvents:orderCodes.some(c=>!c.choice||c.choice==="IGNORE"),field,
        values}};
  });
  const total=(await ctx.db.query(`SELECT count(*)::int AS n FROM data_issues WHERE factory_id=$1 AND import_id=$2 ${filter}`,[ctx.factory,row.id])).rows[0].n;
  return {items,total,page:p};
}
