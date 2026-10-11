import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import type {DemoFactoryCreation} from "@workspace/api-zod";
import {demoDatasets} from "./demo-data";
import {factoryView,issue,platformAudit} from "./service";
import {create,getRow,finalize,saveMapping,check,type Context} from "../imports/service";
import {approve} from "../imports/approval";
import {fileStorage} from "../imports/storage";

export async function createDemo(c:PoolClient,actor:string,input:DemoFactoryCreation){
  const id="demo-"+randomUUID();
  // This capability marker exists only inside this uncommitted transaction.
  // No users, memberships or permissions are manufactured for the admin.
  await c.query("INSERT INTO factories(id,name,default_language,settings,created_at) VALUES($1,$2,$3,$4,now())",
    [id,`DEMO — ${input.name.trim()}`,input.defaultLanguage,JSON.stringify({demo:true,demoProvisioning:actor})]);
  await c.query("SELECT set_config('app.factory_id',$1,true)",[id]);
  const ctx:Context={db:c,factory:id,user:actor,settings:{demo:true}};
  for(const dataset of demoDatasets){
    const files=Object.entries(dataset.files).map(([name,text])=>({name,bytes:Buffer.from(text)}));
    const draft=await create(ctx,{sourceName:dataset.source,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});
    let row=await getRow(ctx,draft.id);
    for(const f of row.files)await fileStorage.preserve(f.stage,files.find(x=>x.name===f.name)!.bytes);
    await finalize(ctx,row);
    row=await getRow(ctx,draft.id);await saveMapping(ctx,row,dataset.mapping);
    row=await getRow(ctx,draft.id);await check(ctx,row);
    row=await getRow(ctx,draft.id);await approve(ctx,row,{replacementCount:0,confirmReplacement:false,confirmErrors:true});
  }
  await c.query("UPDATE factories SET settings=settings-'demoProvisioning' WHERE id=$1",[id]);
  await platformAudit(c,id,actor,"demo_factory_created",null,{synthetic:true,datasets:2});
  if(input.managerEmail)return issue(c,id,actor,input.managerEmail.trim().toLowerCase());
  return {factory:await factoryView(c,id),path:null,expiresAt:null};
}
