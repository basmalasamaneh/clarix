import {Worker} from "node:worker_threads";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {setImmediate} from "node:timers/promises";
import {D,CellReadError,type Mapping,type SourceFile} from "@workspace/calculation";
import {ImportError} from "./model";
import {cpuWork} from "./cpu-work";
let activeWorkers=0;
export async function importCpu(action:"inspect"|"mapping"|"calculate",files:SourceFile[],mapping?:Mapping,forceWorker=false):Promise<any>{
  if(!forceWorker && files.reduce((n,f)=>n+f.bytes.byteLength,0)<1_000_000)return cpuWork(action,files,mapping);
  // Refuse excess heavy work instead of exhausting memory or reserving every
  // database connection behind an in-process queue.
  if(activeWorkers>=2)throw new ImportError("IMPORT_BUSY",503);
  const built=import.meta.url.endsWith(".mjs");
  const url=new URL(built?"./engine-worker.mjs":"./engine-worker.ts",import.meta.url);
  const options={workerData:{action,files,mapping},env:{NODE_ENV:process.env.NODE_ENV??"development"},resourceLimits:{maxOldGenerationSizeMb:512}};
  const worker=built?new Worker(url,options):new Worker(
    `require(${JSON.stringify(createRequire(import.meta.url).resolve("tsx/cjs/api"))}).register();require(${JSON.stringify(fileURLToPath(url))});`,
    {...options,eval:true});
  activeWorkers++;
  const value=await new Promise<any>((resolve,reject)=>{
    const timer=setTimeout(()=>{void worker.terminate();reject(new ImportError("IMPORT_CPU_TIMEOUT",503));},60000);
    worker.once("error",e=>{clearTimeout(timer);reject(e);});
    worker.once("exit",()=>{clearTimeout(timer);reject(new ImportError("IMPORT_CPU_FAILED",503));});
    worker.once("message",message=>{
      clearTimeout(timer);void worker.terminate();
      if(message.error){
        const e=Object.assign(new Error(message.error.message),message.error.fields);
        if(message.error.kind==="cell")Object.setPrototypeOf(e,CellReadError.prototype);
        if(message.error.kind==="import")Object.setPrototypeOf(e,ImportError.prototype);
        reject(e);
      } else resolve(JSON.parse(message.json));
    });
  }).finally(()=>{activeWorkers--;});
  if(action==="calculate"){
    // Preserve the engine's dictionary semantics, including hostile-looking
    // source IDs such as "__proto__", across the JSON transport boundary.
    Object.setPrototypeOf(value.result.runs,null);
    Object.setPrototypeOf(value.result.event_reasons,null);
    const canonical=value.canonical;
    const rows=[...canonical.records,...canonical.events,...canonical.totals.map((t:any)=>t.record),...canonical.totals];
    for(let i=0;i<rows.length;i++){
      for(const field of ["input","good","scrap","start","end","duration","hours","downtime"])
        if(rows[i][field]!==undefined && rows[i][field]!==null)rows[i][field]=new D(rows[i][field]);
      if(i%1000===999)await setImmediate();
    }
  }
  return value;
}
