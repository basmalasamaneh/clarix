import {calculate,csvAdapter,parseCsv,decodeBytes,D,fmt,type Mapping,type SourceFile} from "@workspace/calculation";
import {inspect} from "./model";
export function cpuWork(action:"inspect"|"mapping"|"calculate",files:SourceFile[],mapping?:Mapping):any {
  if(action==="inspect")return inspect(Buffer.from(files[0].bytes),files[0].name);
  const canonical=csvAdapter.read(files,mapping!);
  if(action==="calculate"){
    const collected:any[]=[];
    const result=calculate(canonical,[canonical.orders[0],canonical.orders[1]??canonical.orders[0]],entries=>collected.push(...entries));
    return {canonical,result,collected};
  }
  const samples=[];
  for(const spec of [mapping!.files.records,mapping!.files.totals].filter(Boolean)){
    const source=files.find(f=>f.name===spec!.file)!;
    const table=parseCsv(decodeBytes(source.bytes,mapping!.format.encoding),mapping!.format.delimiter);
    for(const r of canonical.records.length?canonical.records.slice(0,3):canonical.totals.slice(0,3).map(t=>t.record)){
      if(r.file!==spec!.file)continue;
      for(const key of ["input","good","scrap"] as const){
        const column=spec!.columns[key],raw=table.rows.find(t=>t.line===r.line)!.cells[column];
        const factor=mapping!.unit_factors_to_kg[r.unit];
        samples.push({file:r.file,line:r.line,column,raw:`${raw} ${r.unit}`,value:r[key]!==null&&factor?fmt(r[key]!.mul(new D(factor))):null,unit:"kg"});
      }
    }
  }
  return samples;
}
