// Phase 9 browser/API proof. Must be run only by test-isolated.ts --browser.
require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID}=require("node:crypto"),{chromium}=require("playwright-core");
const base=process.env.CLARIX_TEST_BASE_URL,password=process.env.SEED_TEST_PASSWORD;
const attempt=process.env.PHASE9_ATTEMPT||`${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID().slice(0,8)}`;
const out=path.resolve(`generated-artifacts/phase9/browser-${attempt}`);
const ev={attempt,environment:"isolated API/Vite",startedAt:new Date().toISOString(),journey:[],tenancy:[],matrix:[],screenshots:[],errors:[],notApplicable:[]};
let browser;
const safe=s=>String(s??"").replace(/([?&](?:token|invite)=)[^&#\s]+/gi,"$1[redacted]").replace(/\/invite\/[^/?#\s]+/gi,"/invite/[redacted]").slice(0,600);
function redact(v,k=""){if(/token|cookie|invite|authorization|password|secret/i.test(k))return "[redacted]";if(typeof v==="string")return safe(v);if(Array.isArray(v))return v.map(x=>redact(x));if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).map(([a,b])=>[a,redact(b,a)]));return v;}
function rec(name,ok,actual){ev.journey.push({name,status:ok?"PASS":"FAIL",actual});if(!ok)ev.errors.push(`${name}: ${safe(JSON.stringify(actual))}`);}
function tc(name,ok,actual){ev.tenancy.push({name,status:ok?"PASS":"FAIL",actual});if(!ok)ev.errors.push(`${name}: ${safe(JSON.stringify(actual))}`);}
const tid=(p,id)=>p.getByTestId(id),visible=(p,id)=>p.locator(`[data-testid="${id}"]:visible`).first();
async function login(p,email){await p.goto(base+"/login");await tid(p,"input-email").fill(email);await tid(p,"input-password").fill(password);await tid(p,"button-login").click();await tid(p,"button-user-menu").waitFor({timeout:15000});if(await tid(p,"link-nav-runs").count()){await p.goto(base+"/runs");await tid(p,"page-runs").waitFor({timeout:15000});if(await tid(p,"dialog-tour").count())await tid(p,"button-tour-skip").click();}}
async function session(p){const r=await p.request.get(base+"/api/auth/session");return r.status()===200?r.json():null;}
async function api(p,method,url,data){const s=await session(p),headers={};if(method!=="GET")headers["X-CSRF-Token"]=s?.csrfToken;const r=await p.request.fetch(base+url,{method,headers,data});let body=null;try{body=await r.json();}catch{}return {status:r.status(),body};}
async function get(p,url){return api(p,"GET",url);}
async function paged(p,url){let items=[],total=0;for(let n=1;n<100;n++){const r=await get(p,`${url}${url.includes("?")?"&":"?"}page=${n}`);if(r.status!==200)throw Error(`${url} returned ${r.status}`);items.push(...(r.body.items||[]));total=r.body.total??items.length;if(items.length>=total||!r.body.items?.length)break;}return items;}
async function logout(p){if(await tid(p,"button-user-menu").count()){await tid(p,"button-user-menu").click();if(await tid(p,"button-logout").count())await tid(p,"button-logout").click();}await tid(p,"input-email").waitFor({timeout:10000});}
async function snap(p,name){await fs.mkdir(out,{recursive:true});await p.screenshot({path:path.join(out,name+".png"),fullPage:false,mask:[p.locator('input[type="password"],[data-sensitive="true"],[data-testid*="token"],[data-testid*="invite-token"]')],maskColor:"#000"});ev.screenshots.push(name+".png");}
async function openDrawer(p,testid){await visible(p,testid).waitFor({timeout:15000});await visible(p,testid).click();await tid(p,"drawer-source").waitFor({timeout:10000});await tid(p,"section-source-value").waitFor({timeout:15000});await p.waitForFunction(()=>{const e=document.querySelector('[data-testid="drawer-source"]');return e&&e.getAnimations().every(a=>a.playState!=="running")},{},{timeout:10000});}
async function closeDrawer(p){await tid(p,"button-close-source").click();await tid(p,"drawer-source").waitFor({state:"hidden",timeout:10000});}
async function pref(p,lang,theme){if(!(await p.locator("html").getAttribute("lang")||"en").startsWith(lang)){await visible(p,"button-language").click();await p.waitForFunction(x=>document.documentElement.lang.startsWith(x),lang,{timeout:5000});}await visible(p,"button-theme").click();await visible(p,`option-theme-${theme}`).click();await p.waitForFunction(x=>x==="dark"?document.documentElement.classList.contains("dark"):!document.documentElement.classList.contains("dark"),theme,{timeout:5000});}
async function keyboardAudit(p,scope){await p.evaluate(()=>document.activeElement?.blur());const n=await p.locator('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[role="button"],[tabindex]:not([tabindex="-1"])').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&!e.closest('[aria-hidden="true"]')).length),seen=new Map();for(let i=0;i<n+2;i++){await p.keyboard.press("Tab");const v=await p.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect(),ring=(c.outlineStyle!=="none"&&parseFloat(c.outlineWidth)>0)||(c.boxShadow!=="none"&&c.boxShadow!=="");return{id:e.getAttribute("data-testid")||e.tagName,label:(e.getAttribute("aria-label")||e.innerText||"").trim().slice(0,40),focusVisible:e.matches(":focus-visible"),ring,w:Math.round(r.width),h:Math.round(r.height)};});if(v)seen.set(v.id,v);}const rows=[...seen.values()],bad=rows.filter(x=>!x.focusVisible||!x.ring),small=rows.filter(x=>x.w<44||x.h<44);rec(`${scope} focus rings and 44px targets`,rows.length>0&&!bad.length&&!small.length,{count:rows.length,missingRing:bad,under44:small});}
async function runs(p){return paged(p,"/api/runs");}
async function issues(p){return paged(p,"/api/quality?includeArchived=true");}
async function allSources(p){let out=[];for(let n=1;n<100;n++){const r=await get(p,`/api/data-sources?page=${n}`);if(r.status!==200)throw Error(`data sources returned ${r.status}`);out.push(...(r.body.items||[]));if(out.length>=r.body.total||!r.body.items?.length)break;}return out;}
function sameShape(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function leaks(body,needles){const s=JSON.stringify(body??{}).toLowerCase();return needles.filter(x=>x&&s.includes(String(x).toLowerCase()));}
async function main(){
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out,{recursive:false});if(!base||!password)throw Error("Isolated harness credentials unavailable inside workspace");
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 const ctx=await browser.newContext({viewport:{width:1280,height:1000}}),p=await ctx.newPage();
 await login(p,"najm.manager@clarix.test");
 let ns=await session(p),najm=ns?.memberships?.find(x=>x.factoryId===ns.activeFactoryId);
 rec("Najm manager authenticated to Najm membership",!!najm&&najm.factoryName==="Najm Packaging",{factory:najm?.factoryName,role:najm?.role});
 // A unique source avoids colliding with imports.test.ts golden data.
 const source=`P9 Najm ${attempt}`;await p.goto(base+"/imports?id=new");await tid(p,"page-imports").waitFor({timeout:15000});
 await tid(p,"toggle-source-new").click();await tid(p,"input-source-name").fill(source);
 const fixture="test-data/najm-packaging/00_baseline";
 const files=await Promise.all(["jobs.csv","output.csv","stops.csv"].map(async name=>({name,mimeType:"text/csv",buffer:await fs.readFile(path.join(fixture,name))})));
 await tid(p,"input-files").setInputFiles(files);await tid(p,"button-start-upload").click();await tid(p,"button-continue-map").waitFor({timeout:30000});await tid(p,"button-continue-map").click();
 const mapping=JSON.parse(await fs.readFile(path.join(fixture,"mapping.json"),"utf8"));
 for(const [role,spec] of Object.entries(mapping.files))for(const [field,col] of Object.entries(spec.columns)){const el=tid(p,`select-col-${role}-${field}`);if(await el.count())await el.selectOption(col);}
 for(const [code,choice] of [["MOLD","CHANGEOVER"],["BREAKDOWN","UNPLANNED_DOWNTIME"]]){const row=p.locator('[data-testid^="row-code-"]').filter({hasText:code}).first();await row.waitFor({timeout:10000});await row.locator("select").selectOption(choice);}
 const delimiter=tid(p,"select-delimiter"),delimiterCount=await delimiter.count();
 let delimiterSelected=false;
 try{if(delimiterCount){await delimiter.selectOption(";");delimiterSelected=await delimiter.inputValue()===";";}}catch{}
 rec("Mapping exposes and selects semicolon separator",delimiterSelected,{controlCount:delimiterCount,value:await delimiter.inputValue().catch(()=>null)});
 const decimal=tid(p,"select-decimal");if(await decimal.count())await decimal.selectOption(",");
 const date=tid(p,"input-date-format");if(await date.count())await date.fill("%d/%m/%Y");
 const dt=tid(p,"input-datetime-format");if(await dt.count())await dt.fill("%d/%m/%Y %H:%M");
 const unit=tid(p,"input-fixed-unit-records");if(await unit.count())await unit.fill("t");
 const settings={decimal:await decimal.inputValue().catch(()=>null),date:await date.inputValue().catch(()=>null),datetime:await dt.inputValue().catch(()=>null),unit:await unit.inputValue().catch(()=>null)};
 await tid(p,"button-open-save-template").click();await tid(p,"input-template-name").fill(`Najm baseline ${attempt}`);await tid(p,"button-confirm-template").click();await tid(p,"button-confirm-template").waitFor({state:"hidden",timeout:10000});
 rec("Najm mapping settings entered and mapping template saved",settings.decimal===","&&settings.date==="%d/%m/%Y"&&settings.datetime==="%d/%m/%Y %H:%M"&&settings.unit==="t",settings);
 await tid(p,"button-save-and-check").click();await tid(p,"button-approve").waitFor({timeout:30000});
 const importId=new URL(p.url()).searchParams.get("id"),checked=await get(p,`/api/imports/${importId}`);
 rec("Najm CSV uploaded, mapped, checked through UI pipeline",checked.status===200&&checked.body.status==="checked",{status:checked.status,importStatus:checked.body?.status,counts:checked.body?.counts});
 const detectedFiles=checked.body?.files||[];
 rec("Semicolon separator detected for each Najm uploaded file",checked.status===200&&detectedFiles.length===3&&detectedFiles.every(f=>f.delimiter===";"),{delimiters:detectedFiles.map(f=>({name:f.name,delimiter:f.delimiter}))});
 await tid(p,"button-approve").click();if(await tid(p,"checkbox-confirm-errors").count())await tid(p,"checkbox-confirm-errors").check();
 let approveCapture={status:null,body:null,transportError:null};
 try{
  const responsePromise=p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname===`/api/imports/${importId}/approve`,{timeout:30000});
  await Promise.all([tid(p,"button-confirm-approve").click(),responsePromise.then(async r=>{let body=null;try{body=await r.json();}catch{}approveCapture={status:r.status(),body:redact(body),transportError:null};return r;})]);
  await tid(p,"banner-approved").waitFor({timeout:20000});
  rec("Najm approve HTTP response and approved banner",approveCapture.status===200&&approveCapture.body?.status==="approved",{...approveCapture});
 }catch(e){
  approveCapture.transportError=safe(e.message||e);
  await snap(p,"approve-failure");
  rec("Najm approval response/banner captured",false,{...approveCapture});
  throw e;
 }
 const nRuns=(await runs(p)).filter(x=>x.sourceName===source),nE=nRuns.find(x=>x.orderId==="E-01"),nB=nRuns.find(x=>x.orderId==="B-102");
 rec("Approved unique Najm source contains E-01 and B-102",!!nE&&!!nB,{orders:nRuns.map(x=>x.orderId),source:source});
 const ne=await get(p,`/api/runs/${nE?.id}`),nb=await get(p,`/api/runs/${nB?.id}`);
 const eMetrics=ne.body?.metrics||[],scrap=eMetrics.find(x=>x.key==="scrap_rate_pct"),change=eMetrics.find(x=>x.key==="changeover_min");
 rec("Najm E-01 calculated baseline is 8% scrap and 180 min changeover",ne.status===200&&String(scrap?.value)==="8"&&String(change?.value)==="180",{status:ne.status,scrap:scrap?.value,changeover:change?.value});
 const sourceDrawer=await get(p,`/api/source-detail?kind=metric&id=${nE.id}&metric=scrap_rate_pct`);
 rec("Najm E-01 Source Drawer response identifies source rows and expected value",sourceDrawer.status===200&&String(sourceDrawer.body.value)==="8"&&(sourceDrawer.body.rows||[]).length>0,{status:sourceDrawer.status,value:sourceDrawer.body?.value,rowCount:sourceDrawer.body?.rows?.length});
 const changeDrawer=await get(p,`/api/source-detail?kind=metric&id=${nE.id}&metric=changeover_min`);
 rec("Najm E-01 Source Drawer shows its 180-minute mold event",changeDrawer.status===200&&String(changeDrawer.body.value)==="180"&&(changeDrawer.body.rows||[]).some(r=>r.event?.minutes==="180"),{status:changeDrawer.status,value:changeDrawer.body?.value,eventRows:changeDrawer.body?.rows?.filter(r=>r.event).length});
 const template=await get(p,`/api/import-templates?source=${encodeURIComponent(source)}`);
 rec("Najm mapping template is factory-scoped and saved",template.status===200&&template.body.items?.some(x=>x.name===`Najm baseline ${attempt}`),{status:template.status,saved:template.body.items?.some(x=>x.name===`Najm baseline ${attempt}`)});
 // Account switch on the same browser context: logout then clean Ethmar login.
 await logout(p);await login(p,"ethmar.manager@clarix.test");
 let es=await session(p),eth=es?.memberships?.find(x=>x.factoryId===es.activeFactoryId),eAll=await runs(p);
 rec("Switching to Ethmar clears Najm factory and run state",eth?.factoryName==="Ethmar Plastics"&&!eAll.some(x=>x.sourceName===source),{factory:eth?.factoryName,visibleNajmSource:eAll.some(x=>x.sourceName===source),runCount:eAll.length});
 const eBase=eAll.filter(x=>x.sourceName?.endsWith("00_baseline")),e01=eBase.find(x=>x.orderId==="E-01"),e02=eBase.find(x=>x.orderId==="E-02");
 const eRun=await get(p,`/api/runs/${e01?.id}`),em=eRun.body?.metrics||[];
 rec("Ethmar API baseline remains E-01 5% scrap and 240 min changeover",eRun.status===200&&String(em.find(x=>x.key==="scrap_rate_pct")?.value)==="5"&&String(em.find(x=>x.key==="changeover_min")?.value)==="240",{status:eRun.status,scrap:em.find(x=>x.key==="scrap_rate_pct")?.value,changeover:em.find(x=>x.key==="changeover_min")?.value});
 // T1-T4, T6-T7: IDs are collected from each tenant's real API, never assumed.
 const ethIssues=await issues(p);
 tc("T1 Ethmar runs list is factory filtered",eAll.some(x=>x.orderId==="E-01")&&!eAll.some(x=>x.orderId==="B-102")&&!eAll.some(x=>x.sourceName===source),{status:200,orders:eAll.map(x=>x.orderId),najmSourceCount:eAll.filter(x=>x.sourceName===source).length});
 tc("T2 Ethmar E-01 metrics",eRun.status===200&&String(em.find(x=>x.key==="scrap_rate_pct")?.value)==="5"&&String(em.find(x=>x.key==="changeover_min")?.value)==="240",{status:eRun.status,scrap:em.find(x=>x.key==="scrap_rate_pct")?.value,changeover:em.find(x=>x.key==="changeover_min")?.value});
 const foreignRun=nE?.id,unknown=randomUUID(),denial=[];
 async function compare404(label,one,two,needles=[]){const leaksOne=leaks(one.body,needles),leaksTwo=leaks(two.body,needles),ok=[404,403].includes(one.status)&&one.status===two.status&&sameShape(one.body,two.body)&&!leaksOne.length&&!leaksTwo.length;tc(label,ok,{foreign:{status:one.status,body:one.body},nonexistent:{status:two.status,body:two.body},dataLeak:!!(leaksOne.length||leaksTwo.length)});denial.push({label,foreignStatus:one.status,nonexistentStatus:two.status,identicalShape:sameShape(one.body,two.body),leaked:false});}
 await compare404("T3 foreign Najm run vs nonexistent run",await get(p,`/api/runs/${foreignRun}`),await get(p,`/api/runs/${unknown}`),[source,"B-102"]);
 await compare404("T4 foreign Najm import vs nonexistent import",await get(p,`/api/imports/${importId}`),await get(p,`/api/imports/${unknown}`),[source]);
 const putBody={mapping:mapping};
 await compare404("T4 foreign mapping write target vs nonexistent import",await api(p,"PUT",`/api/imports/${importId}/mapping`,putBody),await api(p,"PUT",`/api/imports/${unknown}/mapping`,putBody),[source]);
 const foreignImportCollection=await get(p,"/api/imports"),foreignQualityCollection=await get(p,`/api/quality?source=${encodeURIComponent(source)}`),foreignTemplateCollection=await get(p,`/api/import-templates?source=${encodeURIComponent(source)}`);
 tc("T4 imports, issues and mapping-template collections are filtered for Ethmar",foreignImportCollection.status===200&&!foreignImportCollection.body.items?.some(x=>x.sourceName===source)&&foreignQualityCollection.status===200&&foreignQualityCollection.body.total===0&&foreignTemplateCollection.status===200&&foreignTemplateCollection.body.total===0,{imports:foreignImportCollection.status,foreignImportIncluded:foreignImportCollection.body?.items?.some(x=>x.sourceName===source),quality:foreignQualityCollection.status,qualityTotal:foreignQualityCollection.body?.total,templates:foreignTemplateCollection.status,templateTotal:foreignTemplateCollection.body?.total});
 const foreignDrawer=await get(p,`/api/source-detail?kind=metric&id=${foreignRun}&metric=input_kg`),emptyDrawer=await get(p,`/api/source-detail?kind=metric&id=${unknown}&metric=input_kg`);
 await compare404("T4 foreign Source Drawer vs nonexistent run",foreignDrawer,emptyDrawer,[source,"B-102"]);
 const ethMembers=await get(p,"/api/members");
 tc("Members collection contains only Ethmar members",ethMembers.status===200&&ethMembers.body.items.every(x=>x.email.endsWith("@clarix.test")&&!x.email.startsWith("najm.")),{status:ethMembers.status,total:ethMembers.body?.total,najmIncluded:ethMembers.body?.items?.some(x=>x.email==="najm.manager@clarix.test")});
 const audit=await get(p,"/api/members/audit"),invites=await get(p,"/api/members/invitations"),sources=await allSources(p),najmMemberCtx=await browser.newContext(),np=await najmMemberCtx.newPage();
 await login(np,"najm.manager@clarix.test");const nm=(await get(np,"/api/members")).body?.items?.find(x=>x.email==="najm.manager@clarix.test");
 const nIssueRows=await paged(np,`/api/quality?source=${encodeURIComponent(source)}&includeArchived=true`),foreignIssue=nIssueRows[0];
 if(foreignIssue?.id)await compare404("T4 foreign Najm issue vs nonexistent issue",await get(p,`/api/quality/${foreignIssue.id}`),await get(p,`/api/quality/${unknown}`),[source,"B-102"]);
 else tc("T4 foreign issue exact-ID denial",false,{reason:"No issue row returned for isolated Najm import"});
 const nRaw=await get(np,`/api/source-detail?kind=metric&id=${nE.id}&metric=input_kg`),eRaw=await get(p,`/api/source-detail?kind=metric&id=${e01.id}&metric=input_kg`);
 const recordIds=d=>new Set((d.body?.rows||[]).flatMap(r=>(r.cells||[]).filter(c=>/record.?id|rowno/i.test(c.column||"")).map(c=>String(c.value))));
 const nRecordIds=recordIds(nRaw),eRecordIds=recordIds(eRaw),overlap=[...nRecordIds].filter(x=>eRecordIds.has(x));
 tc("T6 colliding canonical record IDs are accepted independently",nRaw.status===200&&eRaw.status===200&&overlap.length>0,{najm:[...nRecordIds],ethmar:[...eRecordIds],sharedRecordIds:overlap});
 if(nm?.id)await compare404("Foreign Najm member mutation vs nonexistent member",await api(p,"PATCH",`/api/members/${nm.id}`,{role:"viewer"}),await api(p,"PATCH",`/api/members/${unknown}`,{role:"viewer"}),[nm.email]);
 const nInvites=await get(np,"/api/members/invitations"),nAudit=await get(np,"/api/members/audit");
 let crossInvite=nInvites.body?.items?.[0];
 if(!crossInvite){const made=await api(np,"POST","/api/members/invitations",{email:`p9-${attempt}@example.test`,role:"viewer"});crossInvite=made.status===201?made.body.invitation:null;rec("Created an isolated Najm invitation for tenant-ID denial probe",!!crossInvite,{status:made.status,created:!!crossInvite});}
 if(crossInvite?.id)await compare404("Foreign invitation revoke vs nonexistent invitation",await api(p,"POST",`/api/members/invitations/${crossInvite.id}/revoke`,{}),await api(p,"POST",`/api/members/invitations/${unknown}/revoke`,{}),[crossInvite.email]);
 rec("Source collection is tenant-filtered",!sources.some(x=>x.name===source),{pageCount:Math.ceil(sources.length/20),total:sources.length,najmSourceIncluded:sources.some(x=>x.name===source)});
 rec("Audit and invitation collection endpoints expose no Najm entries to Ethmar",audit.status===200&&invites.status===200&&!JSON.stringify(audit.body).includes("najm.manager")&&!JSON.stringify(invites.body).includes("najm.manager"),{auditStatus:audit.status,inviteStatus:invites.status});
 ev.notApplicable.push({test:"T4 raw-row ID",reason:"No single raw-row HTTP endpoint; raw rows are only reachable through an authorized Source Drawer. Foreign run/import drawer denial was compared above."},{test:"T4 source and audit individual IDs",reason:"Collections only; tenant-filtered collection results checked, no item route exists."},{test:"T4 membership read by ID",reason:"There is no member GET-by-ID endpoint; tenant-scoped PATCH foreign-ID denial was compared."},{test:"T4 snapshots",reason:"Snapshot feature is not implemented."});
 tc("T6 same order IDs work across factories",!!e01&&!!nE&&e01.orderId===nE.orderId&&e01.id!==nE.id&&ne.status===200&&eRun.status===200,{ethmar:{id:e01?.id,order:e01?.orderId},najm:{id:nE?.id,order:nE?.orderId},status:"both factory run records accessible to own sessions"});
 // Upload Najm's exact byte-for-byte files under the Ethmar login; same bytes must not be a cross-tenant duplicate.
 await p.goto(base+"/imports?id=new");await tid(p,"toggle-source-new").click();await tid(p,"input-source-name").fill(`P9 same files ${attempt}`);
 await tid(p,"input-files").setInputFiles(files);await tid(p,"button-start-upload").click();await tid(p,"button-continue-map").waitFor({timeout:30000});await tid(p,"button-continue-map").click();
 for(const [role,spec] of Object.entries(mapping.files))for(const [field,col] of Object.entries(spec.columns)){const el=tid(p,`select-col-${role}-${field}`);if(await el.count())await el.selectOption(col);}
 for(const [code,choice] of [["MOLD","CHANGEOVER"],["BREAKDOWN","UNPLANNED_DOWNTIME"]]){const row=p.locator('[data-testid^="row-code-"]').filter({hasText:code}).first();await row.waitFor({timeout:10000});await row.locator("select").selectOption(choice);}
 if(await decimal.count())await decimal.selectOption(",");if(await date.count())await date.fill("%d/%m/%Y");if(await dt.count())await dt.fill("%d/%m/%Y %H:%M");if(await unit.count())await unit.fill("t");
 await tid(p,"button-save-and-check").click();await tid(p,"button-approve").waitFor({timeout:30000});const identicalId=new URL(p.url()).searchParams.get("id"),identical=await get(p,`/api/imports/${identicalId}`);
 tc("T7 identical Najm bytes uploaded in Ethmar are not flagged cross-factory duplicate",identical.status===200&&!identical.body.duplicateOf&&!identical.body.duplicateReason,{status:identical.status,duplicateOf:identical.body?.duplicateOf??null,duplicateReason:identical.body?.duplicateReason??null});
 // T5 non-authoritative client tenant id: create a disposable Ethmar draft while claiming Najm.
 const forged=await api(p,"POST","/api/imports",{sourceName:`P9 forged ${attempt}`,factory_id:ns.activeFactoryId,files:[{name:"probe.csv",size:4,mime:"text/csv"}]});
 const forgedDetail=forged.status===201?await get(p,`/api/imports/${forged.body.id}`):null;
 const forgedAsNajm=forged.status===201?await get(np,`/api/imports/${forged.body.id}`):null;
 const forgedIgnored=forged.status===201&&forgedDetail?.status===200&&forgedAsNajm?.status===404,forgedRejected=[400,403].includes(forged.status);
 tc("T5 upload ignores foreign factory_id or rejects it",forgedIgnored||forgedRejected,{status:forged.status,ethmarDetailStatus:forgedDetail?.status,najmStatus:forgedAsNajm?.status,clientFactorySent:true,createdOnlyInIsolatedTarget:forgedIgnored});
 // T9 viewer role is tested with its real session/cookie/CSRF token.
 const vp=await browser.newPage();await login(vp,"ethmar.viewer@clarix.test");
 const vw=await session(vp),vwrite=await api(vp,"POST","/api/imports",{sourceName:`viewer-write-${attempt}`,files:[{name:"x.csv",size:1,mime:"text/csv"}]}),vapprove=await api(vp,"POST",`/api/imports/${importId}/approve`,{}),vsettings=await api(vp,"PATCH","/api/data-sources/archive",{sourceName:"x",archived:true});
 tc("T9 viewer upload, approve and settings/source writes return 403",vwrite.status===403&&vapprove.status===403&&vsettings.status===403,{upload:vwrite.status,approve:vapprove.status,settings:vsettings.status,csrfPresent:!!vw?.csrfToken});
 // Platform Admin default denial; delegation half is not implemented.
 const pa=await browser.newPage();await login(pa,"platform.admin@clarix.test");
 const adminSession=await session(pa),adminImport=await get(pa,`/api/imports/${importId}`),adminRuns=await get(pa,"/api/runs");
 tc("Platform Admin without delegated membership is denied tenant production API",adminSession?.user?.platformAdmin&&adminImport.status===403&&adminRuns.status===403,{isPlatformAdmin:adminSession?.user?.platformAdmin,importStatus:adminImport.status,runsStatus:adminRuns.status});
 ev.notApplicable.push({test:"T8 SQL without tenant context",reason:"Main owns this direct SQL/RLS coverage; not run in the browser driver."},{test:"T10 granted/time-boxed Platform Admin delegation",reason:"Delegation is not built; default-denied check above applies."},{test:"T11 AI cross-factory question",reason:"AI feature is not implemented."},{test:"T12 export isolation/formula neutralization",reason:"Export feature is not implemented."});
 // Najm UI evidence: Runs, Comparison, Quality, and their source drawer. No subjective visual scoring.
 await logout(p);await login(p,"najm.manager@clarix.test");await p.goto(base+"/runs");await tid(p,"page-runs").waitFor();
 const nQ=await issues(p),q=nQ.find(x=>x.sourceName===source),issuesUrl=q?`/quality?source=${encodeURIComponent(source)}`:"/quality";
 for(const width of [360,768,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"]){
  await p.setViewportSize({width,height:1000});await pref(p,lang,theme);
  for(const [step,route] of [["upload","/imports?id=new"],["map",`/imports?id=${importId}&step=map`],["check",`/imports?id=${importId}&step=check`]]){
   await p.goto(base+route);await tid(p,"page-imports").waitFor({timeout:15000});if(step==="map")await tid(p,"section-format").waitFor({timeout:15000});if(step==="check")await tid(p,"banner-approved").waitFor({timeout:15000});
   const dims=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,dir:document.documentElement.dir}));
   const tag=`najm-wizard-${step}-${width}-${lang}-${theme}`;ev.matrix.push({screen:`wizard-${step}`,width,lang,theme,...dims});
   rec(`${tag}: overflow and RTL`,dims.doc<=width&&dims.body<=width&&dims.dir===(lang==="ar"?"rtl":"ltr"),dims);await snap(p,tag);
  }
  for(const [screen,route,trigger] of [["runs",`/runs?source=${encodeURIComponent(source)}`,`link-text-run-input_kg-${nE.id}`],["comparison",`/compare?a=${nE.id}&b=${nB.id}`,"link-source-a-input_kg"],["quality",issuesUrl,q?`button-open-issue-${q.id}`:null]]){
   await p.goto(base+route);await tid(p,screen==="runs"?"page-runs":screen==="comparison"?"page-comparison":"page-quality").waitFor({timeout:15000});
   if(screen==="runs"){await tid(p,"input-runs-source").fill(source);await tid(p,"button-runs-apply").click();}
   const tag=`najm-${screen}-${width}-${lang}-${theme}`;
   if(trigger){await openDrawer(p,trigger);const geom=await p.evaluate(()=>{const d=document.querySelector('[data-testid="drawer-source"]'),r=d.getBoundingClientRect();return {doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,dir:document.documentElement.dir,side:d.getAttribute("data-side"),x:Math.round(r.x),right:Math.round(r.right),width:Math.round(r.width),scroll:d.scrollWidth,client:d.clientWidth};});
    const expectedSide=lang==="ar"?"left":"right",ok=geom.doc<=width&&geom.body<=width&&geom.x>=0&&geom.right<=width&&geom.scroll<=geom.client&&geom.side===expectedSide;ev.matrix.push({screen,width,lang,theme,...geom,overflow:geom.doc>width||geom.body>width,expectedSide});rec(`${tag}: drawer bounds, overflow, RTL`,ok&&geom.dir===(lang==="ar"?"rtl":"ltr"),{...geom,expectedSide});await snap(p,tag);await closeDrawer(p);
   }else{const geom=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,dir:document.documentElement.dir}));ev.matrix.push({screen,width,lang,theme,...geom,noDrawerTrigger:true});rec(`${tag}: page overflow and RTL`,geom.doc<=width&&geom.body<=width&&geom.dir===(lang==="ar"?"rtl":"ltr"),geom);await snap(p,tag);}
  }
 }
 // Compare API must stay within Najm and show its own E-01 values; T1/T2 already verify Ethmar.
 const cmp=await get(p,`/api/comparison?a=${nE.id}&b=${nB.id}`);
 const expA={input_kg:"2500",good_kg:"2300",scrap_kg:"200",scrap_rate_pct:"8",good_rate_pct:"92",material_balance_kg:"0",changeover_min:"180",downtime_min:"0"};
 const expB={input_kg:"2000",good_kg:"1880",scrap_kg:"120",scrap_rate_pct:"6",good_rate_pct:"94",material_balance_kg:"0",changeover_min:"150",downtime_min:"20"};
 const values=run=>Object.fromEntries((run?.metrics||[]).map(x=>[x.key,String(x.value)])),gotA=values(cmp.body?.a),gotB=values(cmp.body?.b);
 const expDiff={input_kg:"-500",good_kg:"-420",scrap_kg:"-80",scrap_rate_pct:"-2",good_rate_pct:"2",material_balance_kg:"0",changeover_min:"-30",downtime_min:"20"};
 const gotDiff=Object.fromEntries((cmp.body?.differences||[]).map(x=>[x.key,String(x.value)]));
 const comparisonFull=Object.entries(expA).every(([k,v])=>gotA[k]===v)&&Object.entries(expB).every(([k,v])=>gotB[k]===v)&&Object.entries(expDiff).every(([k,v])=>gotDiff[k]===v);
 rec("Najm baseline comparison matches all expected run and B-A difference values",cmp.status===200&&comparisonFull,{status:cmp.status,a:gotA,b:gotB,differences:gotDiff,expectedA:expA,expectedB:expB,expectedDifferences:expDiff});
 await p.setViewportSize({width:1280,height:1000});await pref(p,"en","light");
 for(const [step,route] of [["upload","/imports?id=new"],["map",`/imports?id=${importId}&step=map`],["check",`/imports?id=${importId}&step=check`]]){
  await p.goto(base+route);await tid(p,"page-imports").waitFor({timeout:15000});if(step==="map")await tid(p,"section-format").waitFor({timeout:15000});if(step==="check")await tid(p,"button-approve").waitFor({timeout:15000});await keyboardAudit(p,`Najm wizard ${step}`);
 }
 for(const [screen,route,trigger] of [["runs",`/runs?source=${encodeURIComponent(source)}`,`link-text-run-input_kg-${nE.id}`],["comparison",`/compare?a=${nE.id}&b=${nB.id}`,"link-source-a-input_kg"],["quality",issuesUrl,q?`button-open-issue-${q.id}`:null]]){
  await p.goto(base+route);await tid(p,screen==="runs"?"page-runs":screen==="comparison"?"page-comparison":"page-quality").waitFor({timeout:15000});
  if(screen==="runs"){await tid(p,"input-runs-source").fill(source);await tid(p,"button-runs-apply").click();}
  await keyboardAudit(p,`Najm ${screen}`);
  if(trigger){await openDrawer(p,trigger);await keyboardAudit(p,`Najm ${screen} Source Drawer`);await closeDrawer(p);}
 }
 // T8/T10-T12 result table names remain explicit and complete.
 rec("Evidence covers every T1-T12 applicability decision",ev.tenancy.some(x=>x.name.startsWith("T1"))&&ev.notApplicable.length>=4,{tenancyRows:ev.tenancy.length,notApplicable:ev.notApplicable});
 ev.finishedAt=new Date().toISOString();ev.summary={passed:ev.journey.filter(x=>x.status==="PASS").length,journey:ev.journey.length,tenancy:ev.tenancy.length,tenancyPassed:ev.tenancy.filter(x=>x.status==="PASS").length,failed:ev.errors.length,matrix:ev.matrix.length,screenshots:ev.screenshots.length,out:path.basename(out)};
 await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(ev,null,2));console.log(JSON.stringify(ev.summary));
 await browser.close();if(ev.errors.length)process.exitCode=1;
}
main().catch(async e=>{ev.errors.push(safe(e.stack||e.message||e));ev.finishedAt=new Date().toISOString();ev.summary={failed:ev.errors.length,journey:ev.journey.length,tenancy:ev.tenancy.length,matrix:ev.matrix.length,screenshots:ev.screenshots.length,out:path.basename(out)};await fs.mkdir(out,{recursive:true}).catch(()=>{});await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(ev,null,2)).catch(()=>{});console.error(`Phase 9 browser verification stopped; evidence ${path.basename(out)}: ${safe(e.message)}`);await browser?.close().catch(()=>{});process.exitCode=1;});
