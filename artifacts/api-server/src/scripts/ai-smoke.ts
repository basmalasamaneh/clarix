// Explicit opt-in single call; never run by the test suite or application.
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {GeminiProvider,ProviderError} from "../ai/provider";
import {buildFacts,validateAnswer} from "../ai/facts";
import {fixtureComparison} from "../testing/ai-fixtures";
const out=resolve("../../generated-artifacts/phase16"),p=new GeminiProvider(),started=Date.now();
let evidence:Record<string,unknown>={status:"SKIPPED",reason:"not configured",model:p.model,calls:0,latencyMs:0,tokens:null};
if(p.configured&&process.argv.includes("--one-synthetic-call")){
 const data=buildFacts(fixtureComparison(),"en");
 try{
  const r=await p.generate({facts:data.packed,language:"en"},AbortSignal.timeout(30000));
  evidence={status:validateAnswer(r.output,data.packed)?"PASS":"FAIL",reason:"structured output validation",model:p.model,calls:1,latencyMs:Date.now()-started,tokens:r.tokens??null};
 }catch(e){
  evidence={status:"FAIL",reason:e instanceof ProviderError?e.kind:"request failed",model:p.model,calls:1,latencyMs:Date.now()-started,tokens:null};
 }
}
await mkdir(out,{recursive:true});await writeFile(resolve(out,"live-smoke.json"),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence)); // Metadata only, no body, token or key.
