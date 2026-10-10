import { z } from "zod";
import { decodeBytes, detectDelimiter, parseCsv, type Mapping } from "@workspace/calculation";
export class ImportError extends Error {
  constructor(readonly code:string,readonly status=400,readonly details:Record<string,unknown>={}) {super(code);}
}
const columns=z.record(z.string(),z.string().min(1));
const fileMap=z.object({file:z.string().min(1),columns,fixed_unit:z.string().optional()});
export const mappingSchema=z.object({
  schema_version:z.literal(1),capability_level:z.union([z.literal(1),z.literal(2),z.literal(3)]),
  source_name:z.string().min(1),
  format:z.object({encoding:z.enum(["auto","utf-8","utf-8-sig","windows-1256","cp1256"]),
    delimiter:z.enum(["auto",",",";","\t","|"]),decimal_separator:z.enum([".",","]),
    date_format:z.string().min(1),datetime_format:z.string().min(1)}),
  files:z.object({orders:fileMap,records:fileMap.optional(),events:fileMap.optional(),totals:fileMap.optional()}),
  event_code_map:z.record(z.string(),z.enum(["CHANGEOVER","UNPLANNED_DOWNTIME","PLANNED_STOP"])),
  ignored_event_codes:z.array(z.string()).default([]),
  unit_factors_to_kg:z.record(z.string(),z.string()),
  tolerances:z.object({imbalance_warn_pct:z.string(),imbalance_error_pct:z.string()}),
});
export interface StoredFile {
  id:string; name:string;size:number;mime:string;stage:string;original?:string;
  sha256?:string;encoding?:string;delimiter?:string;header?:string[];
  preview?:ReturnType<typeof parseCsv>["rows"];rowCount?:number;
}
export function limitConfig(settings:Record<string,unknown>={}) {
  const custom=(settings.platformLimits as {maxFileBytes?:number}|undefined)?.maxFileBytes??settings.importMaxFileBytes;
  const maxFileBytes=typeof custom==="number" && Number.isSafeInteger(custom) && custom>0 ? Math.min(custom,20*1024*1024):5*1024*1024;
  return {maxFileBytes,maxTotalBytes:maxFileBytes*4,maxFiles:4,maxRows:(settings.platformLimits as {maxRows?:number}|undefined)?.maxRows??100000};
}
export function inspect(bytes:Uint8Array,name:string) {
  let encoding="utf-8";
  try {new TextDecoder("utf-8",{fatal:true}).decode(bytes);} catch {encoding="windows-1256";}
  const text=decodeBytes(bytes);
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /^\s*(?:<!doctype|<html|<\?xml|%PDF|PK\x03)/i.test(text)) throw new ImportError("INVALID_FILE_TYPE",400,{file:name});
  const delimiter=detectDelimiter(text);
  try {
    const table=parseCsv(text,delimiter);
    if(table.rows.length>100_000)throw new ImportError("TOO_MANY_ROWS",413,{file:name,maxRows:100_000});
    if(table.header.length<2 || !table.rows.length) throw new Error("Empty table");
    return {encoding,delimiter,table};
  } catch(e) {if(e instanceof ImportError)throw e;throw new ImportError("INVALID_CSV",400,{file:name});}
}
const aliases:Record<string,string[]>={
  order_id:["orderid","orderno","jobno","jobid"],product_code:["productcode","product"],
  record_id:["recordid","rowno","rowid"],event_id:["eventid","stopid"],
  input:["input","materialinput","materialinputkg","rawmaterialt","inputkg"],good:["good","goodoutput","goodoutputkg","goodt"],
  scrap:["scrap","scrapkg","rejectt"],shift:["shift","crew"],record_date:["recorddate","date"],
  unit:["unit","weightunit"],machine_id:["machineid","press"],mold_id:["moldid","die"],line_id:["lineid"],
  event_code:["eventcode","kind","code"],start:["start","starttime","from"],end:["end","endtime","to"],
  duration_min:["durationmin","minutes"],reason:["reason","recordedreason"],
  changeover_hours:["changeoverhours"],downtime_min:["unplanneddowntimemin","downtimemin"],
};
export function suggestMapping(files:StoredFile[],source:string):Mapping {
  const roles:Mapping["files"]={} as Mapping["files"];
  for(const f of files) {
    const mapped:Record<string,string>={};
    for(const [key,names] of Object.entries(aliases)) {
      const match=f.header?.find(h=>names.includes(h.toLowerCase().replace(/[^a-z0-9]/g,"")));
      if(match) mapped[key]=match;
    }
    const role=mapped.changeover_hours?"totals":mapped.event_id?"events":mapped.record_id?"records":"orders";
    roles[role]={file:f.name,columns:mapped};
  }
  const sample=files.flatMap(f=>f.preview??[]).flatMap(r=>Object.values(r.cells));
  return {schema_version:1,source_name:source,capability_level:roles.totals?1:roles.events?3:2,
    format:{encoding:"auto",delimiter:"auto",decimal_separator:sample.some(v=>/^\d+,\d+$/.test(v))?",":".",
      date_format:sample.some(v=>/^\d\d\/\d\d\/\d{4}/.test(v))?"%d/%m/%Y":"%Y-%m-%d",
      datetime_format:sample.some(v=>/^\d\d\/\d\d\/\d{4}/.test(v))?"%d/%m/%Y %H:%M":"%Y-%m-%d %H:%M"},
    files:roles,event_code_map:{},unit_factors_to_kg:{kg:"1",kgs:"1",t:"1000",tonne:"1000",lb:"0.45359237",g:"0.001"},
    tolerances:{imbalance_warn_pct:"1",imbalance_error_pct:"5"}};
}
export function validateMapping(input:unknown,source:string,names:string[]):Mapping {
  const parsed=mappingSchema.safeParse(input);
  if(!parsed.success) throw new ImportError("INVALID_MAPPING",400,{fields:parsed.error.issues.map(i=>i.path.join("."))});
  const m=parsed.data as Mapping;
  m.source_name=source;
  m.capability_level=m.files.totals?1:m.files.events?3:2;
  if(m.files.totals && (m.files.records || m.files.events) || !m.files.totals && !m.files.records) throw new ImportError("INVALID_MAPPING");
  const selected=Object.values(m.files);
  if(selected.length!==names.length || new Set(selected.map(f=>f.file)).size!==names.length || selected.some(f=>!names.includes(f.file))) throw new ImportError("MAP_EVERY_FILE");
  const required={orders:["order_id"],records:["record_id","order_id","input","good","scrap"],events:["event_id","order_id","event_code","start","end"],totals:["order_id","input","good","scrap","changeover_hours","downtime_min"]};
  for(const [role,f] of Object.entries(m.files)) {
    const fields=required[role as keyof typeof required];
    if(fields.some(k=>!f.columns[k])) throw new ImportError("MISSING_MAPPING_FIELD",400,{file:f.file,fields});
    if(new Set(Object.values(f.columns)).size!==Object.keys(f.columns).length) throw new ImportError("DUPLICATE_COLUMN_MAPPING",400,{file:f.file});
    if(role==="records" && !f.columns.unit && !f.fixed_unit) throw new ImportError("UNIT_REQUIRED",400,{file:f.file});
  }
  return m;
}
