const base=require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require(path.resolve("scripts/node_modules/playwright-core"));
const resume=process.env.CLARIX_PHASE16_RESUME==="true";
const out=path.resolve(resume?"generated-artifacts/phase16/browser-resume":"generated-artifacts/phase16/browser");
const evidence={screens:[],checks:{},simulated:[],failures:[]};let browser,ctx,page,headers,snapshotId,pair;
async function save(){await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(evidence,null,2));}
async function api(method,url,data){
 const r=await ctx.request[method](base+"/api"+url,{headers,...(data===undefined?{}:{data})});
 const body=await r.json();assert.ok(r.ok(),`${method} ${url} returned ${r.status()}`);return body;
}
async function create(url,data){const r=await ctx.request.post(base+"/api"+url,{headers,data});assert.equal(r.status(),201,`${url}: ${r.status()}`);return r.json();}
async function uploadBaseline(){
 const dir=path.resolve("test-data/ethmar-plastics/00_baseline");
 const names=(await fs.readdir(dir)).filter(n=>n.endsWith(".csv"));
 const files=names.map(name=>({name,bytes:require("node:fs").readFileSync(path.join(dir,name))}));
 const draft=await create("/imports",{sourceName:"Phase16 isolated baseline",files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});
 for(const f of files){const target=draft.files.find(x=>x.name===f.name);assert.ok(target);const r=await fetch(target.uploadUrl,{method:"PUT",body:f.bytes});assert.ok(r.ok,`signed upload ${f.name}`);}
 await api("post",`/imports/${draft.id}/finalize`,{});
 const mapping=JSON.parse(await fs.readFile(path.join(dir,"mapping.json"),"utf8"));
 const codes=await api("post",`/imports/${draft.id}/event-codes`,{mapping});
 mapping.ignored_event_codes=codes.items.filter(x=>!mapping.event_code_map[x.code]).map(x=>x.code);
 const mapped=await ctx.request.put(base+`/api/imports/${draft.id}/mapping`,{headers,data:{mapping}});assert.equal(mapped.status(),200);
 await api("post",`/imports/${draft.id}/check`,{});
 await api("post",`/imports/${draft.id}/approve`,{confirmReplacement:true,replacementCount:0,confirmErrors:true});
}
async function setPrefs(language,theme){
 const r=await ctx.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}});
 assert.equal(r.status(),200,"preference PATCH");await page.setViewportSize({width:language==="en"?360:page.viewportSize().width,height:900});
}
async function assertLayout(width,language,theme){
 const actual=await page.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,dark:document.documentElement.classList.contains("dark"),
  theme:document.documentElement.getAttribute("data-theme"),width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 assert.equal(actual.width,width);assert.equal(actual.scrollWidth,width,`horizontal overflow at ${width}`);
 assert.equal(actual.lang,language);assert.equal(actual.dir,language==="ar"?"rtl":"ltr");assert.equal(actual.dark,theme==="dark");
 evidence.checks.layoutAssertions=(evidence.checks.layoutAssertions||0)+1;return actual;
}
async function shot(name,tag,width,language,theme){
 const p=page.getByTestId(tag);await p.waitFor({state:"visible",timeout:15000});await p.scrollIntoViewIfNeeded();
 await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const dom=await assertLayout(width,language,theme),file=`${name}-${width}-${language}-${theme}.png`;
 await page.screenshot({path:path.join(out,file)});evidence.screens.push({state:name,width,language,theme,file,dom});await save();
}
async function navigatePair(){await page.goto(base+`/comparison?a=${pair.a}&b=${pair.b}`,{waitUntil:"domcontentloaded"});await page.getByTestId("page-comparison").waitFor();}
async function apiExplanation(context){
 const res=await api("post","/ai/explain",{language:"en",...context});
 assert.equal(res.status,"verified");assert.equal(res.statements.length,3,"actual API returns three verified sentences");
 assert.ok(res.statements.every(s=>s.refs.length>0),"each verified sentence has source references");
 evidence.checks[context.snapshotId?"snapshotApi":"comparisonApi"]={status:res.status,sentences:res.statements.length,allReferenced:true};
 return res;
}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 ctx=await browser.newContext();page=await ctx.newPage();page.setDefaultTimeout(15000);
 const guest=await (await ctx.request.get(base+"/api/auth/session")).json();
 const login=await ctx.request.post(base+"/api/auth/login",{headers:{"X-CSRF-Token":guest.csrfToken},
  data:{email:"ethmar.manager@clarix.test",password:process.env.SEED_TEST_PASSWORD}});
 assert.equal(login.status(),200,"isolated Ethmar manager login");
 headers={"X-CSRF-Token":(await login.json()).csrfToken};
 await uploadBaseline();
 const runs=(await api("get","/runs")).items;
 const a=runs.find(r=>r.orderId==="E-01"),b=runs.find(r=>r.orderId==="E-02");assert.ok(a&&b,"baseline E-01/E-02 runs");
 pair={a:a.id,b:b.id};
 const cmp=await api("get",`/comparison?a=${pair.a}&b=${pair.b}`);
 const saved=await create("/snapshots",{a:pair.a,b:pair.b,expectedImportA:a.importId,expectedImportB:b.importId,
  title:"Phase16 isolated comparison",note:"Synthetic baseline only"});
 snapshotId=saved.snapshot.id;
 const initial=await api("get","/ai/consent");assert.equal(initial.enabled,false,"manager factory AI consent defaults off");
 assert.equal(initial.configured,true,"isolated deterministic fake provider is configured");
 await page.goto(base+"/settings",{waitUntil:"domcontentloaded"});await page.getByTestId("section-ai-consent").waitFor();
 await page.getByTestId("status-ai-consent").waitFor();assert.match(await page.getByTestId("status-ai-consent").innerText(),/off/i);
 evidence.checks.managerDefaultOff=true;
 if(!resume){
  await page.setViewportSize({width:360,height:900});
  await navigatePair();await page.getByTestId("state-ai-off").waitFor();await shot("panel-off-default","state-ai-off",360,"en","light");
  // Capture the actual disclosure in every requested preference/viewport combination without enabling consent.
  for(const width of [360,768,1280])for(const language of ["en","ar"])for(const theme of ["light","dark"]){
   await ctx.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}}).then(r=>assert.equal(r.status(),200));
   await page.setViewportSize({width,height:900});await page.goto(base+"/settings",{waitUntil:"domcontentloaded"});
   await page.getByTestId("button-ai-consent-enable").waitFor();await page.getByTestId("button-ai-consent-enable").click();
   await page.getByTestId("dialog-ai-consent").waitFor();await page.getByTestId("text-ai-consent-disclosure").waitFor();
   const disclosure=await page.getByTestId("text-ai-consent-disclosure").innerText();
   assert.ok(disclosure.length>80&&await page.getByTestId("link-ai-terms").count()===1);
   const confirm=page.getByTestId("button-ai-consent-confirm");assert.equal(await confirm.isDisabled(),true,"consent requires affirmative checkbox");
   await shot("consent-dialog","dialog-ai-consent",width,language,theme);
   await page.getByTestId("button-ai-consent-cancel").click();await page.getByTestId("dialog-ai-consent").waitFor({state:"hidden"});
  }
 }
 // Exercise the actual settings disclosure confirmation and manager-only enable action.
  await ctx.request.patch(base+"/api/preferences",{headers,data:{language:"en",theme:"light",tourCompleted:true}}).then(r=>assert.equal(r.status(),200));
 await page.setViewportSize({width:1280,height:900});await page.goto(base+"/settings",{waitUntil:"domcontentloaded"});
 await page.getByTestId("button-ai-consent-enable").click();await page.getByTestId("checkbox-ai-consent-confirm").click();
  const enabledWait=page.waitForResponse(r=>r.url().includes("/api/ai/consent")&&r.request().method()==="PUT");
  await page.getByTestId("button-ai-consent-confirm").click();const enabledResponse=await enabledWait;
  let enabledBody={};try{enabledBody=await enabledResponse.json();}catch{}
  const statusOn=async()=>await page.evaluate(()=>document.querySelector('[data-testid="status-ai-consent"]')?.textContent?.trim().toLowerCase()==="on");
  evidence.checks.enableTransition={httpStatus:enabledResponse.status(),apiEnabled:enabledBody.enabled===true};
  assert.equal(enabledResponse.status(),200,"actual consent PUT succeeds");
  assert.equal(enabledBody.enabled,true,"consent PUT response enables AI");
  try{await page.waitForFunction(()=>document.querySelector('[data-testid="status-ai-consent"]')?.textContent?.trim().toLowerCase()==="on",undefined,{timeout:12000});}
  catch{evidence.checks.enableTransition.visibleStatus=(await page.getByTestId("status-ai-consent").innerText().catch(()=>"" )).slice(0,80);throw new Error("Consent PUT succeeded but visible consent status did not become On");}
  assert.equal(await statusOn(),true);assert.equal((await api("get","/ai/consent")).enabled,true);
  evidence.checks.consentEnabledByUi=true;
 // Execute real application API explanation in comparison and verify its strict three-sentence response.
 await navigatePair();await page.getByTestId("button-ai-explain").waitFor();
 let actualComparison;
 const responseWait=page.waitForResponse(r=>r.url().includes("/api/ai/explain")&&r.request().method()==="POST");
 await page.getByTestId("button-ai-explain").click();const answerResponse=await responseWait;assert.equal(answerResponse.status(),200);
  actualComparison=await answerResponse.json();assert.equal(actualComparison.status,"verified");assert.equal(actualComparison.statements.length,3);
  assert.ok(actualComparison.statements.every(s=>s.refs.length>0));evidence.checks.comparisonApi={status:actualComparison.status,sentences:3,allReferenced:true};
 await page.getByTestId("state-ai-verified").waitFor();evidence.checks.comparisonUiVerified=true;
 // Snapshot explanation is also obtained from the actual isolated API and displayed in the real panel.
 await apiExplanation({snapshotId});await page.goto(base+`/snapshots/${snapshotId}`,{waitUntil:"domcontentloaded"});
 await page.getByTestId("panel-ai").waitFor();await page.getByTestId("button-ai-explain").click();
 await page.getByTestId("state-ai-verified").waitFor();assert.equal(await page.getByTestId("text-ai-statement-0").count(),1);
 const source=page.locator('[data-testid^="button-ai-source-"]').first();await source.waitFor();await source.click();
 await page.getByTestId("drawer-source").waitFor();evidence.checks.snapshotUiVerified=true;evidence.checks.sourceDrawerOpened=true;
 await shot("snapshot-source-drawer","drawer-source",1280,"en","light");
 await page.getByTestId("drawer-source").getByRole("button").first().waitFor({timeout:3000}).catch(()=>{});
 await page.keyboard.press("Escape");await page.getByTestId("drawer-source").waitFor({state:"hidden"}).catch(()=>{});
 // Capture loading, answer, network-error and quota/unavailable presentation states across the requested matrix.
 for(const width of [360,768,1280])for(const language of ["en","ar"])for(const theme of ["light","dark"]){
  await ctx.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}}).then(r=>assert.equal(r.status(),200));
  await page.setViewportSize({width,height:900});await navigatePair();await page.getByTestId("button-ai-explain").waitFor();
   let release;const gate=new Promise(resolve=>release=resolve);let hit;
  const seen=new Promise(resolve=>hit=resolve);
  await page.route("**/api/ai/explain",async route=>{hit();await gate;await route.continue();});
   const answerWait=page.waitForResponse(r=>r.url().includes("/api/ai/explain")&&r.request().method()==="POST");
   await page.getByTestId("button-ai-explain").click();await seen;await page.getByTestId("state-ai-working").waitFor();
  evidence.simulated.push({state:"loading",width,language,theme,method:"delayed real isolated API request"});
   await shot("panel-loading","state-ai-working",width,language,theme);release();
   const realAnswer=await answerWait;assert.equal(realAnswer.status(),200);actualComparison=await realAnswer.json();
   assert.equal(actualComparison.status,"verified");assert.equal(actualComparison.statements.length,3);
   assert.ok(actualComparison.statements.every(s=>s.refs.length>0));
   await page.getByTestId("state-ai-verified").waitFor();await page.unroute("**/api/ai/explain");
  await shot("panel-answer","state-ai-verified",width,language,theme);
  const btn=page.getByTestId("button-ai-again");
  await page.route("**/api/ai/explain",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"AI_SERVICE_UNAVAILABLE"})}));
  await btn.click();await page.getByTestId("state-ai-request-error").waitFor();
  evidence.simulated.push({state:"error",width,language,theme,method:"intercepted visual-only API failure"});
  await shot("panel-error","state-ai-request-error",width,language,theme);await page.unroute("**/api/ai/explain");
  const baseResult=actualComparison;
  const statusResponse=(status)=>({...baseResult,status,statements:[],fallback:"",retryAfter:status==="quota"?60:0,cached:false});
   for(const [i,status] of ["quota","unavailable"].entries()){
   await page.route("**/api/ai/explain",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(statusResponse(status))}));
    await page.getByTestId(i===0?"button-ai-retry":"button-ai-again").click();await page.getByTestId(`state-ai-${status}`).waitFor();
   evidence.simulated.push({state:status,width,language,theme,method:"intercepted visual-only API response"});
   await shot(`panel-${status}`,`state-ai-${status}`,width,language,theme);await page.unroute("**/api/ai/explain");
  }
 }
 // Disable using the manager confirmation UI, then verify the comparison panel is off.
 await page.setViewportSize({width:1280,height:900});await page.goto(base+"/settings",{waitUntil:"domcontentloaded"});
 await page.getByTestId("button-ai-consent-disable").click();await page.getByTestId("dialog-ai-consent-disable").waitFor();
 const disabledWait=page.waitForResponse(r=>r.url().includes("/api/ai/consent")&&r.request().method()==="PUT");
 await page.getByTestId("button-ai-consent-confirm-disable").click();const disabledResponse=await disabledWait;
 let disabledBody={};try{disabledBody=await disabledResponse.json();}catch{}
 evidence.checks.disableTransition={httpStatus:disabledResponse.status(),apiEnabled:disabledBody.enabled===true};
 assert.equal(disabledResponse.status(),200,"actual consent disable PUT succeeds");assert.equal(disabledBody.enabled,false);
 try{await page.waitForFunction(()=>document.querySelector('[data-testid="status-ai-consent"]')?.textContent?.trim().toLowerCase()==="off",undefined,{timeout:12000});}
 catch{evidence.checks.disableTransition.visibleStatus=(await page.getByTestId("status-ai-consent").innerText().catch(()=>"" )).slice(0,80);throw new Error("Consent disable PUT succeeded but visible consent status did not become Off");}
 assert.equal((await api("get","/ai/consent")).enabled,false);evidence.checks.consentDisabledByUi=true;
 await navigatePair();await page.getByTestId("state-ai-off").waitFor();evidence.checks.comparisonPanelOffAfterDisable=true;
 evidence.checks.screenshotCount=evidence.screens.length;await save();
 console.log(JSON.stringify({result:"completed",screenshotCount:evidence.screens.length,simulatedCases:evidence.simulated.length,checks:evidence.checks}));
})().catch(async e=>{
 evidence.failures.push({fatal:String(e.message||"failure").split("\n")[0].replace(/https?:\/\/\S+/g,"[url]")});
 await save();console.error(JSON.stringify(evidence.failures.at(-1)));process.exitCode=1;
}).finally(async()=>{await browser?.close();});
