import { D, fmt } from "./decimal";
import { GROUPS, Issues, ref } from "./issues";
import { analyzeVolume, processRecords } from "./volume";
import { analyzeEvents, processEvents } from "./events";
import type { CanonicalDataset, EngineResult, Run, WorkingEvent, WorkingRecord, EventValues } from "./types";

export function calculate(data: CanonicalDataset, pair?: readonly [string,string]): EngineResult {
  const {mapping,orders}=data;
  const selected = pair ?? [orders[0],orders[1]];
  if(!selected[0] || !selected[1] || !selected.every((id)=>orders.includes(id))) throw new Error("Comparison requires two existing order IDs");
  const issues=new Issues();
  const runs: Record<string,Run>=Object.create(null);
  const reasons: Record<string,string>=Object.create(null);
  if(data.formulaLikeCells.length) issues.file.add("FORMULA_LIKE_CELL:info");
  // Work on fresh rows: calculating twice, or in parallel, never mutates input.
  const records:WorkingRecord[]=data.records.map((r)=>({...r,state:"ok",suspected:false}));
  const events:WorkingEvent[]=data.events.map((r)=>({...r,state:"ok",suspected:false,
    type:Object.hasOwn(mapping.event_code_map,r.code) ? mapping.event_code_map[r.code]:null}));
  for(const row of [...records,...events,...data.totals.map((t)=>t.record)]) {
    if(row.order && !orders.includes(row.order)) throw new Error(`Unknown order ${JSON.stringify(row.order)} at ${ref(row)}`);
  }
  if(mapping.capability_level===1) {
    for(const order of orders) {
      const totals=data.totals.filter((r)=>r.record.order===order);
      if(totals.length!==1) throw new Error(`Expected one totals row for order ${JSON.stringify(order)}`);
      const total=totals[0];
      const record:WorkingRecord={...total.record,state:"ok",suspected:false};
      const volume=analyzeVolume(order,[record],mapping,issues);
      volume.record_ids=[];
      issues.add(order,"LEVEL1_TOTALS_ONLY","warning",GROUPS);
      const event=(minutes:string|null):EventValues=>({minutes,event_ids:[],source_lines:[ref(record)],
        excluded_source_lines:[],quarantined_source_lines:[],alternatives:{}});
      runs[order]={
        volume:{...volume,status:"green"},
        changeover:{...event(fmt(total.hours?.mul(60)??null)),status:"green"},
        downtime:{...event(fmt(total.downtime)),event_count:null,status:"green"},
        overlaps:[],issues:[],overall:"green",
      };
    }
  } else {
    processRecords(records,issues);
    processEvents(events,issues);
    for(const e of events) if(e.eid) reasons[e.eid]=e.reason;
    for(const order of orders) {
      const volume=analyzeVolume(order,records,mapping,issues);
      const e=analyzeEvents(order,events,issues);
      runs[order]={volume:{...volume,status:"green"},changeover:{...e.changeover,status:"green"},
        downtime:{...e.downtime,status:"green"},overlaps:e.overlaps,issues:[],overall:"green"};
    }
  }
  for(const order of orders) {
    const run=runs[order];
    for(const group of GROUPS) run[group].status=issues.status(order,group);
    run.issues=issues.forRun(order);
    run.overall=GROUPS.some((g)=>run[g].status==="red") ? "red" :
      GROUPS.some((g)=>run[g].status==="yellow") ? "yellow":"green";
  }
  const [a,b]=selected;
  const metrics:EngineResult["comparison"]["metrics"]={};
  const fields=[
    ["scrap_rate_pp","volume","scrap_rate_pct"],["good_rate_pp","volume","good_rate_pct"],
    ["changeover_min","changeover","minutes"],["downtime_min","downtime","minutes"],
  ] as const;
  for(const [name,group,key] of fields) {
    const left=runs[a][group], right=runs[b][group];
    const va=(left as unknown as Record<string,string|null>)[key], vb=(right as unknown as Record<string,string|null>)[key];
    const comparable=va!==null && vb!==null && left.status!=="red" && right.status!=="red";
    metrics[name]={value:comparable ? fmt(new D(vb!).sub(va!)):null,comparable};
  }
  return {capability_level:mapping.capability_level,runs,comparison:{pair:[a,b],metrics},
    file_issues:[...issues.file].sort(),formula_like_cells:[...new Set(data.formulaLikeCells)].sort(),event_reasons:reasons};
}
