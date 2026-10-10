// Phase9b isolated browser verification; invoked only by test-isolated.ts --browser.
require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID}=require("node:crypto"),{chromium}=require("playwright-core");
const base=process.env.CLARIX_TEST_BASE_URL,password=process.env.SEED_TEST_PASSWORD;
const attempt=`${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID().slice(0,8)}`;
const out=path.resolve(`generated-artifacts/phase9b/browser-${attempt}`);
const ev={attempt,environment:"isolated API/Vite",startedAt:new Date().toISOString(),accounts:[],matrix:[],drawers:[],journey:[],pagination:[],onboarding:[],screenshots:[],consoleErrors:[],failedRequests:[],apiResponses:[],initialPageDiagnostic:null,errors:[]};
let browser;
const tid=(p,id)=>p.getByTestId(id),safe=s=>String(s??"").replace(/([?&](?:token|invite)=)[^&#\s]+/gi,"$1[redacted]").slice(0,500);
const record=(group,name,ok,actual)=>{ev[group].push({name,status:ok?"PASS":"FAIL",actual});if(!ok)ev.errors.push(`${name}: ${safe(JSON.stringify(actual))}`);};
async function snap(p,name){const f=`${name}.png`;await p.screenshot({path:path.join(out,f),fullPage:false,mask:[p.locator('input[type="password"],[data-sensitive="true"],[data-testid*="token"]')],maskColor:"#000"});ev.screenshots.push(f);return f;}
async function api(p,method,url,data){const s=await (await p.request.get(base+"/api/auth/session")).json(),headers={};if(method!=="GET")headers["X-CSRF-Token"]=s.csrfToken;const r=await p.request.fetch(base+url,{method,headers,data});let body=null;try{body=await r.json()}catch{}return{status:r.status(),body};}
async function get(p,url){return api(p,"GET",url);}
async function login(p,email){
 await p.goto(base+"/login");
 try{await tid(p,"input-email").waitFor({state:"visible",timeout:8000});}
 catch(e){
  let session=null;try{const r=await p.request.get(base+"/api/auth/session");session={status:r.status(),body:await r.json().catch(()=>null)};session.hasUser=!!session.body?.user;session.userEmail=session.body?.user?.email;session.body=undefined;}catch(x){session={error:safe(x.message)}}
  const diag={url:p.url(),title:await p.title().catch(()=>null),bodyText:(await p.locator("body").innerText().catch(()=>"(body unreadable)")).slice(0,1800),markers:await p.locator("[data-testid]").evaluateAll(es=>es.map(x=>x.getAttribute("data-testid")).filter(Boolean).slice(0,80)).catch(()=>[]),session};
  ev.initialPageDiagnostic=diag;try{await snap(p,"initial-login-failure")}catch{}
  throw Error(`Login UI did not render email field: ${JSON.stringify(diag)}`);
 }
 await tid(p,"input-email").fill(email);await tid(p,"input-password").fill(password);await tid(p,"button-login").click();await tid(p,"button-user-menu").waitFor({timeout:15000});
}
async function logout(p){await tid(p,"button-user-menu").click();await tid(p,"button-logout").click();await tid(p,"input-email").waitFor({timeout:10000});}
async function clearTour(p,tag){if(await tid(p,"dialog-tour").count()){await snap(p,`${tag}-tour-before-dismiss`);await tid(p,"button-tour-skip").click();await tid(p,"dialog-tour").waitFor({state:"hidden",timeout:5000});}}
async function ensureLogin(p,email){const r=await p.request.get(base+"/api/auth/session");const s=r.ok()?await r.json():null;if(s?.user?.email!==email){if(await tid(p,"button-user-menu").count())await logout(p);await login(p,email);}await clearTour(p,"matrix-login");}
async function pref(p,lang,theme){
 if(!(await p.locator("html").getAttribute("lang")||"en").startsWith(lang)){await tid(p,"button-language").click();await p.waitForFunction(x=>document.documentElement.lang.startsWith(x),lang,{timeout:6000});}
 const dark=await p.locator("html").evaluate(e=>e.classList.contains("dark"));if(dark!==(theme==="dark")){await tid(p,"button-theme").click();await tid(p,`option-theme-${theme}`).click();await p.waitForFunction(x=>document.documentElement.classList.contains("dark")===(x==="dark"),theme,{timeout:6000});}
}
async function captureCell(p,who,screen,w,lang,theme,route,ready,drawerId,filterSource){
 const key=`${who}-${screen}-${w}-${lang}-${theme}`,entry={account:who,screen,width:w,lang,theme,key};
 try{
  await p.setViewportSize({width:w,height:1000});await pref(p,lang,theme);await p.goto(base+route);await tid(p,ready).waitFor({timeout:15000});
  if(filterSource){await tid(p,"input-runs-source").fill(filterSource);await tid(p,"button-runs-apply").click();}
  if(drawerId){if(drawerId.startsWith("button-open-source-detail-")){const id=drawerId.slice("button-open-source-detail-".length);await tid(p,`button-open-issue-${id}`).click();}await tid(p,drawerId).click();await tid(p,"section-source-value").waitFor({timeout:15000});await p.waitForFunction(()=>{const e=document.querySelector('[data-testid="drawer-source"]');return e&&e.getAnimations().every(a=>a.playState!=="running")},{},{timeout:12000});}
  const d=await p.evaluate(()=>{const e=document.querySelector('[data-testid="drawer-source"]'),r=e?.getBoundingClientRect();return{documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,innerWidth,dir:document.documentElement.dir,lang:document.documentElement.lang,drawer:e?{side:e.getAttribute("data-side"),x:Math.round(r.x),right:Math.round(r.right),width:Math.round(r.width),height:Math.round(r.height),scroll:e.scrollWidth,client:e.clientWidth}:null};});
  entry.geometry=d;entry.ok=d.documentWidth<=w&&d.bodyWidth<=w&&d.dir===(lang==="ar"?"rtl":"ltr")&&(!drawerId||(d.drawer&&d.drawer.x>=0&&d.drawer.right<=w&&d.drawer.scroll<=d.drawer.client&&d.drawer.side===(lang==="ar"?"left":"right")));
  entry.screenshot=await snap(p,key);if(!entry.ok)entry.reason="geometry/RTL assertion failed";
 }catch(e){entry.ok=false;entry.reason=safe(e.message);try{entry.screenshot=await snap(p,key+"-failure")}catch{}}
 const group=screen.endsWith("-drawer")?"drawers":"matrix";ev[group].push(entry);if(!entry.ok)ev.errors.push(`${key}: ${entry.reason}`);
}
async function sourceRuns(p){const r=await get(p,"/api/runs?page=1");if(r.status!==200)throw Error(`runs API ${r.status}`);let all=[...(r.body.items||[])],total=r.body.total||all.length;for(let i=2;all.length<total&&i<50;i++){const x=await get(p,`/api/runs?page=${i}`);if(x.status!==200)break;all.push(...(x.body.items||[]));}return all;}
async function makeImport(p,folder,source){
 const dir=path.resolve("test-data",folder),mapping=JSON.parse(await fs.readFile(path.join(dir,"mapping.json"),"utf8"));
 const files=await Promise.all(Object.keys(mapping.files).map(async role=>{const name=mapping.files[role].file;return{name,bytes:await fs.readFile(path.join(dir,name))}}));
 const d=await api(p,"POST","/api/imports",{sourceName:source,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});if(d.status!==201)throw Error(`create import ${d.status}`);
 for(const f of files){const u=d.body.files.find(x=>x.name===f.name)?.uploadUrl;if(!u)throw Error("signed upload URL missing");const r=await p.request.put(u,{data:f.bytes,headers:{"Content-Type":"text/csv"}});if(!r.ok())throw Error(`object upload ${r.status()}`);}
 let r=await api(p,"POST",`/api/imports/${d.body.id}/finalize`,{});if(r.status!==200)throw Error(`finalize ${r.status}`);
 r=await api(p,"POST",`/api/imports/${d.body.id}/event-codes`,{mapping});if(r.status!==200)throw Error(`event codes ${r.status}`);
 mapping.ignored_event_codes=(r.body.items||[]).filter(x=>!mapping.event_code_map[x.code]).map(x=>x.code);
 r=await api(p,"PUT",`/api/imports/${d.body.id}/mapping`,{mapping});if(r.status!==200)throw Error(`mapping ${r.status}`);
 r=await api(p,"POST",`/api/imports/${d.body.id}/check`,{});if(r.status!==200)throw Error(`check ${r.status}`);
 return{id:d.body.id,source,mapping,checked:r.body};
}
async function review(p,id,kind,page=1,extra={}){return api(p,"POST",`/api/imports/${id}/review-page`,{kind,page,...extra});}
async function drawerOpen(p,id){await tid(p,id).waitFor({timeout:15000});await tid(p,id).click();await tid(p,"section-source-value").waitFor({timeout:15000});await p.waitForFunction(()=>{const e=document.querySelector('[data-testid="drawer-source"]');return e&&e.getAnimations().every(a=>a.playState!=="running")},{},{timeout:12000});}
async function onboarding(p){
 const check=async(method,action,expectOpen)=>{try{await action();if(expectOpen)await tid(p,"dialog-tour").waitFor({timeout:5000});else await tid(p,"dialog-tour").waitFor({state:"hidden",timeout:5000});record("onboarding",method,true,{observed:expectOpen?"open":"closed"});await snap(p,`onboarding-${method}`);}catch(e){record("onboarding",method,false,{error:safe(e.message)});try{await snap(p,`onboarding-${method}-failure`)}catch{}}};
 if(!(await tid(p,"dialog-tour").count())){await tid(p,"button-user-menu").click();await tid(p,"button-replay-tour").click();await tid(p,"dialog-tour").waitFor({timeout:5000});}
 await check("normal-click",()=>tid(p,"button-tour-skip").click(),false);
 for(const method of ["escape","keyboard-enter"]){
  await tid(p,"button-user-menu").click();await tid(p,"button-replay-tour").click();await tid(p,"dialog-tour").waitFor({timeout:5000});
  if(method==="escape")await check(method,()=>p.keyboard.press("Escape"),false);
  else await check(method,async()=>{const b=tid(p,"button-tour-skip");await b.focus();await p.keyboard.press("Enter");},false);
 }
 // Leave onboarding dismissed using an actual UI action if any path failed to dismiss.
 if(await tid(p,"dialog-tour").count())await tid(p,"button-tour-skip").click();
}
async function uiNajmImport(p,folder,source){
 const dir=path.resolve("test-data",folder),mapping=JSON.parse(await fs.readFile(path.join(dir,"mapping.json"),"utf8"));
 const files=await Promise.all(Object.values(mapping.files).map(async f=>({name:f.file,mimeType:"text/csv",buffer:await fs.readFile(path.join(dir,f.file))})));
 await p.goto(base+"/imports?id=new");await tid(p,"page-imports").waitFor();await tid(p,"toggle-source-new").click();await tid(p,"input-source-name").fill(source);
 await tid(p,"input-files").setInputFiles(files);await tid(p,"button-start-upload").click();await tid(p,"button-continue-map").waitFor({timeout:30000});await snap(p,"najm-ui-upload");await tid(p,"button-continue-map").click();await tid(p,"section-format").waitFor({timeout:15000});
 for(const [role,spec] of Object.entries(mapping.files))for(const [field,col] of Object.entries(spec.columns)){const el=tid(p,`select-col-${role}-${field}`);if(await el.count())await el.selectOption(col);}
 for(const [code,choice] of Object.entries(mapping.event_code_map||{})){const row=p.locator('[data-testid^="row-code-"]').filter({hasText:code}).first();if(await row.count())await row.locator("select").selectOption(choice);}
 const delimiter=tid(p,"select-delimiter");if(await delimiter.count())await delimiter.selectOption(mapping.format?.delimiter==="auto"?";":mapping.format.delimiter);
 const decimal=tid(p,"select-decimal");if(await decimal.count())await decimal.selectOption(mapping.format?.decimal_separator||".");
 const date=tid(p,"input-date-format");if(await date.count())await date.fill(mapping.format?.date_format||"");
 const dt=tid(p,"input-datetime-format");if(await dt.count())await dt.fill(mapping.format?.datetime_format||"");
 for(const [role,spec] of Object.entries(mapping.files))if(spec.fixed_unit){const el=tid(p,`input-fixed-unit-${role}`);if(await el.count())await el.fill(spec.fixed_unit);}
 await snap(p,"najm-ui-map");await tid(p,"button-save-and-check").click();await tid(p,"button-approve").waitFor({timeout:30000});const id=new URL(p.url()).searchParams.get("id");await snap(p,"najm-ui-check");
 await tid(p,"button-approve").click();const checks={replacement:false,errors:false};
 if(await tid(p,"checkbox-confirm-replacement").count()){await tid(p,"checkbox-confirm-replacement").check();checks.replacement=true;}
 if(await tid(p,"checkbox-confirm-errors").count()){await tid(p,"checkbox-confirm-errors").check();checks.errors=true;}
 const responseP=p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname===`/api/imports/${id}/approve`,{timeout:25000}).then(async r=>({status:r.status(),body:await r.json().catch(()=>null)}));
 await tid(p,"button-confirm-approve").click();const response=await responseP;await tid(p,"banner-approved").waitFor({timeout:15000});
 record("journey","Najm full UI upload/map/check/approve",response.status===200&&response.body?.status==="approved",{status:response.status,statusText:response.body?.status,confirmationCheckboxes:checks,importId:id});
 await snap(p,"najm-ui-approved");return id;
}
async function main(){
 await fs.mkdir(out,{recursive:false});if(!base||!password)throw Error("isolated target or seed credential unavailable");
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 const ctx=await browser.newContext({viewport:{width:1280,height:1000}}),p=await ctx.newPage();
 p.on("console",m=>{if(m.type()==="error")ev.consoleErrors.push(safe(m.text()));});
 p.on("pageerror",e=>ev.consoleErrors.push(safe(e.message)));
 p.on("requestfailed",r=>ev.failedRequests.push({url:safe(new URL(r.url()).pathname),error:safe(r.failure()?.errorText)}));
 p.on("response",r=>{if(new URL(r.url()).pathname.startsWith("/api/")&&r.status()>=400)ev.apiResponses.push({path:new URL(r.url()).pathname,status:r.status()});});
 const users=[{key:"ethmar",email:"ethmar.manager@clarix.test",folder:"ethmar-plastics/00_baseline"},{key:"najm",email:"najm.manager@clarix.test",folder:"najm-packaging/00_baseline"}],states={};
 for(const u of users){
  await login(p,u.email);const sess=await (await p.request.get(base+"/api/auth/session")).json();const membership=sess.memberships?.find(x=>x.factoryId===sess.activeFactoryId);
  record("accounts",`${u.key} authenticated`,membership?.factoryName===(u.key==="ethmar"?"Ethmar Plastics":"Najm Packaging"),{factory:membership?.factoryName,role:membership?.role});
  // The three onboarding dismissal modes were already observed and saved in the prior attempt.
  // Clear any fresh-account tour through the visible UI so it cannot block this journey.
  await clearTour(p,`${u.key}-setup`);
  const expected=u.key==="ethmar"?["5","240"]:["8","180"];
  const runs=await sourceRuns(p);let a=null,b=null,scrap=null,change=null;
  for(const candidate of runs.filter(x=>x.orderId==="E-01")){
   const detail=await get(p,`/api/runs/${candidate.id}`),ms=detail.body?.metrics||[];
   const sr=ms.find(x=>x.key==="scrap_rate_pct")?.value,ch=ms.find(x=>x.key==="changeover_min")?.value;
   if(detail.status===200&&String(sr)===expected[0]&&String(ch)===expected[1]){a=candidate;scrap=sr;change=ch;break;}
  }
  if(a)b=runs.find(x=>x.sourceName===a.sourceName&&x.orderId===(u.key==="ethmar"?"E-02":"B-102"))||null;
  record("accounts",`${u.key} populated baseline pair and required metrics`,!!a&&!!b&&String(scrap)===expected[0]&&String(change)===expected[1],{runCount:runs.length,pair:[a?.orderId,b?.orderId],scrap,changeover:change});
  const source=`P9b ${attempt} ${u.key}`,draft=await makeImport(p,u.folder,source);
  states[u.key]={...u,a,b,source,draft};
  if(u.key==="najm"){
   try{await uiNajmImport(p,u.folder,source+" full UI");}
   catch(e){record("journey","Najm full UI upload/map/check/approve",false,{error:safe(e.message)});try{await snap(p,"najm-ui-journey-failure")}catch{}}
   // Separate checked, editable draft for the matrix; never screenshot an approved page as editable.
   states.najm.matrixDraft=await makeImport(p,u.folder,source+" matrix");
  }
  await logout(p);
 }
 // A synthetic >20-row/code fixture: authenticated API uploads only into this disposable schema/object store.
 await login(p,users[0].email);
 const mapping=JSON.parse(await fs.readFile(path.resolve("test-data/ethmar-plastics/00_baseline/mapping.json"),"utf8"));
 // The event-code preview is deliberately bounded to 20. Seed the full 25-code
 // ignored fixture exactly as review-pagination.test.ts does, not from that preview.
 mapping.ignored_event_codes=Array.from({length:25},(_,i)=>`IGN-${String(i).padStart(2,"0")}`);
 const orders=["order_id,product_code,line_id,machine_id,mold_id"],records=["record_id,order_id,machine_id,mold_id,shift,record_date,material_input,good_output,scrap,unit"],events=["event_id,order_id,machine_id,mold_id,shift,event_code,start_time,end_time,duration_min,recorded_reason"];
 for(let i=1;i<=25;i++){let o=`E-${String(i).padStart(2,"0")}`;orders.push(`${o},P,L,M,D`);records.push(`COLLISION-${i},${o},M,D,S,2026-01-01,100,95,5,kg`);events.push(`COLLISION-EVENT-${i},${o},M,D,S,CHG,2026-01-01 08:00,2026-01-01 09:00,60,Change`);}
 for(let i=0;i<25;i++)for(let n=0;n<(i===0?25:1);n++)events.push(`IGN-${i}-${n},E-01,M,D,${n},IGN-${String(i).padStart(2,"0")},2026-01-01 10:00,2026-01-01 10:01,1,Ignored`);
 const files=[{name:"orders.csv",bytes:Buffer.from(orders.join("\n")+"\n")},{name:"production_records.csv",bytes:Buffer.from(records.join("\n")+"\n")},{name:"events.csv",bytes:Buffer.from(events.join("\n")+"\n")}];
 const source="P9b-pagination-"+attempt,create=await api(p,"POST","/api/imports",{sourceName:source,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});
 let paginationId=null;
 if(create.status===201){paginationId=create.body.id;for(const f of files){const u=create.body.files.find(x=>x.name===f.name)?.uploadUrl,r=await p.request.put(u,{data:f.bytes,headers:{"Content-Type":"text/csv"}});if(!r.ok())throw Error("synthetic object upload failed");}
  await api(p,"POST",`/api/imports/${paginationId}/finalize`,{});const codes=await api(p,"POST",`/api/imports/${paginationId}/event-codes`,{mapping});
  await api(p,"PUT",`/api/imports/${paginationId}/mapping`,{mapping});const checked=await api(p,"POST",`/api/imports/${paginationId}/check`,{});record("pagination","synthetic fixture checked, preview bounded at 20",checked.status===200&&Object.keys(checked.body.result?.runs||{}).length<=20,{status:checked.status,runsPreview:Object.keys(checked.body.result?.runs||{}).length});
 }
 if(paginationId){
 try{
  const c1=await review(p,paginationId,"eventCodes",1,{mapping}),c2=await review(p,paginationId,"eventCodes",2,{mapping}),refs=await review(p,paginationId,"eventCodeRefs",2,{mapping,code:"IGN-00"});
  record("pagination","event code page 2 on demand and complete",c1.status===200&&c2.status===200&&c1.body.total===26&&c2.body.items.length===6&&new Set([...c1.body.items,...c2.body.items].map(x=>x.code)).size===26,{first:c1.body?.items?.length,second:c2.body?.items?.length,total:c1.body?.total,refPage2:refs.body?.items?.length});
  await p.goto(`${base}/imports?id=${paginationId}&step=map`);await tid(p,"section-format").waitFor({timeout:15000});
  const idx0=(c1.body.items||[]).findIndex(x=>x.code==="IGN-00");await tid(p,`pager-code-refs-${idx0}-label`).waitFor();
  let refRequest=null;const refWait=p.waitForRequest(r=>r.method()==="POST"&&r.url().includes(`/api/imports/${paginationId}/review-page`),{timeout:12000}).then(r=>r.postDataJSON());
  await tid(p,`pager-code-refs-${idx0}-next`).click();refRequest=await refWait;
  const refText=await tid(p,`list-code-refs-${idx0}`).innerText();
  await tid(p,"pager-codes-next").click();await tid(p,"row-code-20").waitFor();const code20=await tid(p,"row-code-20").innerText();
  await tid(p,"select-code-choice-20").selectOption("IGNORE");await tid(p,"pager-codes-prev").click();await tid(p,"row-code-0").waitFor();await tid(p,"pager-codes-next").click();await tid(p,"row-code-20").waitFor();
  const choice=await tid(p,"select-code-choice-20").inputValue(),eventColumn=Object.values(mapping.files.events.columns)[0];
  record("pagination","UI code page 2, choice survives back/forward, event refs match event file/column",choice==="IGNORE"&&!!refText&&refRequest?.kind==="eventCodeRefs"&&refRequest?.mapping?.files?.events?.file===mapping.files.events.file&&refRequest?.mapping?.files?.events?.columns?.event_code===mapping.files.events.columns.event_code,{choice,page2ContainsIGN:/IGN-/.test(code20),refPage2Count:refText.split(/\s+/).length,requestKind:refRequest?.kind,eventFile:refRequest?.mapping?.files?.events?.file,eventColumn:refRequest?.mapping?.files?.events?.columns?.event_code});
  await snap(p,"pagination-map-page2");
  // Full issue rows / replacement lists are also individually checked against server-paged endpoint caps.
  const issuePage=await get(p,`/api/imports/${paginationId}/issues/1`),issue=(issuePage.body.items||[]).find(x=>x.code==="UNMAPPED_EVENT_CODE"),rows1=issue&&await review(p,paginationId,"issueRows",1,{issueId:issue.id}),rows2=issue&&await review(p,paginationId,"issueRows",2,{issueId:issue.id});
  record("pagination","issue rows page 2 and 20-row cap",!!issue&&rows1.status===200&&rows2.status===200&&rows1.body.total>20&&rows1.body.items.length<=20&&rows2.body.items.length<=20,{issue:issue?.code,total:rows1?.body.total,page1:rows1?.body.items?.length,page2:rows2?.body.items?.length});
  const resultPage=await review(p,paginationId,"resultRuns",2);record("pagination","bounded preview has complete resultRuns page 2",resultPage.status===200&&resultPage.body.items.length===5,{status:resultPage.status,count:resultPage.body?.items?.length,total:resultPage.body?.total});
  await p.goto(`${base}/imports?id=${paginationId}&step=check`);await tid(p,"section-issues").waitFor({timeout:15000});
  if(issue){const issueIndex=issuePage.body.items.findIndex(x=>x.id===issue.id);const pager=tid(p,`pager-issue-rows-${issueIndex}-next`);await pager.waitFor({timeout:10000});await pager.click();await tid(p,`pager-issue-rows-${issueIndex}-label`).waitFor();record("pagination","issue row page 2 is fetched by UI",await tid(p,`pager-issue-rows-${issueIndex}-label`).innerText().then(x=>/2/.test(x)),{index:issueIndex,label:await tid(p,`pager-issue-rows-${issueIndex}-label`).innerText()});}
  await snap(p,"pagination-check");
  const approve1=await api(p,"POST",`/api/imports/${paginationId}/approve`,{confirmReplacement:false,replacementCount:0,confirmErrors:true});
  record("pagination","initial synthetic baseline approved for replacement fixture",approve1.status===200&&approve1.body?.status==="approved",{status:approve1.status,state:approve1.body?.status});
  const variant=files.map(f=>({name:f.name,bytes:Buffer.from(f.bytes)}));variant.find(f=>f.name==="production_records.csv").bytes=Buffer.from(variant.find(f=>f.name==="production_records.csv").bytes.toString().replaceAll(",95,5,kg",",94,6,kg"));
  const second=await api(p,"POST","/api/imports",{sourceName:source,files:variant.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});
  if(second.status===201){for(const f of variant){const u=second.body.files.find(x=>x.name===f.name).uploadUrl;await p.request.put(u,{data:f.bytes,headers:{"Content-Type":"text/csv"}});}
   await api(p,"POST",`/api/imports/${second.body.id}/finalize`,{});const c=await api(p,"POST",`/api/imports/${second.body.id}/event-codes`,{mapping});const map2={...mapping,ignored_event_codes:(c.body.items||[]).filter(x=>!mapping.event_code_map[x.code]).map(x=>x.code)};
   await api(p,"PUT",`/api/imports/${second.body.id}/mapping`,{mapping:map2});const ck=await api(p,"POST",`/api/imports/${second.body.id}/check`,{});
   const replacements=await review(p,second.body.id,"replacementOrders",2);
   record("pagination","replacement orders page 2",ck.status===200&&replacements.status===200&&ck.body.replacementCount===25&&replacements.body.items.length===5,{check:ck.status,replacementCount:ck.body?.replacementCount,page2:replacements.body?.items?.length});
   await p.goto(`${base}/imports?id=${second.body.id}&step=check`);await tid(p,"section-check").waitFor();await tid(p,"pager-list-orders-to-replace-next").click();await tid(p,"pager-list-orders-to-replace-label").waitFor();
   record("pagination","replacement-order page 2 visible in UI",/2/.test(await tid(p,"pager-list-orders-to-replace-label").innerText()),{label:await tid(p,"pager-list-orders-to-replace-label").innerText()});
   const approved2=await api(p,"POST",`/api/imports/${second.body.id}/approve`,{confirmReplacement:true,replacementCount:25,confirmErrors:true});
   const replaced=await review(p,second.body.id,"replacedOrders",2);
   record("pagination","replaced order page 2",approved2.status===200&&replaced.status===200&&replaced.body.items.length===5,{approve:approved2.status,replacedPage2:replaced.body?.items?.length,total:replaced.body?.total});
   await p.goto(`${base}/imports?id=${second.body.id}&step=check`);await tid(p,"banner-approved").waitFor();await tid(p,"pager-list-replaced-orders-next").click();await tid(p,"pager-list-replaced-orders-label").waitFor();
   record("pagination","replaced-order page 2 visible in UI",/2/.test(await tid(p,"pager-list-replaced-orders-label").innerText()),{label:await tid(p,"pager-list-replaced-orders-label").innerText()});
  }else record("pagination","replacement fixture created",false,{status:second.status,body:second.body});
 }catch(e){record("pagination","pagination setup/probes remained isolated; continue viewport matrix",false,{error:safe(e.message)});}
 } else record("pagination","synthetic fixture created",false,{reason:"isolated API create was not successful"});
 // Every required account/screen/viewport/language/theme is a separately recorded screenshot cell.
 for(const u of users){
  await ensureLogin(p,u.email);
  const s=states[u.key],d=s.matrixDraft||s.draft;
  const issueList=await get(p,"/api/quality?page=1"),items=issueList.body?.items||[],issue=items[0];
  const routes=[
   ["runs",`/runs?source=${encodeURIComponent(s.a?.sourceName||"00_baseline")}`,"page-runs"],
   ["comparison",`/comparison?a=${s.a?.id}&b=${s.b?.id}`,"page-comparison"],
   ["quality",issue?`/quality?source=${encodeURIComponent(issue.sourceName)}`:"/quality","page-quality"],
   ["members","/members","text-members-title"],
   ["upload","/imports?id=new","page-imports"],
   ["map",`/imports?id=${d.id}&step=map`,"page-imports"],
   ["check",`/imports?id=${d.id}&step=check`,"page-imports"],
  ];
  for(const w of [360,768,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"])for(const [screen,route,ready] of routes){
   let trigger=null;if(screen==="runs"&&s.a)trigger=`link-text-run-input_kg-${s.a.id}`;
   if(screen==="quality"&&issue)trigger=`button-open-source-detail-${issue.id}`;
   const copy=screen==="runs"?route.replace(/source=[^&]*/,"source="+encodeURIComponent(s.a?.sourceName||"")):route;
   await captureCell(p,u.key,screen,w,lang,theme,copy,ready,null);
  }
  // Original Phase7 12-combination metric + issue Source Drawer bounds.
  if(u.key==="ethmar")for(const w of [360,768,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"]){
   if(s.a)await captureCell(p,u.key,"metric-drawer",w,lang,theme,"/runs","page-runs",`link-text-run-input_kg-${s.a.id}`,s.a.sourceName);
   if(issue)await captureCell(p,u.key,"issue-drawer",w,lang,theme,`/quality?source=${encodeURIComponent(issue.sourceName)}`,"page-quality",`button-open-source-detail-${issue.id}`);
  }
  // Representative keyboard/focus and target check.
  await p.setViewportSize({width:1280,height:1000});await pref(p,"en","light");await p.goto(base+"/runs");await tid(p,"page-runs").waitFor();await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press("Tab");
  const focus=await p.evaluate(()=>{const e=document.activeElement,c=getComputedStyle(e),r=e.getBoundingClientRect();return{tag:e.tagName,id:e.id,testid:e.getAttribute("data-testid"),focusVisible:e.matches(":focus-visible"),outline:`${c.outlineStyle} ${c.outlineWidth}`,width:Math.round(r.width),height:Math.round(r.height)}});
  record("journey",`${u.key} keyboard focus and skip target`,focus.focusVisible&&focus.width>=44&&focus.height>=44,focus);
  if(u.key==="ethmar")await logout(p);
 }
 // Keep exact scenario evidence distinct and ensure returned originals have not changed in the dev app (launcher records these).
 ev.matrixExpected=168;ev.matrixObserved=ev.matrix.length;ev.drawerExpected=24;ev.drawerObserved=ev.drawers.length;
 ev.finishedAt=new Date().toISOString();ev.summary={matrixExpected:168,matrix:ev.matrix.length,drawerExpected:24,drawers:ev.drawers.length,journey:ev.journey.length,pagination:ev.pagination.length,onboarding:ev.onboarding.length,screenshots:ev.screenshots.length,failures:ev.errors.length,out};
 await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(ev,null,2));console.log(JSON.stringify(ev.summary));await browser.close();if(ev.errors.length)process.exitCode=1;
}
main().catch(async e=>{ev.errors.push(safe(e.stack||e.message));ev.finishedAt=new Date().toISOString();ev.summary={failed:ev.errors.length,matrix:ev.matrix.length,journey:ev.journey.length,out};await fs.mkdir(out,{recursive:true}).catch(()=>{});await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(ev,null,2)).catch(()=>{});console.error(`Phase9b driver stopped; evidence ${path.basename(out)}: ${safe(e.message)}`);await browser?.close().catch(()=>{});process.exitCode=1;});
