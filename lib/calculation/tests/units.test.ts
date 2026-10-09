import { test } from "node:test";
import assert from "node:assert/strict";
import { D, fmt, displayNumber, displaySigned, minutesToHoursDisplay } from "../src";

const cases: [string,()=>unknown,unknown][]=[
  ["1 tonne = 1000 kg",()=>new D("1").mul("1000").toString(),"1000"],
  ["1000 lb = 453.59237 kg",()=>new D("1000").mul("0.45359237").toString(),"453.59237"],
  ["fmt trims zeros",()=>[fmt("10.00"),fmt("1E+1"),fmt("0.0")],["10","10","0"]],
  ["fmt negative",()=>fmt("-2.50"),"-2.5"],
  ["percent exact 50/1000",()=>new D(50).div(1000).mul(100).toString(),"5"],
  ["display 5",()=>displayNumber("5"),"5"],
  ["display 7.5",()=>displayNumber("7.5"),"7.5"],
  ["display 6.65 rounds half up",()=>displayNumber("6.65"),"6.7"],
  ["display 6.666",()=>displayNumber("6.666"),"6.7"],
  ["signed +5",()=>displaySigned("5"),"+5"],
  ["signed -2",()=>displaySigned("-2"),"-2"],
  ["signed zero",()=>displaySigned("0"),"0"],
  ["120 min to hours",()=>minutesToHoursDisplay("120"),"2"],
  ["45 min to hours",()=>minutesToHoursDisplay("45"),"0.75"],
  ["150 min to hours",()=>minutesToHoursDisplay("150"),"2.5"],
];
for(const [name,fn,expected] of cases) test(`reference unit: ${name}`,()=>assert.deepEqual(fn(),expected));
test("precision 28 and no global decimal mutation",()=>{
  assert.equal(D.precision,28);
  assert.equal(new D("0.1").add("0.2").toString(),"0.3");
  assert.equal(new D(1).div(3).toString(),"0.3333333333333333333333333333");
  assert.equal(displayNumber("-6.65"),"-6.7");
  assert.equal(displaySigned("-0.01"),"0");
  assert.equal(fmt(null),null);
});
