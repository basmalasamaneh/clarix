require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID}=require("node:crypto");
const {chromium}=require(path.resolve("scripts/node_modules/playwright-core"));
const base=process.env.CLARIX_TEST_BASE_URL,password=process.env.SEED_TEST_PASSWORD;
const out=path.resolve(`generated-artifacts/phase14/${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID().slice(0,8)}`);
const ev={environment:"isolated schema only",startedAt:new Date().toISOString(),journey:[],matrix:[],screenshots:[],apiFailures:[],sourceRequests:[],errors:[]};
let browser,ctx,page,snapshotId,runA,runB,source,initialRecordId,writeQueue=Promise.resolve();
const t=(p,id)=>p.getByTestId(id);
async function save(){ev.updatedAt=new Date().toISOString();await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(ev,null,2));}
function queueSave(){writeQueue=writeQueue.then(save).catch(()=>{});return writeQueue;}
function check(name,ok,details={}){ev.journey.push({name,status:ok?"PASS":"FAIL",...details});if(!ok)ev.errors.push(name+" failed");queueSave();}
async function shot(p,name,full=false){const file=`${name}.png`;await p.screenshot({path:path.join(out,file),fullPage:full,mask:[p.locator('input[type=password]')],maskColor:"#000"});ev.screenshots.push(file);await save();return file;}
async function login(p,email){p.setDefaultTimeout(4000);p.setDefaultNavigationTimeout(12000);await p.goto(base+"/login");await t(p,"input-email").waitFor({timeout:15000});await t(p,"input-email").fill(email);await t(p,"input-password").fill(password);await t(p,"button-login").click();await t(p,"button-user-menu").waitFor({timeout:15000});}
async function pref(p,lang,theme){
 if((await p.locator("html").getAttribute("lang"))!==lang)await p.locator('[data-testid="button-language"]:visible').first().click();
 const now=await p.locator("html").evaluate(e=>e.classList.contains("dark")?"dark":"light");
 if(now!==theme){await p.locator('[data-testid="button-theme"]:visible').first().click();await t(p,`option-theme-${theme}`).click();}
 await p.waitForFunction(x=>document.documentElement.lang===x,lang,{timeout:5000});
}
async function upload(folder,sourceName){
 const dir=path.resolve("test-data",folder),files=(await fs.readdir(dir)).filter(n=>n.endsWith(".csv")).map(name=>({name,bytes:require("node:fs").readFileSync(path.join(dir,name))}));
 const mapping=JSON.parse(await fs.readFile(path.join(dir,"mapping.json"),"utf8"));
 const session=await (await ctx.request.get(base+"/api/auth/session")).json(),csrf=session.csrfToken;
 const draftRes=await ctx.request.post(base+"/api/imports",{headers:{"X-CSRF-Token":csrf},data:{sourceName,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))}});
 if(draftRes.status()!==201)throw Error("create import status "+draftRes.status());
 const draft=await draftRes.json();
 for(const f of files){const signed=draft.files.find(x=>x.name===f.name).uploadUrl;const r=await fetch(signed,{method:"PUT",body:f.bytes});if(!r.ok)throw Error("fixture upload failed");}
 const headers={"X-CSRF-Token":csrf};
 let r=await ctx.request.post(`${base}/api/imports/${draft.id}/finalize`,{headers});if(r.status()!==200)throw Error("finalize status "+r.status());
 const codes=await (await ctx.request.post(`${base}/api/imports/${draft.id}/event-codes`,{headers,data:{mapping}})).json();
 mapping.ignored_event_codes=(codes.items||[]).filter(c=>!mapping.event_code_map?.[c.code]).map(c=>c.code);
 r=await ctx.request.put(`${base}/api/imports/${draft.id}/mapping`,{headers,data:{mapping}});if(r.status()!==200)throw Error("save mapping status "+r.status());
 r=await ctx.request.post(`${base}/api/imports/${draft.id}/check`,{headers});if(r.status()!==200)throw Error("check status "+r.status());
 const checked=await r.json();
 r=await ctx.request.post(`${base}/api/imports/${draft.id}/approve`,{headers,data:{confirmReplacement:true,replacementCount:checked.replacementCount||0,confirmErrors:true}});
 if(r.status()!==200)throw Error("approve status "+r.status());
 return {id:draft.id,check:checked,approved:await r.json()};
}
async function geometry(p){return p.evaluate(()=>{const controls=[...document.querySelectorAll('a,button,[role=button],input,select,textarea,[role=combobox]')].filter(e=>e.getClientRects().length);const small=controls.map(e=>{const z=e.matches('input[type=checkbox]')?(e.closest('label')||e):e,r=z.getBoundingClientRect();return{testId:e.getAttribute('data-testid'),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x=>x.w<44||x.h<44);const overflow=[...document.querySelectorAll('main h1,main h2,main h3,main p,main label,main button,main span,main dd')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflow!=="hidden"&&getComputedStyle(e).textOverflow!=="ellipsis").map(e=>(e.innerText||"").trim().slice(0,70)).filter(Boolean).slice(0,15);const wide=[...document.querySelectorAll("body *")].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{tag:e.tagName,testId:e.getAttribute("data-testid"),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:e.scrollWidth}}).filter(x=>x.right>innerWidth+2||x.left< -2).sort((a,b)=>b.right-a.right).slice(0,8);const a=document.activeElement,s=a&&getComputedStyle(a),root=getComputedStyle(document.documentElement);return{inner:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.classList.contains("dark")?"dark":"light",overflow,wide,smallTargets:small.slice(0,12),smallCount:small.length,focus:{testId:a?.getAttribute("data-testid"),visible:a?.matches(":focus-visible"),outline:s?.outlineStyle,outlineWidth:s?.outlineWidth},colors:{background:root.getPropertyValue("--background").trim(),foreground:root.getPropertyValue("--foreground").trim(),primary:root.getPropertyValue("--primary").trim(),green:root.getPropertyValue("--status-green").trim(),amber:root.getPropertyValue("--status-amber").trim(),red:root.getPropertyValue("--status-red").trim()}};});}
async function cell(p,surface,w,lang,theme,route){
 const item={surface,width:w,lang,theme,route};const name=`${surface}-${w}-${lang}-${theme}`;
 try{await p.setViewportSize({width:w,height:900});await pref(p,lang,theme);await p.goto(base+route);const expectId=surface==="list"?"page-snapshots":surface==="detail"||surface==="form"||surface==="drawer"?"page-snapshot-detail":surface==="comparison"?"page-comparison":"card-help-snapshots";await t(p,expectId).waitFor({timeout:12000});
 if(surface==="form")await t(p,"section-add-reconciliation").scrollIntoViewIfNeeded();
 if(surface==="drawer"){const u=new URL(p.url());u.searchParams.set("sourceKind","metric");u.searchParams.set("sourceId",runA||"00000000-0000-4000-8000-000000000000");u.searchParams.set("sourceMetric","scrap_kg");u.searchParams.set("sourceSnapshot",snapshotId);await p.goto(u.href);await t(p,"drawer-source").waitFor({timeout:10000}).catch(()=>{});await Promise.race([t(p,"section-source-value").waitFor({timeout:8000}),t(p,"state-source-not-found").waitFor({timeout:8000})]).catch(()=>{});}
 if(surface==="comparison"){await t(p,"section-snapshot-panel").waitFor({timeout:10000}).catch(()=>{});await t(p,"section-snapshot-panel").scrollIntoViewIfNeeded().catch(()=>{});}
 await p.keyboard.press("Tab").catch(()=>{});item.dom=await geometry(p);item.screenshot=await shot(p,name);item.ok=item.dom.doc<=w&&item.dom.body<=w&&item.dom.lang===lang&&item.dom.dir===(lang==="ar"?"rtl":"ltr")&&item.dom.theme===theme&&item.dom.overflow.length===0;
 }catch(e){item.ok=false;item.error=String(e.message||e).slice(0,200);try{item.screenshot=await shot(p,name+"-failure")}catch{}}
  if(surface==="drawer")await t(p,"button-close-source").click().catch(()=>{});
  ev.matrix.push(item);await save();
}
async function journey(){
 await login(page,"ethmar.analyst@clarix.test");
 await page.goto(base+"/snapshots");await t(page,"page-snapshots").waitFor({timeout:12000});await t(page,"state-snapshots-empty").waitFor({timeout:12000});
 check("Analyst snapshots initially empty",true,{state:"state-snapshots-empty"});await shot(page,"snapshots-empty");
 source=`Phase14-${randomUUID()}`;const baseline=await upload("ethmar-plastics/00_baseline",source);
 const found=await (await ctx.request.get(base+"/api/source-runs?search="+encodeURIComponent(source))).json();
 const runs=found.items||[];runA=runs.find(x=>x.orderId==="E-01")?.id;runB=runs.find(x=>x.orderId==="E-02")?.id;
 if(!runA||!runB)throw Error("approved fixture source runs not found");
 check("Baseline fixture approved through real API",true,{runCount:runs.length,approved:baseline.approved.status});
 await page.goto(`${base}/comparison?a=${runA}&b=${runB}`);await t(page,"section-snapshot-panel").waitFor({timeout:15000});
 const figureFields=await page.locator('[data-testid^="input-figure-"]').count();
 check("Comparison reconciliation form renders all ten figure inputs",figureFields===11,{figureInputs:figureFields,expectedTenFiguresPlusOrigin:11});
 for(const [id,val] of [["input-figure-a-input_kg","1000"],["input-figure-a-scrap_kg","50"],["input-figure-b-scrap_kg","100.1"],["input-figure-origin","Phase14 reported values"]])await t(page,id).fill(val);
 await t(page,"button-preview-reconciliation").click();await t(page,"table-reconciliation-preview").waitFor({timeout:12000});
 const preview=await t(page,"table-reconciliation-preview").innerText();
 const previewValues={matched:await t(page,"status-rec-a-input_kg").innerText().catch(()=>""),difference:await t(page,"text-rec-diff-b-scrap_kg").innerText().catch(()=>""),notProvided:await t(page,"status-rec-a-changeover_min").innerText().catch(()=>""),rows:await page.locator('[data-testid^="row-rec-"]').count()};
 check("Preview matches figures, shows 0.1 difference and explicit Not provided",preview.includes("1000")&&preview.includes("50")&&preview.includes("100.1")&&/0\.1/.test(previewValues.difference)&&/not provided/i.test(previewValues.notProvided)&&previewValues.rows===10,{matchedInput:previewValues.matched,difference:previewValues.difference,notProvided:previewValues.notProvided,rowCount:previewValues.rows});
 await t(page,"button-open-save-snapshot").click();await t(page,"dialog-save-snapshot").waitFor();await shot(page,"save-snapshot-dialog");
 await page.keyboard.press("Escape");await page.waitForTimeout(250);const escapeClosed=!(await t(page,"dialog-save-snapshot").isVisible().catch(()=>false));
 if(!escapeClosed)await t(page,"button-cancel-save-snapshot").click();
 await t(page,"dialog-save-snapshot").waitFor({state:"hidden"});check("Save dialog Escape/cancel behavior",true,{escapeClosed,explicitCancelUsed:!escapeClosed});
 await t(page,"button-open-save-snapshot").click();await t(page,"dialog-save-snapshot").waitFor();
 const title=`Phase14 ${Date.now()}`;await t(page,"input-snapshot-title").fill(title);await t(page,"input-snapshot-note").fill("Frozen baseline values");
 const focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.getAttribute("data-testid"),outline:getComputedStyle(document.activeElement).outlineStyle}));
 await t(page,"button-confirm-save-snapshot").click();await t(page,"page-snapshot-detail").waitFor({timeout:15000});snapshotId=new URL(page.url()).pathname.split("/").pop();
 await t(page,"banner-snapshot-frozen").waitFor();await t(page,"list-reconciliations").waitFor({timeout:12000});
 check("Save immutable titled snapshot and initial reconciliation record",await t(page,"text-snapshot-title").innerText()===title&&await page.locator('[data-testid^="card-reconciliation-"]').count()===1,{snapshotId,keyboardFocus:focus,initialRecordCount:await page.locator('[data-testid^="card-reconciliation-"]').count()});
  await page.reload();await t(page,"banner-snapshot-frozen").waitFor({timeout:12000});await t(page,"section-charts").waitFor({timeout:12000});await t(page,"list-reconciliations").waitFor({timeout:12000});
  initialRecordId=(await page.locator('[data-testid^="card-reconciliation-"]').first().getAttribute("data-testid")).replace("card-reconciliation-","");
  check("Reload retains frozen snapshot, charts, table and initial reconciliation record",await t(page,"text-snapshot-title").innerText()===title&&await page.locator('[data-testid^="card-reconciliation-"]').count()===1,{charts:await t(page,"section-charts").count(),table:await page.locator('[data-testid^="row-metric-"]').count(),historyCards:await page.locator('[data-testid^="card-reconciliation-"]').count(),initialRecordId});
 const firstSource=await ctx.request.get(`${base}/api/source-detail?${new URLSearchParams({snapshot:snapshotId,kind:"metric",id:runA,metric:"scrap_rate_pct",page:"1"})}`);
 const frozenSource=await firstSource.json();const originalRowIds=(frozenSource.rows||[]).map(x=>x.id).sort(),originalImportIds=(frozenSource.imports||[]).map(x=>x.id).sort();
 check("Read snapshot source before replacement",firstSource.status()===200&&originalRowIds.length>0&&originalImportIds.length===1,{status:firstSource.status(),rowCount:originalRowIds.length,importCount:originalImportIds.length});
  const detailLinks=["link-source-a-input_kg","link-source-d-scrap_rate_pct","chart-scrap_rate_pct-link-difference"];
 for(const [i,id] of detailLinks.entries()){
  const link=t(page,id);if(await link.count()){await link.click();await t(page,"drawer-source").waitFor({timeout:10000});await page.waitForTimeout(300);const observed=ev.sourceRequests.at(-1);check(`Snapshot source drawer link ${id} carries frozen scope`,!!observed&&observed.snapshot===snapshotId,{request:observed||null});if(i===2)await shot(page,"snapshot-source-chart-drawer");await t(page,"button-close-source").click();}else check(`Snapshot source drawer link ${id} is present`,false);
 }
 await page.goto(base+`/snapshots/${snapshotId}`);await t(page,"section-add-reconciliation").waitFor();
 for(const [id,val] of [["input-figure-a-input_kg","1000"],["input-figure-a-scrap_kg","55"],["input-figure-b-scrap_kg","105"],["input-figure-origin","Phase14 later report"]])await t(page,id).fill(val);
 await page.locator('[data-testid="section-add-reconciliation"]').scrollIntoViewIfNeeded();
 await t(page,"button-open-add-reconciliation").click();await t(page,"dialog-add-reconciliation").waitFor();await shot(page,"add-reconciliation-dialog");
 await page.keyboard.press("Escape");await page.waitForTimeout(250);const addEscapeClosed=!(await t(page,"dialog-add-reconciliation").isVisible().catch(()=>false));
 if(!addEscapeClosed)await t(page,"button-cancel-add-reconciliation").click();await t(page,"dialog-add-reconciliation").waitFor({state:"hidden"});
 check("Reconciliation dialog Escape/cancel behavior",true,{escapeClosed:addEscapeClosed,explicitCancelUsed:!addEscapeClosed});
 await t(page,"button-open-add-reconciliation").click();await t(page,"dialog-add-reconciliation").waitFor();await t(page,"button-confirm-add-reconciliation").click();
  await t(page,"list-reconciliations").waitFor({timeout:15000});check("Reconciliation record persists",await page.locator('[data-testid^="card-reconciliation-"]').count()===2,{historyCards:await page.locator('[data-testid^="card-reconciliation-"]').count()});
 const recordId=(await page.locator('[data-testid^="card-reconciliation-"]').first().getAttribute("data-testid")).replace("card-reconciliation-","");
 const recText=await t(page,`table-reconciliation-${recordId}`).innerText();
 check("New reconciliation record values persist",recText.includes("55")&&recText.includes("105")&&recText.includes("50"),{recordId,reportedValuesPresent:recText.includes("55")&&recText.includes("105"),differencePresent:recText.includes("50")});
 const repl=await upload("ethmar-plastics/07_missing_scrap_value",source);
 await page.goto(base+`/snapshots/${snapshotId}`);await t(page,"banner-snapshot-frozen").waitFor({timeout:12000});
  const snapshotValues={aScrap:await t(page,"text-a-scrap_rate_pct").innerText().catch(()=>""),bScrap:await t(page,"text-b-scrap_rate_pct").innerText().catch(()=>""),diffScrap:await t(page,"text-diff-scrap_rate_pct").innerText().catch(()=>""),aChange:await t(page,"text-a-changeover_min").innerText().catch(()=>""),bChange:await t(page,"text-b-changeover_min").innerText().catch(()=>""),initialReported:await t(page,`table-reconciliation-${initialRecordId}`).innerText().catch(()=> "")};
 const frozenValuesOk=/\b5\b/.test(snapshotValues.aScrap)&&/\b10\b/.test(snapshotValues.bScrap)&&/\b5\b/.test(snapshotValues.diffScrap)&&/\b240\b/.test(snapshotValues.aChange)&&/\b360\b/.test(snapshotValues.bChange)&&snapshotValues.initialReported.includes("50")&&snapshotValues.initialReported.includes("100.1");
 check("After replacement frozen snapshot and original reconciliation retain 5/10/+5pp/240/360",frozenValuesOk,snapshotValues);
 const changed=await t(page,"badge-snapshot-changed").count();check("Snapshot detail exposes changes after replacement",changed===1,{changedBadgeCount:changed,changes:await t(page,"section-snapshot-changes").count(),replacementStatus:repl.approved.status});
 const changesText=await t(page,"section-snapshot-changes").innerText(),historyText=await t(page,"section-reconciliation-history").innerText();
 check("Changes panel surfaces replacement null/status changes and saved history",/scrap/i.test(changesText)&&/missing|empty|not provided|غير متوفر/i.test(changesText+" "+historyText),{changesPreview:changesText.slice(0,500),historyCards:await page.locator('[data-testid^="card-reconciliation-"]').count()});
 const afterSourceRes=await ctx.request.get(`${base}/api/source-detail?${new URLSearchParams({snapshot:snapshotId,kind:"metric",id:runA,metric:"scrap_rate_pct",page:"1"})}`);
 const afterSource=await afterSourceRes.json();const afterRowIds=(afterSource.rows||[]).map(x=>x.id).sort(),afterImportIds=(afterSource.imports||[]).map(x=>x.id).sort();
 check("Snapshot-scoped source drawer remains tied to original source rows after replacement",afterSourceRes.status()===200&&JSON.stringify(afterRowIds)===JSON.stringify(originalRowIds)&&JSON.stringify(afterImportIds)===JSON.stringify(originalImportIds),{status:afterSourceRes.status(),originalRows:originalRowIds.length,afterRows:afterRowIds.length,importsUnchanged:JSON.stringify(afterImportIds)===JSON.stringify(originalImportIds)});
  const newRunsData=await (await ctx.request.get(base+"/api/source-runs?search="+encodeURIComponent(source))).json(),newRuns=newRunsData.items||[];
  const newA=newRuns.find(x=>x.orderId==="E-01"&&x.importId===repl.id)?.id,newB=newRuns.find(x=>x.orderId==="E-02"&&x.importId===repl.id)?.id;
  if(newA&&newB){await page.goto(`${base}/comparison?a=${newA}&b=${newB}`);await t(page,"page-comparison").waitFor();await t(page,"section-snapshot-panel").waitFor({timeout:10000});const red=await t(page,"state-group-blocked-volume").count();const unavailable=await t(page,"text-a-input_kg").innerText().catch(()=> "");check("Current comparison marks blocked volume and missing Input unavailable",red===1&&/unavailable|not available|n\/a|غير متوفر/i.test(unavailable),{blockedVolume:red,inputStatus:unavailable});}else check("Replacement exposes current comparison runs",false,{currentRunCount:newRuns.length});
 // Role isolation checks use real logins in separate browser contexts, never shared preference state.
 for(const [email,role] of [["ethmar.viewer@clarix.test","viewer"],["platform.admin@clarix.test","platform"],["najm.manager@clarix.test","najm"]]){
  const c=await browser.newContext({viewport:{width:1280,height:900}}),p=await c.newPage();try{await login(p,email);await p.goto(base+`/snapshots/${snapshotId}`);
   if(role==="viewer"){await t(p,"banner-snapshot-frozen").waitFor({timeout:10000});check("Viewer real login can read snapshot but cannot write",await t(p,"text-snapshot-readonly").count()===1&&await t(p,"section-add-reconciliation").count()===0);}
   else if(role==="platform"){await t(p,"state-forbidden").waitFor({timeout:10000});check("Platform real login receives 403/no snapshot",await t(p,"page-snapshot-detail").count()===0);}
   else {await t(p,"state-snapshot-not-found").waitFor({timeout:10000});check("Najm real login cannot open foreign snapshot (404)",true);}
  }catch(e){check(`${role} real login access boundary`,false,{error:String(e.message||e).slice(0,180)});}finally{await c.close();}
 }
}
async function simulateStates(p,id){
 ev.simulations=[];
 const record=async(name,ok,details)=>{ev.simulations.push({name,status:ok?"PASS":"FAIL",...details});if(!ok)ev.errors.push(name+" failed");await save();};
 let release;
 try{
  const gate=new Promise(r=>release=r);
  await p.route(u=>new URL(u).pathname==="/api/snapshots",async route=>{await gate;await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({items:[],page:1,total:0})});});
  await p.goto(base+"/snapshots");await t(p,"state-snapshots-loading").waitFor({timeout:8000});await shot(p,"simulated-snapshots-loading");release();
  await t(p,"state-snapshots-empty").waitFor({timeout:8000});await record("Snapshots loading then successful empty response",true,{loadingSeen:true,terminal:"state-snapshots-empty"});
 }catch(e){release?.();await record("Snapshots loading simulation",false,{error:String(e.message||e).slice(0,160)});try{await shot(p,"simulated-loading-failure")}catch{}}
 finally{await p.unrouteAll().catch(()=>{});}
 try{
  await p.route(u=>new URL(u).pathname==="/api/snapshots",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"SERVICE_UNAVAILABLE",message:"Phase14 synthetic response"})}));
  await p.goto(base+"/snapshots");await t(p,"state-snapshots-error").waitFor({timeout:10000});await shot(p,"simulated-snapshots-error");
  await record("Synthetic snapshots HTTP 503 renders designed error state",true,{state:"state-snapshots-error",httpStatus:503});
  await p.unrouteAll();
 }catch(e){await record("Synthetic snapshots HTTP 503 state",false,{error:String(e.message||e).slice(0,160)});try{await shot(p,"simulated-error-failure")}catch{}}
 try{
  const missing=randomUUID();
  await p.route(u=>new URL(u).pathname===`/api/snapshots/${missing}`,route=>route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({error:"NOT_FOUND",message:"Phase14 synthetic response"})}));
  await p.goto(base+`/snapshots/${missing}`);await t(p,"state-snapshot-not-found").waitFor({timeout:10000});await shot(p,"simulated-snapshot-not-found");
  await record("Synthetic snapshot HTTP 404 renders not-found state",true,{state:"state-snapshot-not-found",httpStatus:404});
  await p.unrouteAll();
 }catch(e){await record("Synthetic snapshot HTTP 404 state",false,{error:String(e.message||e).slice(0,160)});try{await shot(p,"simulated-notfound-failure")}catch{}}
}
async function main(){
 await fs.mkdir(out,{recursive:true});if(!base||!password)throw Error("Isolated target or test credential unavailable");
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});ctx=await browser.newContext({viewport:{width:1280,height:900}});page=await ctx.newPage();
 page.on("request",r=>{try{const u=new URL(r.url());if(u.pathname==="/api/source-detail"){const q=u.searchParams;ev.sourceRequests.push({method:r.method(),kind:q.get("kind"),id:q.get("id"),metric:q.get("metric"),other:q.get("other"),snapshot:q.get("snapshot")});save().catch(()=>{});}}catch{}});
 page.on("response",r=>{try{const u=new URL(r.url());if(u.pathname.startsWith("/api/")&&r.status()>=400){void r.text().then(body=>{ev.apiFailures.push({method:r.request().method(),path:u.pathname,status:r.status(),body:String(body).replace(/https?:\/\/\S+/g,"[url redacted]").replace(/(password|token|secret|csrf)[^,}]*([,:=])[^,}]*/ig,"$1:[redacted]").slice(0,500)});save().catch(()=>{});});}}catch{}});
  try{await journey();}catch(e){check("Journey driver reached planned end",false,{error:String(e.message||e).slice(0,350)});try{if(page&&await page.locator("body").count())await shot(page,"journey-failure");}catch{}}
  const matrixId=snapshotId||"00000000-0000-4000-8000-000000000000";
  if(!snapshotId)ev.errors.push("Journey did not produce a snapshot; continuing matrix against not-found fixture route.");
  const surfaces=[["list","/snapshots"],["detail",`/snapshots/${matrixId}`],["form",`/snapshots/${matrixId}`],["comparison",runA&&runB?`/comparison?a=${runA}&b=${runB}`:"/comparison"],["drawer",`/snapshots/${matrixId}`],["help","/help"]];
  for(const [surface,route] of surfaces)for(const w of [360,768,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"])await cell(page,surface,w,lang,theme,route);
  const statePage=await ctx.newPage();await simulateStates(statePage,matrixId);await statePage.close();
  ev.finishedAt=new Date().toISOString();ev.summary={journey:ev.journey.length,journeyPassed:ev.journey.filter(x=>x.status==="PASS").length,journeyFailed:ev.journey.filter(x=>x.status==="FAIL").length,matrixExpected:72,matrix:ev.matrix.length,matrixPassed:ev.matrix.filter(x=>x.ok).length,matrixFailed:ev.matrix.filter(x=>!x.ok).length,simulations:ev.simulations?.length||0,apiFailures:ev.apiFailures.length,screenshots:ev.screenshots.length,out};await queueSave();await save();console.log(JSON.stringify(ev.summary));await browser.close();if(ev.errors.length)process.exitCode=1;
}
main().catch(async e=>{ev.errors.push("Driver stopped: "+String(e.message||e).slice(0,400));ev.finishedAt=new Date().toISOString();await fs.mkdir(out,{recursive:true}).catch(()=>{});ev.summary={failed:true,matrix:ev.matrix.length,journey:ev.journey.length,out};await save().catch(()=>{});console.error("Phase14 isolated browser run stopped; inspect evidence.json");await browser?.close().catch(()=>{});process.exitCode=1;});
