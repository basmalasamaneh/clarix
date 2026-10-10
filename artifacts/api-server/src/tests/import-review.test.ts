import {test} from "node:test";
import assert from "node:assert/strict";
import {eventCodes,mappingIdentity} from "../imports/review";
import type {Context,ImportRow} from "../imports/service";
import {effectiveMapping,mappingDifferences} from "../imports/mapping-identity";
test("effective mapping ignores empty options, numeric spelling and unused codes but reports real differences",()=>{
  const a:any={files:{records:{file:"r.csv",columns:{unit:"unit",machine_id:""},fixed_unit:""}},format:{encoding:"auto",delimiter:"auto",decimal_separator:"."},event_code_map:{CHG:"CHANGEOVER",PMT:"PLANNED_STOP"},unit_factors_to_kg:{kg:"1.0",t:"1000"},tolerances:{imbalance_warn_pct:"1.0"}};
  const b=structuredClone(a);delete b.files.records.columns.machine_id;delete b.files.records.fixed_unit;
  b.format.encoding="utf-8";b.format.delimiter=",";delete b.event_code_map.PMT;b.unit_factors_to_kg.kg="1";b.tolerances.imbalance_warn_pct="1";
  const seen:any={files:[{name:"r.csv",sha256:"same",encoding:"utf-8",delimiter:","}],codes:["CHG"],units:["kg"]};
  assert.deepEqual(effectiveMapping(a,seen),effectiveMapping(b,seen));
  b.files.records.columns.machine_id="machine";
  assert.deepEqual(mappingDifferences(effectiveMapping(a,seen),effectiveMapping(b,seen)),[{path:"files.records.columns.machine_id",here:null,there:"machine"}]);
});
test("code inventory covers rows beyond preview, counts repeats and never guesses abbreviations",async()=>{
  const rows=Array.from({length:27},(_,i)=>({file:"events.csv",line:i+2,cells:{code:`X${i}`,reason:"Unknown activity"}}));
  rows.push({file:"events.csv",line:29,cells:{code:"X25",reason:"Unknown activity"}});
  const ctx={db:{query:async()=>({rows})},factory:"synthetic",user:"synthetic"} as unknown as Context;
  const row={id:"synthetic",files:[{name:"events.csv",header:["code","reason"]}],decision_audit:[]} as unknown as ImportRow;
  const mapping={files:{events:{file:"events.csv",columns:{event_code:"code",reason:"reason"}}},event_code_map:{},ignored_event_codes:[]} as any;
  const inventory=await eventCodes(ctx,row,mapping);
  assert.equal(inventory.total,27);
  assert.equal(inventory.items.find(i=>i.code==="X25")?.count,2);
  assert.ok(inventory.items.every(i=>i.choice===null && i.suggestion===null));
  assert.equal(inventory.items[25].sample.line,27);
  assert.deepEqual(inventory.items[25].refs,["events.csv:27","events.csv:29"]);
  rows[0].cells.reason="Mold change";rows[1].cells.reason="Unplanned downtime";rows[2].cells.reason="Planned stop";
  const suggested=await eventCodes(ctx,row,mapping);
  assert.deepEqual(suggested.items.slice(0,3).map(i=>i.suggestion),["CHANGEOVER","UNPLANNED_DOWNTIME","PLANNED_STOP"]);
});
test("mapping identity normalizes ignored sets but does not discard settings",()=>{
  const base={source_name:"A",event_code_map:{CHG:"CHANGEOVER"},format:{decimal_separator:"."}} as any;
  assert.deepEqual(mappingIdentity(base),mappingIdentity({...base,source_name:"B",ignored_event_codes:[]}));
  assert.deepEqual(mappingIdentity({...base,ignored_event_codes:["B","A","A"]}),mappingIdentity({...base,ignored_event_codes:["A","B"]}));
  assert.notDeepEqual(mappingIdentity(base),mappingIdentity({...base,format:{decimal_separator:","}}));
});
