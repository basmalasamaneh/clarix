import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {CellReadError,D} from "@workspace/calculation";
import {importCpu} from "../imports/cpu-client";
const dir=fileURLToPath(new URL("../../../../test-data/ethmar-plastics/00_baseline/",import.meta.url));
const files=readdirSync(dir).filter(f=>f.endsWith(".csv")).map(name=>({name,bytes:readFileSync(dir+name)}));
const mapping=JSON.parse(readFileSync(dir+"mapping.json","utf8"));
for(const factory of ["ethmar-plastics","najm-packaging"]){
  const base=fileURLToPath(new URL(`../../../../test-data/${factory}/`,import.meta.url));
  for(const folder of readdirSync(base,{withFileTypes:true}).filter(x=>x.isDirectory())){
    const path=base+folder.name+"/";
    const inputs=readdirSync(path).filter(f=>f.endsWith(".csv")).map(name=>({name,bytes:readFileSync(path+name)}));
    const config=JSON.parse(readFileSync(path+"mapping.json","utf8"));
    test(`worker/direct equivalence: ${factory}/${folder.name}`,async()=>{
      const direct=await importCpu("calculate",inputs,config);
      const worker=await importCpu("calculate",inputs,config,true);
      assert.deepEqual(worker.result,direct.result);
      assert.deepEqual(worker.collected,direct.collected);
      assert.equal(JSON.stringify(worker.canonical),JSON.stringify(direct.canonical));
    });
  }
}
test("worker keeps exact engine results, Decimal instances, samples and original cells",async()=>{
  const direct=await importCpu("calculate",files,mapping);
  const worker=await importCpu("calculate",files,mapping,true);
  assert.deepEqual(worker.result,direct.result);
  assert.deepEqual(worker.collected,direct.collected);
  assert.equal(JSON.stringify(worker.canonical),JSON.stringify(direct.canonical));
  assert.ok(worker.canonical.records[0].input instanceof D);
  assert.deepEqual(await importCpu("mapping",files,mapping,true),await importCpu("mapping",files,mapping));
  assert.deepEqual(await importCpu("inspect",[files[0]],undefined,true),await importCpu("inspect",[files[0]]));
});
test("worker preserves typed source-cell validation errors",async()=>{
  const bad=files.map(f=>({...f,bytes:Buffer.from(f.bytes.toString().replace("600,570,30","not-a-number,570,30"))}));
  // Locate the numeric cell by the actual fixture header rather than assuming
  // its baseline quantity.
  const record=bad.find(f=>f.name===mapping.files.records.file)!;
  const rows=record.bytes.toString().split("\n"),header=rows[0].split(",");
  const cells=rows[1].split(",");cells[header.indexOf(mapping.files.records.columns.input)]="not-a-number";rows[1]=cells.join(",");
  record.bytes=Buffer.from(rows.join("\n"));
  await assert.rejects(importCpu("calculate",bad,mapping,true),e=>e instanceof CellReadError);
});
