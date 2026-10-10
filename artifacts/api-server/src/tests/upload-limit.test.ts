import {test} from "node:test";
import assert from "node:assert/strict";
import {inspect,ImportError} from "../imports/model";
test("upload row limit is inclusive and preserves a friendly error code",()=>{
  assert.equal(inspect(Buffer.from("id,value\n"+"a,1\n".repeat(100_000)),"rows.csv").table.rows.length,100_000);
  assert.throws(()=>inspect(Buffer.from("id,value\n"+"a,1\n".repeat(100_001)),"rows.csv"),
    (e:unknown)=>e instanceof ImportError&&e.code==="TOO_MANY_ROWS"&&e.status===413);
});
