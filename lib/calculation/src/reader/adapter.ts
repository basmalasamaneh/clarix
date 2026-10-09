import { D, parseNumber } from "../decimal";
import type { CanonicalDataset, CanonicalRecord, FileMapping, Mapping, SourceAdapter, SourceFile } from "../types";
import { decodeBytes, parseCsv } from "./csv";
import { normalizeDate, parseLocalTime } from "./dates";

const numericFields = new Set(["input","good","scrap","duration_min","changeover_hours","downtime_min"]);
const dateFields = new Set(["record_date","date","start","end"]);
export function isFormulaLikeText(field: string, raw: string): boolean {
  // User-approved clarification: inspect only mapped TEXT cells, before any
  // trimming. Numeric/date columns are excluded (-5 is not a formula warning).
  // Unlike the Python reference, this includes every mapped text column and
  // preserves leading TAB/CR for detection. Golden fixtures remain untouched.
  return !numericFields.has(field) && !dateFields.has(field) && /^[=+\-@\t\r]/.test(raw);
}

export const csvAdapter: SourceAdapter<readonly SourceFile[]> = {
  read(files, mapping) {
    if (![1,2,3].includes(mapping.capability_level)) throw new Error("Unsupported capability level");
    if (![".",","].includes(mapping.format.decimal_separator)) throw new Error("Unsupported decimal separator");
    const factors = Object.values(mapping.unit_factors_to_kg).map((x) => new D(x));
    if (factors.some((x) => !x.isFinite() || !x.isPositive())) throw new Error("Invalid unit factor");
    for(const x of Object.values(mapping.tolerances)) if(!new D(x).isFinite() || new D(x).isNegative()) throw new Error("Invalid tolerance");
    if(new Set(files.map((f)=>f.name)).size!==files.length) throw new Error("Duplicate source file name");
    const byName = new Map(files.map((f) => [f.name,f.bytes]));
    const formula = new Set<string>();
    const table = (spec: FileMapping | undefined, kind: string) => {
      if (!spec) throw new Error(`Missing ${kind} mapping`);
      const bytes=byName.get(spec.file);
      if (!bytes) throw new Error(`Missing source file ${spec.file}`);
      const parsed=parseCsv(decodeBytes(bytes,mapping.format.encoding),mapping.format.delimiter);
      for(const col of Object.values(spec.columns)) if(!parsed.header.includes(col)) throw new Error(`${spec.file}: mapped column ${JSON.stringify(col)} not found`);
      return parsed.rows.map((r) => {
        const c: Record<string,string>=Object.create(null);
        for(const [field,column] of Object.entries(spec.columns)) {
          const raw=r.cells[column];
          if (isFormulaLikeText(field,raw)) formula.add(`${spec.file}:${r.line}:${column}`);
          c[field]=raw.trim();
        }
        return { c, file:spec.file, line:r.line };
      });
    };
    const num = (v: string | undefined) => parseNumber(v??"",mapping.format.decimal_separator);
    const orders=table(mapping.files.orders,"orders").map(({c}) => c.order_id);
    if(orders.some((o)=>!o) || new Set(orders).size!==orders.length) throw new Error("Missing or duplicate order identifier");
    const record=(c: Record<string,string>, file: string, line:number, spec:FileMapping, totals=false): CanonicalRecord => ({
      file,line,rid:c.record_id??"",order:c.order_id??"",shift:c.shift??"",
      date:normalizeDate(c.record_date??"",mapping.format.date_format),
      machine:c.machine_id??"",mold:c.mold_id??"",
      input:num(c.input),good:num(c.good),scrap:num(c.scrap),
      unit:(spec.fixed_unit || c.unit || (totals ? "kg":"")).trim().toLowerCase(),
    });
    const result: CanonicalDataset = {mapping,orders,records:[],events:[],totals:[],formulaLikeCells:[]};
    if(mapping.capability_level===1) {
      result.totals=table(mapping.files.totals,"totals").map(({c,file,line}) => ({
        record:record(c,file,line,mapping.files.totals!,true),hours:num(c.changeover_hours),downtime:num(c.downtime_min),
      }));
    } else {
      result.records=table(mapping.files.records,"records").map(({c,file,line}) => record(c,file,line,mapping.files.records!));
      if(mapping.files.events) result.events=table(mapping.files.events,"events").map(({c,file,line}) => ({
        file,line,eid:c.event_id??"",order:c.order_id??"",code:c.event_code??"",
        start:parseLocalTime(c.start??"",mapping.format.datetime_format),
        end:parseLocalTime(c.end??"",mapping.format.datetime_format),
        duration:num(c.duration_min),reason:c.reason??"",machine:c.machine_id??"",mold:c.mold_id??"",shift:c.shift??"",
      }));
      else if(mapping.capability_level===3) throw new Error("Missing events mapping for capability level 3");
    }
    result.formulaLikeCells=[...formula].sort();
    return result;
  },
};
