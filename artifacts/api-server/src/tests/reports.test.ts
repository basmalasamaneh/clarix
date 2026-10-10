import {test} from "node:test";
import assert from "node:assert/strict";
import {reportFilename,prepareReport} from "../reports/service";
import type {Context} from "../imports/service";
test("report filenames exclude punctuation, paths, Unicode controls and use a safe fallback",()=>{
  const id="11111111-1111-4111-8111-111111111111";
  assert.equal(reportFilename("../../ETHMAR\r\nPlastics",id,"ar"),`clarix-ethmar-plastics-${id}-ar.pdf`);
  assert.equal(reportFilename("المصنع",id,"en"),`clarix-factory-${id}-en.pdf`);
});
test("report preparation fails closed on oversize payloads/history and timeouts",async()=>{
  const make=(bytes:number,n=0,timeout=false)=>({factory:"isolated",user:"reader",db:{
    query:async(sql:string)=>{
      if(timeout)throw Object.assign(new Error("query cancelled"),{code:"57014"});
      if(sql.startsWith("SET"))return {rows:[]};
      if(sql.includes("AS bytes"))return {rows:[{bytes}]};
      return {rows:[{n,bytes:0}]};
    },
  }} as unknown as Context);
  for(const ctx of [make(2_000_001),make(100,101)])await assert.rejects(prepareReport(ctx,"id","en"),{code:"REPORT_TOO_LARGE",status:413});
  await assert.rejects(prepareReport(make(0,0,true),"id","ar"),{code:"REPORT_TIMEOUT",status:503});
});
