import "../testing/require-isolation";
import {test} from "node:test";
import assert from "node:assert/strict";
import {formatted,differences} from "../metrics/values";
import type {ProductionRun} from "@workspace/api-zod";
import {runLabels} from "../metrics/i18n";
test("summary names qualify only different sources, including identical order IDs",()=>{
  const a={orderId:"E-01",sourceName:"ERP"} as ProductionRun;
  assert.deepEqual(runLabels(a,{...a,orderId:"E-02"}),["E-01","E-02"]);
  assert.deepEqual(runLabels(a,{...a,sourceName:"Other"}),["E-01 [ERP]","E-01 [Other]"]);
  assert.deepEqual(runLabels(a,{...a,orderId:"E-02",sourceName:"Other"}),["E-01 [ERP]","E-02 [Other]"]);
});
test("metric displays use exact decimal subtraction and half-up; missing stays null",()=>{
  assert.equal(formatted("1.25","pct"),"1.3");
  assert.equal(formatted("-1.25","pp",true),"-1.3");
  assert.equal(formatted(null,"kg"),null);
  assert.equal(formatted("0","min"),"0");
  const a={metrics:Array.from({length:8},()=>({value:"0.1",status:"green",refs:[]}))} as unknown as ProductionRun;
  const b={metrics:Array.from({length:8},()=>({value:"0.3",status:"green",refs:[]}))} as unknown as ProductionRun;
  assert.equal(differences(a,b)[0].value,"0.2");
  assert.equal(differences(a,b)[0].display,"+0.2");
  a.metrics[0].value=null;
  assert.equal(differences(a,b)[0].value,null);
});
