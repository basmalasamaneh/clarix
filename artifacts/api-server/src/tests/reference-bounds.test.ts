import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {Mapping} from "@workspace/calculation";
import {references} from "../metrics/values";
test("run responses bound reference previews without modifying full stored references",()=>{
  const mapping=JSON.parse(readFileSync(new URL("../../../../test-data/ethmar-plastics/00_baseline/mapping.json",import.meta.url),"utf8")) as Mapping;
  const lines=Array.from({length:5000},(_,i)=>`production_records.csv:${i+2}`);
  const refs=references("run","import",mapping,lines,["input"],"included",{sourceName:"Synthetic",orderId:"S-1"});
  assert.equal(refs.length,20);
  assert.equal(refs[0].column,"material_input");
  assert.equal(refs.at(-1)?.line,21);
  assert.equal(lines.length,5000);
});
