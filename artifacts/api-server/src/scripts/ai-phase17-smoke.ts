import {mkdir,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {GeminiProvider} from "../ai/provider";
import {buildFacts,validateAnswer} from "../ai/facts";
import {fixtureComparison} from "../testing/ai-fixtures";
import {routeCandidates} from "../ai/intents";
import {validateChoice,validateRank} from "../ai/assist";
if(!process.argv.includes("--three-synthetic-calls"))throw new Error("Explicit synthetic-only confirmation required");
const p=new GeminiProvider(),dir=fileURLToPath(new URL("../../../../generated-artifacts/phase17/",import.meta.url));
await mkdir(dir,{recursive:true});
const comparison=fixtureComparison(),built=buildFacts(comparison,"en");
const route=routeCandidates("أي تشغيلة أعلى نسبة الهدر",[],{task:"ask",language:"ar"})!;
const cases=[
 {task:"explanation",input:{facts:built.packed,language:"en" as const},valid:(v:unknown)=>!!validateAnswer(v,built.packed)},
 {task:"issue-ranking",input:{mode:"rank" as const,language:"en" as const,
  facts:{ids:["issue-a","issue-b"],items:[{id:"issue-a",code:"MISSING_VALUE",severity:"error"},{id:"issue-b",code:"UNIT_CONVERTED",severity:"info"}]}},
  valid:(v:unknown)=>!!validateRank(v,["issue-a","issue-b"])},
 {task:"arabic-question",input:{mode:"intent" as const,language:"ar" as const,question:route.question,
  facts:{candidates:route.candidates.map((c,i)=>({choice:i,intent:c.intent??"unsupported",parameters:c}))}},
  valid:(v:unknown)=>validateChoice(v,2)===0},
];
const results=[];
for(const item of cases){
 if(!p.configured){results.push({task:item.task,status:"SKIPPED",reason:"Provider is not configured",calls:0});continue;}
 const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await p.generate(item.input,controller.signal);
  results.push({task:item.task,status:item.valid(r.output)?"PASS":"FAIL",calls:1,latencyMs:Date.now()-start,tokens:r.tokens??null});
 }catch{results.push({task:item.task,status:"FAIL",reason:"Provider request failed",calls:1,latencyMs:Date.now()-start});}
 finally{clearTimeout(timer);}
}
const report={model:p.model,syntheticOnly:true,results};
await writeFile(dir+"live-smoke.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
