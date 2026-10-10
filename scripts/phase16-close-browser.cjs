const base=require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const {chromium}=require(path.resolve("scripts/node_modules/playwright-core"));
const out=path.resolve("generated-artifacts/phase16-close/browser"),images=path.join(out,"images");
const evidence={result:"RUNNING",checks:{},http:{},screenshots:[],failures:[]};let browser;
async function save(){await fs.mkdir(images,{recursive:true});await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(evidence,null,2));}
async function screenshot(page,name){
 const file=path.join(images,`${name}.png`);await page.screenshot({path:file});
 evidence.screenshots.push({file:file.replace(process.cwd()+"/",""),sha256:crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex")});
 await save();
}
async function login(email,role){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.setDefaultTimeout(15000);
 await page.goto(base+"/login",{waitUntil:"domcontentloaded"});
 await page.getByTestId("input-email").fill(email);
 await page.getByTestId("input-password").fill(process.env.SEED_TEST_PASSWORD);
 await page.getByTestId("button-login").click();await page.waitForURL(u=>!u.pathname.endsWith("/login"));
 const s=await(await context.request.get(base+"/api/auth/session")).json();
 assert.ok(s.user,"UI login did not establish a session");
 const membership=s.memberships.find(m=>m.factoryId===s.activeFactoryId);
 assert.equal(membership?.role,role,`unexpected signed-in role for ${role}`);
 const headers={"X-CSRF-Token":s.csrfToken};
 const pref=await context.request.patch(base+"/api/preferences",{headers,data:{tourCompleted:true}});
 assert.equal(pref.status(),200,"dismiss onboarding via account preferences");
 evidence.checks[role]={uiLogin:true,activeFactoryRole:membership.role,onboardingDismissed:true};
 return {context,page,headers,session:s};
}
async function api(actor,method,url,data){
 const r=await actor.context.request[method](base+"/api"+url,{headers:actor.headers,...(data===undefined?{}:{data})});
 let body={};try{body=await r.json();}catch{}
 evidence.http[`${actor.session.memberships.find(m=>m.factoryId===actor.session.activeFactoryId)?.role} ${method.toUpperCase()} ${url}`]={status:r.status(),...(typeof body.enabled==="boolean"?{enabled:body.enabled}:{}),...(typeof body.configured==="boolean"?{configured:body.configured}:{})};
 await save();return {response:r,body};
}
async function uploadBaseline(actor){
 const dir=path.resolve("test-data/ethmar-plastics/00_baseline"),names=(await fs.readdir(dir)).filter(n=>n.endsWith(".csv"));
 const files=names.map(name=>({name,bytes:require("node:fs").readFileSync(path.join(dir,name))}));
 let r=await actor.context.request.post(base+"/api/imports",{headers:actor.headers,data:{sourceName:"Phase16 close isolated baseline",files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))}});
 assert.equal(r.status(),201,"synthetic isolated baseline draft");const draft=await r.json();
 for(const f of files){const target=draft.files.find(x=>x.name===f.name);assert.ok(target);const put=await fetch(target.uploadUrl,{method:"PUT",body:f.bytes});assert.ok(put.ok,`baseline upload ${f.name}`);}
 for(const [method,url,data,expected] of [
  ["post",`/imports/${draft.id}/finalize`,{},200],
 ]){
  const x=await actor.context.request[method](base+"/api"+url,{headers:actor.headers,data});assert.equal(x.status(),expected,`${url}: ${x.status()}`);
 }
 const mapping=JSON.parse(await fs.readFile(path.join(dir,"mapping.json"),"utf8"));
 r=await actor.context.request.post(base+`/api/imports/${draft.id}/event-codes`,{headers:actor.headers,data:{mapping}});assert.equal(r.status(),200);
 const codes=await r.json();mapping.ignored_event_codes=codes.items.filter(x=>!mapping.event_code_map[x.code]).map(x=>x.code);
 r=await actor.context.request.put(base+`/api/imports/${draft.id}/mapping`,{headers:actor.headers,data:{mapping}});assert.equal(r.status(),200);
 r=await actor.context.request.post(base+`/api/imports/${draft.id}/check`,{headers:actor.headers,data:{}});assert.equal(r.status(),200);
 r=await actor.context.request.post(base+`/api/imports/${draft.id}/approve`,{headers:actor.headers,data:{confirmReplacement:true,replacementCount:0,confirmErrors:true}});assert.equal(r.status(),200);
 const runs=await api(actor,"get","/runs");const a=runs.body.items.find(x=>x.orderId==="E-01"),b=runs.body.items.find(x=>x.orderId==="E-02");
 assert.ok(a&&b,"synthetic baseline E-01 and E-02 runs");
 evidence.checks.syntheticBaseline={uploadedFiles:files.length,approved:true,runIdsPresent:true};
 return {a:a.id,b:b.id};
}
(async()=>{
 await fs.mkdir(images,{recursive:true});browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 const manager=await login("ethmar.manager@clarix.test","factory_manager");
 const initial=await api(manager,"get","/ai/consent");assert.equal(initial.body.enabled,false,"isolated factory starts AI OFF");
 assert.equal(initial.body.configured,true,"isolated fake provider configured");
 const pair=await uploadBaseline(manager);
 await manager.page.goto(base+"/settings",{waitUntil:"domcontentloaded"});
 await manager.page.getByTestId("section-ai-consent").waitFor();await manager.page.waitForFunction(()=>document.querySelector('[data-testid="status-ai-consent"]')?.textContent?.trim().toLowerCase()==="off");
 await manager.page.getByTestId("button-ai-consent-enable").click();await manager.page.getByTestId("checkbox-ai-consent-confirm").click();
  const enablePending=manager.page.waitForResponse(r=>r.url().includes("/api/ai/consent")&&r.request().method()==="PUT");
 await manager.page.getByTestId("button-ai-consent-confirm").click();
  const enabledResponse=await enablePending;let enabledBody={};try{enabledBody=await enabledResponse.json();}catch{}
  evidence.http["manager UI PUT /ai/consent enable"]={status:enabledResponse.status(),enabled:enabledBody.enabled};
  assert.equal(enabledResponse.status(),200,"manager enable PUT status");assert.equal(enabledBody.enabled,true);
 evidence.checks.managerEnableThroughDisclosure={consent:true,confirmedThroughVisibleCheckbox:true};
 await manager.page.getByTestId("status-ai-consent").waitFor();
 await manager.page.waitForFunction(()=>document.querySelector('[data-testid="status-ai-consent"]')?.textContent?.trim().toLowerCase()==="on");
  await manager.page.goto(base+"/comparison?a="+pair.a+"&b="+pair.b,{waitUntil:"domcontentloaded"});
  await manager.page.getByTestId("page-comparison").waitFor();await manager.page.getByTestId("button-ai-explain").waitFor();
  assert.equal(await manager.page.getByTestId("state-ai-off").count(),0,"Explain button shown while consent ON");
  evidence.checks.managerExplainButtonBeforeDisable=true;await screenshot(manager.page,"manager-before-disable-explain-button");
  await manager.page.goto(base+"/settings",{waitUntil:"domcontentloaded"});
  await manager.page.getByTestId("section-ai-consent").waitFor();await manager.page.waitForFunction(()=>document.querySelector('[data-testid="status-ai-consent"]')?.textContent?.trim().toLowerCase()==="on");
 await manager.page.getByTestId("button-ai-consent-disable").click();await manager.page.getByTestId("dialog-ai-consent-disable").waitFor();
 const stillOn=await api(manager,"get","/ai/consent");assert.equal(stillOn.body.enabled,true,"consent remains ON before disable confirmation");
 assert.equal(await manager.page.getByTestId("button-ai-consent-confirm-disable").isVisible(),true);
 evidence.checks.disableConfirmationVisibleBeforeCommit=true;await screenshot(manager.page,"manager-disable-confirmation");
 const pending=manager.page.waitForResponse(r=>r.url().includes("/api/ai/consent")&&r.request().method()==="PUT");
 await manager.page.getByTestId("button-ai-consent-confirm-disable").click();const disabledResponse=await pending;
 let disabledBody={};try{disabledBody=await disabledResponse.json();}catch{}
 evidence.http["manager UI PUT /ai/consent disable"]={status:disabledResponse.status(),enabled:disabledBody.enabled};
 assert.equal(disabledResponse.status(),200,"manager disable PUT status");assert.equal(disabledBody.enabled,false,"manager disable PUT response");
 await manager.page.waitForFunction(()=>document.querySelector('[data-testid="status-ai-consent"]')?.textContent?.trim().toLowerCase()==="off");
 const off=await api(manager,"get","/ai/consent");assert.equal(off.body.enabled,false);
 evidence.checks.managerVisibleOffAfterConfirmation=true;await screenshot(manager.page,"manager-settings-after-off");
 await manager.page.goto(base+"/comparison?a="+pair.a+"&b="+pair.b,{waitUntil:"domcontentloaded"});
 await manager.page.getByTestId("page-comparison").waitFor();await manager.page.getByTestId("state-ai-off").waitFor();
 assert.equal(await manager.page.getByTestId("button-ai-explain").count(),0,"Explain button absent while AI OFF");
 await manager.page.reload({waitUntil:"domcontentloaded"});await manager.page.getByTestId("state-ai-off").waitFor();
 assert.equal(await manager.page.getByTestId("button-ai-explain").count(),0,"Explain button remains absent after reload");
 evidence.checks.managerComparisonOffAfterReload={stateAiOff:true,explainButtonAbsent:true};await screenshot(manager.page,"manager-comparison-after-off");
 for(const [email,role] of [["ethmar.analyst@clarix.test","analyst"],["ethmar.viewer@clarix.test","viewer"]]){
  const actor=await login(email,role);await actor.page.goto(base+"/settings",{waitUntil:"domcontentloaded"});
  await actor.page.getByTestId("state-forbidden").waitFor();
  const section=actor.page.getByTestId("section-ai-consent"),enable=actor.page.getByTestId("button-ai-consent-enable"),disable=actor.page.getByTestId("button-ai-consent-disable");
  assert.equal(await section.count(),0,`${role} must not see consent settings`);
  assert.equal(await enable.count(),0);assert.equal(await disable.count(),0);
  evidence.checks[role].settingsConsentControlsAbsent=true;await screenshot(actor.page,`${role}-settings-no-consent-controls`);
  const before=await api(actor,"get","/ai/consent");assert.equal(before.body.enabled,false,`${role} sees OFF before forbidden mutations`);
  const on=await api(actor,"put","/ai/consent",{enabled:true,confirmed:true});assert.equal(on.response.status(),403,`${role} cannot enable`);
  const offTry=await api(actor,"put","/ai/consent",{enabled:false,confirmed:true});assert.equal(offTry.response.status(),403,`${role} cannot change setting`);
  const after=await api(actor,"get","/ai/consent");assert.equal(after.body.enabled,false,`${role} leaves AI OFF`);
  await actor.page.goto(base+"/comparison?a="+pair.a+"&b="+pair.b,{waitUntil:"domcontentloaded"});
  await actor.page.getByTestId("page-comparison").waitFor();await actor.page.getByTestId("state-ai-off").waitFor();
  assert.equal(await actor.page.getByTestId("button-ai-explain").count(),0,`${role} comparison cannot Explain while OFF`);
  evidence.checks[role].forbiddenPutStatuses=[on.response.status(),offTry.response.status()];evidence.checks[role].consentRemainsOff=true;evidence.checks[role].comparisonExplainAbsent=true;
  await actor.context.close();
 }
 evidence.result="PASS";await save();
 const lines=[];for(const item of evidence.screenshots)lines.push(`${item.sha256}  ${item.file}`);
 await fs.writeFile(path.join(out,"SHA256SUMS"),lines.join("\n")+"\n");
 console.log(JSON.stringify({result:evidence.result,checks:evidence.checks,http:evidence.http,screenshots:evidence.screenshots}));
})().catch(async e=>{
 evidence.result="FAIL";evidence.failures.push({message:String(e?.message||e).split("\n")[0]});
 try{await save();}catch{}console.error(JSON.stringify(evidence.failures.at(-1)));process.exitCode=1;
}).finally(async()=>{await browser?.close();});
