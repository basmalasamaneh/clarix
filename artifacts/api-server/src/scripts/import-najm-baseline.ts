// One explicitly authorised development operation, not an automated test.
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {withTenant,getMemberships,closeTenantPools} from "../lib/tenancy";
import {pool} from "@workspace/db";
if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1"||
   !process.argv.includes("--confirm-najm-baseline")) throw Error("Development-only, explicit confirmation required");
const root=fileURLToPath(new URL("../../../../",import.meta.url));
const folder=root+"test-data/najm-packaging/00_baseline/";
const mapping=JSON.parse(readFileSync(folder+"mapping.json","utf8"));
mapping.format.delimiter=";";
let cookie="",csrf="";
const base=`https://${process.env.REPLIT_DEV_DOMAIN}`;
async function api(path:string,method="GET",body?:unknown,expected=200):Promise<any> {
  const r=await fetch(base+"/api"+path,{method,headers:{cookie,"X-CSRF-Token":csrf,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  for(const value of r.headers.getSetCookie())if(value.startsWith("clarix.sid="))cookie=value.split(";")[0];
  const data:any=r.status===204?null:await r.json();
  if(r.status!==expected)throw Error(`Baseline operation failed: ${method} ${path.split("?")[0]} HTTP ${r.status}`);
  if(data?.csrfToken)csrf=data.csrfToken;
  return data;
}
const evidence:any={purpose:"Explicitly authorised one-time Najm development baseline import"};
const tables=["imports","raw_rows","orders","production_records","events","data_issues","column_mappings","orders_history","production_records_history","events_history"];
async function snapshot(user:string,factory:string) {
  return withTenant(user,factory,async c=>{
    const result:Record<string,unknown>={};
    for(const table of tables)result[table]=(await c.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id::text),'')) AS fingerprint
      FROM ${table} t WHERE factory_id=$1`,[factory])).rows[0];
    return result;
  });
}
const output=root+"generated-artifacts/phase9/intentional-najm-baseline";
mkdirSync(output,{recursive:true});
try {
  const eth=(await getMemberships("test-manager"))[0],najm=(await getMemberships("test-najm"))[0];
  if(!eth||najm?.factoryName!=="Najm Packaging")throw Error("Expected development memberships not found");
  evidence.before={ethmar:await snapshot("test-manager",eth.factoryId),najm:await snapshot("test-najm",najm.factoryId)};
  await api("/auth/session");
  const session=await api("/auth/login","POST",{email:"najm.manager@clarix.test",password:process.env.SEED_TEST_PASSWORD});
  if(session.activeFactoryId!==najm.factoryId)throw Error("Unexpected active factory");
  const existing=await api("/runs");
  if(existing.total>0)throw Error("Najm already has runs; refusing to replace existing development data");
  const files=readdirSync(folder).filter(n=>n.endsWith(".csv")).map(name=>({name,bytes:readFileSync(folder+name)}));
  const draft=await api("/imports","POST",{sourceName:mapping.source_name,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))},201);
  evidence.importId=draft.id;
  for(const f of files) {
    const r=await fetch(draft.files.find((v:any)=>v.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)});
    if(!r.ok)throw Error("Baseline object upload failed");
  }
  await api(`/imports/${draft.id}/finalize`,"POST");
  await api(`/imports/${draft.id}/mapping`,"PUT",{mapping});
  await api(`/imports/${draft.id}/check`,"POST");
  const approved=await api(`/imports/${draft.id}/approve`,"POST",{confirmReplacement:true,replacementCount:0,confirmErrors:false});
  if(approved.status!=="approved")throw Error("Baseline was not approved");
  await api("/import-templates","POST",{name:"Najm baseline CSV",sourceName:mapping.source_name,mapping},201);
  evidence.sourceName=mapping.source_name;
  evidence.after={ethmar:await snapshot("test-manager",eth.factoryId),najm:await snapshot("test-najm",najm.factoryId)};
  evidence.ethmarUnchanged=JSON.stringify(evidence.before.ethmar)===JSON.stringify(evidence.after.ethmar);
  if(!evidence.ethmarUnchanged)throw Error("Unexpected Ethmar data change");
  evidence.completed=true;
  await api("/auth/logout","POST",undefined,204);
  console.log("Intentional Najm baseline approved; Ethmar import-data fingerprints unchanged.");
} finally {
  writeFileSync(output+"/evidence.json",JSON.stringify(evidence,null,2));
  await closeTenantPools();await pool.end();
}
