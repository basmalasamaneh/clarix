import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {calculateFiles,type Mapping} from "@workspace/calculation";
import type {RunComparison,ProductionRun} from "@workspace/api-zod";
import {runMetrics,differences} from "../metrics/values";
import {summary,questions} from "../metrics/i18n";
import {worstStatus} from "../imports/quality";
const root=fileURLToPath(new URL("../../../../test-data/",import.meta.url));
export function fixtureComparison(folder="ethmar-plastics/00_baseline"):RunComparison {
 const dir=root+folder,mapping:Mapping=JSON.parse(readFileSync(dir+"/mapping.json","utf8"));
 const files=readdirSync(dir).filter(f=>f.endsWith(".csv")).map(name=>({name,bytes:readFileSync(dir+"/"+name)}));
 const result=calculateFiles(files,mapping);
 const runs=Object.values(result.runs).slice(0,2).map((run,i)=>{
  const id=i===0?"11111111-1111-4111-8111-111111111111":"22222222-2222-4222-8222-222222222222";
  const identity={orderId:Object.keys(result.runs)[i],sourceName:"Synthetic baseline"};
  return {id,...identity,importId:id,date:null,dateRefs:[],capabilityLevel:mapping.capability_level,overall:run.overall,
   groups:{volume:run.volume.status,changeover:run.changeover.status,downtime:run.downtime.status},
   metrics:runMetrics(id,id,run,mapping,identity),issues:[]} as unknown as ProductionRun;
 });
 const [a,b]=runs, diff=differences(a,b);
 return {a,b,differences:diff,overall:worstStatus([a.overall,b.overall]),
  groups:{volume:worstStatus([a.groups.volume,b.groups.volume]),changeover:worstStatus([a.groups.changeover,b.groups.changeover]),downtime:worstStatus([a.groups.downtime,b.groups.downtime])},
  summary:summary(a,b,diff),questions:questions(a,b,diff),chart_spec:[],indicators:[],hasWarnings:false,hasBlockedGroups:false};
}
export function fixtureFolders(){
 return readdirSync(root).flatMap(factory=>readdirSync(root+factory,{withFileTypes:true})
  .filter(d=>d.isDirectory()).map(d=>`${factory}/${d.name}`));
}
