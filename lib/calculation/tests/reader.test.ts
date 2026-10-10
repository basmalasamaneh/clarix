import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, calculateFiles, csvAdapter, decodeBytes, detectDelimiter, parseCsv,
  parseNumber, parseLocalTime, type Mapping, type SourceFile } from "../src";

const bytes=(s:string)=>new TextEncoder().encode(s);
const mapping: Mapping={
  schema_version:1,capability_level:3,source_name:"Synthetic",
  format:{encoding:"auto",delimiter:"auto",decimal_separator:".",date_format:"%Y-%m-%d",datetime_format:"%Y-%m-%d %H:%M"},
  files:{
    orders:{file:"orders.csv",columns:{order_id:"Order",product_code:"Product"}},
    records:{file:"records.csv",columns:{record_id:"Record",order_id:"Order",input:"Input",good:"Good",scrap:"Scrap",unit:"Unit",record_date:"Date",shift:"Shift"}},
    events:{file:"events.csv",columns:{event_id:"Event",order_id:"Order",event_code:"Code",start:"Start",end:"End",reason:"Reason"}},
  },
  event_code_map:{C:"CHANGEOVER",U:"UNPLANNED_DOWNTIME"},
  unit_factors_to_kg:{kg:"1",t:"1000",lb:"0.45359237",g:"0.001"},
  tolerances:{imbalance_warn_pct:"1",imbalance_error_pct:"5"},
};
function files():SourceFile[] {
  return [
    {name:"orders.csv",bytes:bytes("Order,Product\r\nA,Product-one\r\nB,Product-two\r\n")},
    {name:"records.csv",bytes:bytes("Record,Order,Input,Good,Scrap,Unit,Date,Shift\r\nR1,A,10,9,1,kg,2026-10-10,day\r\nR2,B,10,8,2,kg,2026-10-10,night\r\n")},
    {name:"events.csv",bytes:bytes("Event,Order,Code,Start,End,Reason\r\nE1,A,C,2026-10-10 00:00,2026-10-10 01:00,normal-text\r\nE2,B,C,2026-10-10 00:00,2026-10-10 02:00,normal-text\r\n")},
  ];
}
function replace(input:SourceFile[],name:string,content:string) {
  return input.map((f)=>f.name===name ? {name,bytes:bytes(content)}:f);
}
test("formula clarification: raw TAB/CR text, mapped column names, hyphen and negative number exclusions",()=>{
  let input=replace(files(),"orders.csv",'Order,Product\r\nA,"\tproduct"\r\nB,normal-middle-hyphen\r\n');
  input=replace(input,"records.csv","Record,Order,Input,Good,Scrap,Unit,Date,Shift\r\nR1,A,-5,9,1,kg,2026-10-10,day\r\nR2,B,10,8,2,kg,2026-10-10,night\r\n");
  input=replace(input,"events.csv",'Event,Order,Code,Start,End,Reason\r\nE1,A,C,2026-10-10 00:00,2026-10-10 01:00,"\rtext"\r\nE2,B,C,2026-10-10 00:00,2026-10-10 02:00,normal-text\r\n');
  const canonical=csvAdapter.read(input,mapping);
  assert.equal(canonical.records[0].input!.toString(),"-5");
  assert.deepEqual(canonical.formulaLikeCells,["events.csv:2:Reason","orders.csv:2:Product"]);
  const result=calculate(canonical);
  assert.deepEqual(result.file_issues,["FORMULA_LIKE_CELL:info"]);
  assert.deepEqual(result.formula_like_cells,canonical.formulaLikeCells);
  assert.equal(result.event_reasons.E1,"text","detection precedes canonical trimming");
});
test("formula detection covers IDs and shift, not just event reasons; leading space is not a prefix",()=>{
  let input=replace(files(),"records.csv","Record,Order,Input,Good,Scrap,Unit,Date,Shift\n@R1,A,10,9,1,kg,2026-10-10,+day\nR2,B,10,8,2,kg,2026-10-10, =not-leading\n");
  const result=calculateFiles(input,mapping);
  assert.deepEqual(result.formula_like_cells,["records.csv:2:Record","records.csv:2:Shift"]);
  assert.deepEqual(result.file_issues,["FORMULA_LIKE_CELL:info"]);
});
test("UTF-8, UTF-8 BOM, and Windows-1256",()=>{
  assert.equal(decodeBytes(bytes("سلام")),"سلام");
  assert.equal(decodeBytes(new Uint8Array([239,187,191,...bytes("name\nvalue")])),"name\nvalue");
  assert.equal(decodeBytes(new Uint8Array([0xd3,0xe1,0xc7,0xe3])),"سلام");
});
test("four delimiters; quotes, escaped quotes, embedded CRLF and physical line numbers",()=>{
  for(const delimiter of [",",";","\t","|"]) {
    const text=`id${delimiter}description\r\n1${delimiter}"a${delimiter}b"\r\n2${delimiter}"two\r\nlines ""quoted"""\r\n\r\n3${delimiter}end`;
    assert.equal(detectDelimiter(text),delimiter);
    const t=parseCsv(text);
    assert.deepEqual(t.rows.map((r)=>r.line),[2,3,6]);
    assert.deepEqual(t.rows.map((r)=>[r.start_line,r.end_line]),[[2,2],[3,4],[6,6]]);
    assert.equal(t.rows[1].cells.description,'two\r\nlines "quoted"');
  }
  assert.equal(detectDelimiter('"many,commas,in,header";other\n'),";");
  assert.throws(()=>parseCsv('a,b\n"unclosed,field'),/Unclosed/);
  assert.throws(()=>parseCsv('a,a\n1,2'),/duplicate/);
});
test("strict decimals and dates: invalid values never guessed",()=>{
  assert.equal(parseNumber("0,125",",")!.toString(),"0.125");
  assert.equal(parseNumber("",".") ,null);
  for(const raw of ["NaN","Infinity","1,2,3","garbage"]) assert.throws(()=>parseNumber(raw,"."));
  assert.equal(parseLocalTime("","%Y-%m-%d"),null);
  assert.throws(()=>parseLocalTime("2026-02-30","%Y-%m-%d"),/Invalid/);
  assert.throws(()=>parseLocalTime("31/13/2026","%d/%m/%Y"),/Invalid/);
  assert.throws(()=>parseLocalTime("2026-10-10 25:01","%Y-%m-%d %H:%M"),/Invalid/);
  assert.equal(parseLocalTime("10/10/2026 01:30","%d/%m/%Y %H:%M")!
    .sub(parseLocalTime("2026-10-10 00:00","%Y-%m-%d %H:%M")!).div(60).toString(),"90");
});
test("fixed units and comma decimals apply through the adapter",()=>{
  const m=structuredClone(mapping);
  m.format.decimal_separator=",";
  m.files.records!.fixed_unit="t";
  const input=replace(files(),"records.csv",'Record,Order,Input,Good,Scrap,Unit,Date,Shift\nR1,A,"0,01","0,009","0,001",ignored,2026-10-10,day\nR2,B,"0,01","0,008","0,002",ignored,2026-10-10,night');
  const r=calculateFiles(input,m);
  assert.equal(r.runs.A.volume.input_kg,"10");
  assert.equal(r.runs.A.volume.scrap_rate_pct,"10");
  assert.deepEqual(r.runs.A.issues,["UNIT_CONVERTED:info"]);
});
test("mapped columns are required; files and orphan orders fail explicitly",()=>{
  assert.throws(()=>csvAdapter.read(files().slice(1),mapping),/Missing source/);
  const m=structuredClone(mapping); m.files.records!.columns.input="Absent";
  assert.throws(()=>csvAdapter.read(files(),m),/mapped column/);
  const input=replace(files(),"records.csv","Record,Order,Input,Good,Scrap,Unit,Date,Shift\nR1,UNKNOWN,10,9,1,kg,2026-10-10,day");
  assert.throws(()=>calculateFiles(input,mapping),/Unknown order/);
});
test("canonical engine is deterministic and does not mutate adapter output",()=>{
  const canonical=csvAdapter.read(files(),mapping);
  const before=JSON.stringify(canonical);
  for(const r of [...canonical.records,...canonical.events]) Object.freeze(r);
  const first=calculate(canonical),second=calculate(canonical);
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(canonical),before);
});
test("required-field and invalid-time checks run before mapping/duplicate checks",()=>{
  const input=replace(files(),"events.csv","Event,Order,Code,Start,End,Reason\n,A,UNKNOWN,2026-10-10 02:00,2026-10-10 01:00,test\nE2,B,C,2026-10-10 00:00,2026-10-10 02:00,test");
  const r=calculateFiles(input,mapping);
  assert.ok(r.runs.A.issues.includes("MISSING_REQUIRED_FIELD:error"));
  assert.ok(!r.runs.A.issues.includes("INVALID_TIME_RANGE:error"));
  assert.ok(!r.runs.A.issues.includes("UNMAPPED_EVENT_CODE:warning"));
  assert.equal(r.runs.A.downtime.minutes,null);
});
