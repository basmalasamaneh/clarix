import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {formatQuantity,formatSentence,normalizeFixedText,normalizeSign,pluralCategory,splitSignedNumbers,unitWord,NBSP,MINUS} from "../src/lib/number-format";

const here=new URL(".",import.meta.url).pathname;
const VALUES=["0","1","2","3","10","11","100","0.75","-5","+5","+120","-50","-1","-2"];

test("formatQuantity matches the committed table snapshot (both languages, all units, cases/styles)",()=>{
  const snap=JSON.parse(readFileSync(here+"__snapshots__/number-format.json","utf8")) as Record<string,Record<string,string>>;
  for(const [k,row] of Object.entries(snap)) {
    const [lang,unit,style]=k.split(".") as ["en"|"ar","pp",string];
    for(const v of VALUES) assert.equal(formatQuantity(v,unit,lang,lang==="en"?{style:style as "short"}:{case:style as "nom"}),row[v],`${k} ${v}`);
  }
});
test("Arabic brief rules for نقطة مئوية / ساعة / دقيقة",()=>{
  const ar=(v:string,u:"pp"|"h"|"min")=>unitWord(v,u,"ar");
  assert.deepEqual(["1","2","3","10","11","100"].map(v=>ar(v,"pp")),["نقطة مئوية","نقطتان مئويتان","نقاط مئوية","نقاط مئوية","نقطة مئوية","نقطة مئوية"]);
  assert.deepEqual(["1","2","3","10","11"].map(v=>ar(v,"h")),["ساعة","ساعتان","ساعات","ساعات","ساعة"]);
  assert.deepEqual(["1","2","3","10","11"].map(v=>ar(v,"min")),["دقيقة","دقيقتان","دقائق","دقائق","دقيقة"]);
  assert.equal(unitWord("2","h","ar",{case:"gen"}),"ساعتين");
  assert.equal(unitWord("0.75","h","ar"),"ساعة");
  assert.equal(unitWord("-2","min","ar"),"دقيقتان");
});
test("English singular/plural",()=>{
  assert.deepEqual(["0","1","2","0.75","-1","11"].map(v=>unitWord(v,"h","en",{style:"long"})),["hours","hour","hours","hours","hour","hours"]);
  assert.equal(unitWord("1","pp","en",{style:"long"}),"percentage point");
  assert.equal(unitWord("1.0","min","en",{style:"long"}),"minute");
});
test("plural categories from strings, no floats",()=>{
  assert.deepEqual(VALUES.map(v=>pluralCategory(v,"ar")),["zero","one","two","few","few","many","other","other","few","few","many","many","one","two"]);
  assert.equal(pluralCategory("103","ar"),"few");
  assert.equal(pluralCategory("123456789012345678901234567890.5","ar"),"other");
});
test("every unit uses exactly one NBSP; percent too; spoken percent",()=>{
  for(const u of ["pp","h","min","kg","pct","count"] as const) for(const l of ["en","ar"] as const) {
    const s=formatQuantity("5",u,l); assert.equal(s.split(NBSP).length,2); assert.ok(!s.includes(" ")||u==="pp",s);
  }
  assert.equal(formatQuantity("10","pct","ar",{style:"long"}),`10${NBSP}بالمئة`);
  assert.equal(formatQuantity("10","pct","en",{style:"long"}),`10${NBSP}percent`);
});
test("signs: U+2212, digits preserved, no invisible characters",()=>{
  assert.equal(normalizeSign("-5"),`${MINUS}5`);
  assert.equal(normalizeSign("+120"),"+120");
  assert.equal(normalizeSign("-0.75"),`${MINUS}0.75`);
  assert.equal(normalizeSign("E-02"),"E-02");
  assert.equal(normalizeSign("2024-01-05"),"2024-01-05");
  const s=formatQuantity("-50","kg","ar");
  assert.ok(!/[\u200E\u200F\u2066-\u2069\u202A-\u202E]/.test(s));
  assert.equal(s.replace(MINUS,"-").replace(NBSP," "),"-50 كغ");
});
test("sentence splitting isolates signed numbers but never identifiers, dates or operators",()=>{
  const parts=splitSignedNumbers("E-02 −5 نقاط مئوية أعلى من E-01. 950 − 900 = -50 kg في 2024-01-05");
  assert.deepEqual(parts.filter(p=>p.kind==="signed").map(p=>p.value),[`${MINUS}5`,`${MINUS}50`]);
  assert.equal(formatSentence("+5 pp higher than Run A"),`+5${NBSP}pp higher than Run A`);
  assert.equal(formatSentence("events.csv:5 and E-02"),"events.csv:5 and E-02");
});
test("display-only normalisation of older fixed template text",()=>{
  assert.equal(normalizeFixedText("كانت نسبة الهدر في E-02 أعلى من E-01 بمقدار 2 نقاط مئوية.","ar"),`كانت نسبة الهدر في E-02 أعلى من E-01 بمقدار 2${NBSP}نقطتين مئويتين.`);
  assert.equal(normalizeFixedText("+5 نقطة مئوية أعلى من التشغيل أ","ar"),`+5${NBSP}نقاط مئوية أعلى من التشغيلة أ`);
  assert.equal(normalizeFixedText("الفرق = الدفعة ب − الدفعة أ","ar"),"الفرق = التشغيلة ب − التشغيلة أ");
  assert.equal(normalizeFixedText("تتطابق قيمة كلاريكس مع تقريرك","ar"),"تتطابق قيمة Clarix مع تقريرك");
  assert.equal(normalizeFixedText("higher than Run A by 2 minutes","en"),`higher than Run A by 2${NBSP}minutes`);
  assert.equal(normalizeFixedText("1 hours; -2 minute; 0.75 hour","en"),`1${NBSP}hour; -2${NBSP}minutes; 0.75${NBSP}hours`);
});
test("server copy of the helper is byte-identical",()=>{
  const a=readFileSync(here+"../src/lib/number-format.ts","utf8");
  const b=readFileSync(here+"../../api-server/src/metrics/number-format.ts","utf8");
  assert.equal(a,b);
});
