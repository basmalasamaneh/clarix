import "../testing/require-isolation";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {performance,monitorEventLoopDelay} from "node:perf_hooks";
import {spawn} from "node:child_process";
import {pool as admin} from "@workspace/db/admin";
import {withTenant,closeTenantPools} from "../lib/tenancy";
import {calculateFiles,parseCsv,type Mapping} from "@workspace/calculation";
import app from "../app";
import {sessionStore} from "../lib/session";
const root=fileURLToPath(new URL("../../../../",import.meta.url));
const mapping=JSON.parse(readFileSync(root+"test-data/ethmar-plastics/00_baseline/mapping.json","utf8")) as Mapping;
const out=root+"generated-artifacts/phase9/scale-"+new Date().toISOString().replaceAll(":","-");
mkdirSync(out,{recursive:true});
const evidence:any={syntheticFactories:20,samples:{},queries:[],phases:[],targetsMs:{runs:1000,comparison:1000,quality:1500,drawer:1000,import:60000}};
const save=()=>writeFileSync(out+"/measurements.json",JSON.stringify(evidence,null,2));
const server=app.listen(0,"127.0.0.1");
await new Promise<void>(r=>server.listening?r():server.once("listening",r));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
after(async()=>{save();sessionStore.close();await new Promise<void>(r=>server.close(()=>r()));await closeTenantPools();await admin.end();});
type Client={cookie:string;csrf:string};
async function http(c:Client,path:string,method="GET",body?:unknown,expected=200) {
  const r=await fetch(base+"/api"+path,{method,headers:{cookie:c.cookie,"X-CSRF-Token":c.csrf,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  for(const cookie of r.headers.getSetCookie()) if(cookie.startsWith("clarix.sid=")) c.cookie=cookie.split(";")[0];
  const json:any=r.status===204?null:await r.json();
  assert.equal(r.status,expected,`${method} ${path.split("?")[0]} status`);
  if(json?.csrfToken)c.csrf=json.csrfToken;
  return json;
}
async function login(n:number) {
  const c={cookie:"",csrf:""};
  await http(c,"/auth/session");
  await http(c,"/auth/login","POST",{email:`scale-${n}@example.test`,password:process.env.SEED_TEST_PASSWORD});
  return c;
}
function files(n:number,version=0) {
  const orders=["order_id,product_code,line_id,machine_id,mold_id"];
  for(let i=0;i<100;i++)orders.push(`S-${i},P-${i},L-1,M-1,D-1`);
  const records=["record_id,order_id,machine_id,mold_id,shift,record_date,material_input,good_output,scrap,unit"];
  for(let i=0;i<n;i++) records.push(`PR-${version}-${i},S-${i%100},M-1,D-1,shift-${i},2026-01-01,100,95,5,kg`);
  const events=["event_id,order_id,machine_id,mold_id,shift,event_code,start_time,end_time,duration_min,recorded_reason"];
  const stamp=(minute:number)=>new Date(Date.UTC(2026,0,1,0,minute)).toISOString().slice(0,16).replace("T"," ");
  for(let i=0;i<5000;i++)events.push(`EV-${version}-${i},S-${i%100},M-1,D-1,shift-${i},CHG,${stamp(i*10)},${stamp(i*10+5)},5,Synthetic`);
  return [orders,records,events].map((lines,i)=>({name:["orders.csv","production_records.csv","events.csv"][i],bytes:Buffer.from(lines.join("\n")+"\n")}));
}
function quantiles(values:number[]) {
  const s=[...values].sort((a,b)=>a-b);
  return {n:s.length,p50Ms:s[Math.ceil(s.length*.5)-1]??null,p95Ms:s[Math.ceil(s.length*.95)-1]??null,maxMs:s.at(-1)??null};
}
test("isolated 20-factory scale measurements",async()=>{
  // Setup identities is privileged; all factory production writes below use RLS.
  await admin.query("BEGIN");
  await admin.query("ALTER TABLE factories NO FORCE ROW LEVEL SECURITY; ALTER TABLE memberships NO FORCE ROW LEVEL SECURITY");
  for(let n=0;n<20;n++) {
    await admin.query("INSERT INTO users(id,email,name,password_hash,test_account) SELECT $1,$2,$3,password_hash,true FROM users WHERE id='test-manager'",[`scale-user-${n}`,`scale-${n}@example.test`,`Synthetic manager ${n}`]);
    await admin.query("INSERT INTO factories(id,name,default_language,settings,status) VALUES($1,$2,'en','{}','active')",[`scale-${n}`,`Synthetic factory ${n}`]);
    await admin.query("INSERT INTO memberships(user_id,factory_id,role) VALUES($1,$2,'factory_manager')",[`scale-user-${n}`,`scale-${n}`]);
  }
  await admin.query("ALTER TABLE factories FORCE ROW LEVEL SECURITY; ALTER TABLE memberships FORCE ROW LEVEL SECURITY; COMMIT");
  // 150,000 rows across 19 smaller factories; target factory receives its 50,000
  // through the real HTTP import pipeline, not this setup path.
  for(let n=1;n<20;n++) {
    const count=7894+(n<=14?1:0),input=files(count),result=calculateFiles(input,mapping),id=randomUUID();
    await withTenant(`scale-user-${n}`,`scale-${n}`,async c=>{
      await c.query(`INSERT INTO imports(id,factory_id,source_name,file_names,content_hash,uploaded_by,mapping,result,status,approved_at)
        VALUES($1,$2,'synthetic','[]',$3,$4,$5,$6,'approved',now())`,
        [id,`scale-${n}`,createHash("sha256").update(input[1].bytes).digest("hex"),`scale-user-${n}`,JSON.stringify(mapping),JSON.stringify(result)]);
      for(const f of input) {
        const rows=parseCsv(f.bytes.toString(),",").rows.map(r=>({line:r.line,cells:r.cells}));
        await c.query(`INSERT INTO raw_rows(factory_id,source_name,import_id,file,line_number,record_end_line,cells)
          SELECT $1,'synthetic',$2,$3,x.line,x.line,x.cells FROM jsonb_to_recordset($4::jsonb) AS x(line int,cells jsonb)`,[`scale-${n}`,id,f.name,JSON.stringify(rows)]);
      }
      for(const [order,metrics] of Object.entries(result.runs))
        await c.query("INSERT INTO orders(factory_id,source_name,source_order_id,current_import_id,metrics) VALUES($1,'synthetic',$2,$3,$4)",[`scale-${n}`,order,id,JSON.stringify(metrics)]);
      await c.query(`INSERT INTO production_records(factory_id,source_name,record_id,order_id,shift,date,input,good,scrap,unit,raw_row_id)
        SELECT r.factory_id,r.source_name,r.cells->>'record_id',o.id,r.cells->>'shift',(r.cells->>'record_date')::date,100,95,5,'kg',r.id
        FROM raw_rows r JOIN orders o ON o.factory_id=r.factory_id AND o.source_name=r.source_name AND o.source_order_id=r.cells->>'order_id'
        WHERE r.factory_id=$1 AND r.import_id=$2 AND r.file='production_records.csv'`,[`scale-${n}`,id]);
      await c.query(`INSERT INTO events(factory_id,source_name,event_id,order_id,event_code,type,start,"end",duration_min,reason,raw_row_id)
        SELECT r.factory_id,r.source_name,r.cells->>'event_id',o.id,'CHG','CHANGEOVER',(r.cells->>'start_time')::timestamp,
        (r.cells->>'end_time')::timestamp,5,'Synthetic',r.id
        FROM raw_rows r JOIN orders o ON o.factory_id=r.factory_id AND o.source_name=r.source_name AND o.source_order_id=r.cells->>'order_id'
        WHERE r.factory_id=$1 AND r.import_id=$2 AND r.file='events.csv'`,[`scale-${n}`,id]);
    });
    evidence.phases.push(`seeded synthetic factory ${n}`);save();
  }
  const c=await login(0),other=await login(1);
  const importTimes:number[]=[];
  for(let attempt=0;attempt<3;attempt++) {
    const input=files(50000,attempt),started=performance.now(),delays=monitorEventLoopDelay({resolution:10});
    const probe=spawn(process.execPath,["-e",`
      let stop=false;process.on('message',()=>{stop=true});
      (async()=>{const samples=[];while(!stop){const t=performance.now();try{const r=await fetch(process.env.PROBE_URL,{headers:{cookie:process.env.PROBE_COOKIE}});await r.arrayBuffer();samples.push({ms:performance.now()-t,status:r.status});}catch{samples.push({ms:performance.now()-t,status:0})}await new Promise(r=>setTimeout(r,100));}
      process.send(samples);process.disconnect();})();`],{env:{...process.env,PROBE_URL:base+"/api/runs",PROBE_COOKIE:other.cookie},stdio:["ignore","ignore","ignore","ipc"]});
    delays.enable();
    try {
      const draft=await http(c,"/imports","POST",{sourceName:"scale-target",files:input.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))},201);
      for(const f of input) {
        const response=await fetch(draft.files.find((x:any)=>x.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)});
        assert.ok(response.ok,"synthetic object upload");
      }
      await http(c,`/imports/${draft.id}/finalize`,"POST");
      await http(c,`/imports/${draft.id}/mapping`,"PUT",{mapping});
      await http(c,`/imports/${draft.id}/check`,"POST");
      await http(c,`/imports/${draft.id}/approve`,"POST",{confirmErrors:true,confirmReplacement:true,replacementCount:attempt?100:0});
      importTimes.push(performance.now()-started);
    } finally {
      delays.disable();
      const samples=await new Promise<any[]>(resolve=>{probe.once("message",x=>resolve(x as any[]));probe.send("stop");});
      evidence.phases.push({importAttempt:attempt,eventLoopMaxMs:delays.max/1e6,otherUser:quantiles(samples.map(s=>s.ms)),otherUserStatuses:[...new Set(samples.map(s=>s.status))]});
      evidence.samples.import=quantiles(importTimes);save();
    }
  }
  const runs=await http(c,"/runs");
  assert.equal(runs.items.length<=20,true,"runs page bounded");
  const a=runs.items[0].id,b=runs.items[1].id;
  for(const [name,path] of Object.entries({runs:"/runs",comparison:`/comparison?a=${a}&b=${b}`,quality:"/quality",drawer:`/source-detail?kind=metric&id=${a}&metric=input_kg&page=1`})) {
    const samples:number[]=[];
    for(let i=0;i<30;i++){const t=performance.now();await http(c,path);samples.push(performance.now()-t);}
    evidence.samples[name]=quantiles(samples);save();
  }
  const logins:number[]=[];
  for(let i=0;i<20;i++){const t=performance.now();await login(0);logins.push(performance.now()-t);}
  evidence.samples.login=quantiles(logins);
  // Exact current counts; superseded versions from repeated imports remain history.
  await admin.query("BEGIN");
  await admin.query("ALTER TABLE production_records NO FORCE ROW LEVEL SECURITY; ALTER TABLE events NO FORCE ROW LEVEL SECURITY");
  evidence.counts=(await admin.query(`SELECT (SELECT count(*)::int FROM production_records WHERE factory_id LIKE 'scale-%') AS production,
    (SELECT count(*)::int FROM events WHERE factory_id LIKE 'scale-%') AS events,
    (SELECT count(*)::int FROM production_records WHERE factory_id='scale-0') AS largest`)).rows[0];
  await admin.query("ROLLBACK");
  assert.deepEqual(evidence.counts,{production:200000,events:100000,largest:50000});
  await withTenant("scale-user-0","scale-0",async client=>{
    for(const [name,sql,args] of [
      ["run dates","SELECT order_id,min(date) FROM production_records WHERE factory_id=$1 GROUP BY order_id",["scale-0"]],
      ["source rows","SELECT id,cells FROM raw_rows WHERE factory_id=$1 AND import_id=(SELECT current_import_id FROM orders WHERE id=$2) ORDER BY file,line_number LIMIT 20",["scale-0",a]],
      ["quality","SELECT id FROM data_issues WHERE factory_id=$1 ORDER BY id LIMIT 20",["scale-0"]],
    ] as const) evidence.queries.push({name,plan:(await client.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+sql,[...args])).rows[0]["QUERY PLAN"]});
  });
  evidence.completed=true;save();
  console.log("Scale evidence saved; timings are measurements, not target assertions.");
});
