import "../testing/require-isolation";
import {test} from "node:test";
import assert from "node:assert/strict";
import {severityStatus,worstStatus} from "../imports/quality";
test("quality severity mapping and worst group/overall",()=>{
  assert.equal(severityStatus("info"),"green");
  assert.equal(severityStatus("warning"),"yellow");
  assert.equal(severityStatus("error"),"red");
  assert.equal(worstStatus([]),"green");
  for(const a of ["green","yellow","red"] as const)
    for(const b of ["green","yellow","red"] as const)
      for(const c of ["green","yellow","red"] as const)
        assert.equal(worstStatus([a,b,c]),[a,b,c].includes("red")?"red":[a,b,c].includes("yellow")?"yellow":"green");
});
