import "../testing/require-isolation";
import pg from "pg";
import {Session} from "node:inspector";
import {performance} from "node:perf_hooks";
// Verification-only instrumentation. SQL bindings, HTTP bodies, cookies and
// credentials are never collected. Application/engine behavior is unchanged.
export const profile={stages:[] as any[],sql:{} as Record<string,{count:number;ms:number}>};
let stage="setup";
const original=pg.Client.prototype.query;
(pg.Client.prototype as any).query=function(...args:any[]) {
  const text=typeof args[0]==="string"?args[0]:args[0]?.text??"";
  const key=stage+" | "+text.replace(/\s+/g," ").slice(0,180);
  const start=performance.now();
  const result=(original as any).apply(this,args);
  if(result?.then)return result.then((value:any)=>{
    const row=profile.sql[key]??={count:0,ms:0};
    row.count++;row.ms+=performance.now()-start;
    return value;
  });
  return result;
};
export async function timed<T>(name:string,fn:()=>Promise<T>) {
  const before=stage;stage=name;const start=performance.now();
  try{return await fn();}finally{profile.stages.push({name,ms:performance.now()-start});stage=before;}
}
const session=new Session();
const post=(method:string)=>new Promise<any>((resolve,reject)=>session.post(method as any,(e,r)=>e?reject(e):resolve(r)));
export async function startCpu(){session.connect();await post("Profiler.enable");await post("Profiler.start");}
export async function stopCpu(){
  const {profile:p}=await post("Profiler.stop");session.disconnect();
  const nodes=new Map<number,any>(p.nodes.map((n:any)=>[n.id,n]));
  const totals=new Map<string,number>();
  p.samples.forEach((id:number,i:number)=>{
    const n=nodes.get(id),f=n.callFrame;
    const key=`${f.functionName||"(anonymous)"} ${f.url}:${f.lineNumber+1}`;
    totals.set(key,(totals.get(key)??0)+(p.timeDeltas[i]??0)/1000);
  });
  return [...totals].map(([frame,selfMs])=>({frame,selfMs})).sort((a,b)=>b.selfMs-a.selfMs);
}
