import {D,type Mapping} from "@workspace/calculation";
import type {StoredFile} from "./model";
type Observation={files:StoredFile[];codes:string[];units:string[]};
function clean(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(clean);
  if(value && typeof value==="object") return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==""&&v!==null&&v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,clean(v)]));
  return value;
}
const numeric=(x:unknown)=>{try{return D(String(x)).toString();}catch{return String(x);}};
export function effectiveMapping(mapping:(Mapping&{ignored_event_codes?:string[]})|null,seen?:Observation) {
  if(!mapping) return null;
  const {source_name,schema_version,capability_level,ignored_event_codes,...settings}=mapping;
  const effective:any=structuredClone(settings);
  for(const [role,spec] of Object.entries(effective.files??{}) as [string,any][]) {
    if(!spec) {delete effective.files[role];continue;}
    if(spec.columns?.unit || !["records","totals"].includes(role)) delete spec.fixed_unit;
    else if(spec.fixed_unit) spec.fixed_unit=spec.fixed_unit.trim().toLowerCase();
    if(seen) {
      const file=seen.files.find(f=>f.name===spec.file);
      spec.file=file?.sha256??spec.file;
      spec.encoding=effective.format.encoding==="auto"?file?.encoding:effective.format.encoding;
      if(["utf-8-sig","utf-8"].includes(spec.encoding)) spec.encoding="utf-8";
      if(spec.encoding==="cp1256") spec.encoding="windows-1256";
      spec.delimiter=effective.format.delimiter==="auto"?file?.delimiter:effective.format.delimiter;
    }
  }
  if(seen) {delete effective.format.encoding;delete effective.format.delimiter;}
  const codes=seen?.codes??Object.keys(mapping.event_code_map??{});
  effective.event_code_map=Object.fromEntries(codes.filter(c=>mapping.event_code_map?.[c] && !ignored_event_codes?.includes(c)).map(c=>[c,mapping.event_code_map[c]]));
  // Ignored and unmapped are identical for calculation; checking separately
  // requires an explicit decision and keeps its full audit history.
  const units=seen?.units??Object.keys(mapping.unit_factors_to_kg??{});
  effective.unit_factors_to_kg=Object.fromEntries(units.filter(u=>mapping.unit_factors_to_kg?.[u]!==undefined).map(u=>[u,numeric(mapping.unit_factors_to_kg[u])]));
  effective.tolerances=Object.fromEntries(Object.entries(mapping.tolerances??{}).map(([k,v])=>[k,numeric(v)]));
  return clean(effective);
}
export function mappingDifferences(here:unknown,there:unknown,path=""): {path:string;here:unknown;there:unknown}[] {
  if(JSON.stringify(here)===JSON.stringify(there)) return [];
  if(here&&there&&typeof here==="object"&&typeof there==="object"&&!Array.isArray(here)&&!Array.isArray(there)) {
    const a=here as Record<string,unknown>,b=there as Record<string,unknown>;
    return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(k=>mappingDifferences(a[k],b[k],path?`${path}.${k}`:k));
  }
  return [{path,here:here??null,there:there??null}];
}
