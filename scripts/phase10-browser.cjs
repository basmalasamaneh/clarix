// Phase 10 isolated local browser verification. Run only via test-isolated.ts --browser.
require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID}=require("node:crypto"),{chromium}=require("playwright-core");
const base=process.env.CLARIX_TEST_BASE_URL,password=process.env.SEED_TEST_PASSWORD;
const attempt=`${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID().slice(0,8)}`;
const out=path.resolve(`generated-artifacts/phase10/phase10-browser-${attempt}`);
const ev={attempt,environment:"isolated local API/Vite only",startedAt:new Date().toISOString(),matrix:[],preferences:[],onboarding:[],screenshots:[],consoleErrors:[],failedRequests:[],errors:[]};
let browser;
const tid=(p,id)=>p.getByTestId(id),safe=s=>String(s??"").replace(/([?&](?:token|invite)=)[^&#\s]+/gi,"$1[redacted]").slice(0,500);
async function checkpoint(){ev.updatedAt=new Date().toISOString();await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(ev,null,2));}
function record(group,name,ok,actual){ev[group].push({name,status:ok?"PASS":"FAIL",actual});if(!ok)ev.errors.push(`${name}: ${safe(JSON.stringify(actual))}`);}
async function snap(p,name){const file=`${name}.png`;await p.screenshot({path:path.join(out,file),fullPage:false,mask:[p.locator('input[type="password"],[data-sensitive="true"],[data-testid*="token"]')],maskColor:"#000"});ev.screenshots.push(file);return file;}
async function login(p){await p.goto(base+"/login");await tid(p,"input-email").waitFor({timeout:12000});await tid(p,"input-email").fill("ethmar.manager@clarix.test");await tid(p,"input-password").fill(password);await tid(p,"button-login").click();await tid(p,"button-user-menu").waitFor({timeout:15000});}
async function logout(p){await tid(p,"button-user-menu").click();await tid(p,"button-logout").click();await tid(p,"input-email").waitFor({timeout:12000});}
async function prefResponse(p){return p.waitForResponse(r=>r.request().method()==="PATCH"&&new URL(r.url()).pathname==="/api/preferences",{timeout:15000});}
async function setLang(p,lang,awaitSave=true){if(await p.locator("html").getAttribute("lang")===lang)return null;const rp=prefResponse(p);await tid(p,"button-language").click();await p.waitForFunction(x=>document.documentElement.lang===x,lang,{timeout:7000});if(!awaitSave)return rp;const r=await rp;return{status:r.status(),body:await r.json().catch(()=>null)};}
async function setTheme(p,theme,awaitSave=true){const current=await p.locator("html").evaluate(e=>e.classList.contains("dark")?"dark":"light");if(current===theme)return null;const rp=prefResponse(p);await tid(p,"button-theme").click();await tid(p,`option-theme-${theme}`).click();await p.waitForFunction(x=>document.documentElement.classList.contains("dark")===(x==="dark"),theme,{timeout:7000});if(!awaitSave)return rp;const r=await rp;return{status:r.status(),body:await r.json().catch(()=>null)};}
async function replay(p){await tid(p,"button-user-menu").click();await tid(p,"button-replay-tour").click();await tid(p,"dialog-tour").waitFor({timeout:6000});}
async function tourCheck(p,mode){
  if(!(await tid(p,"dialog-tour").count()))await replay(p);
  const dialog=tid(p,"dialog-tour"),initial=await dialog.getAttribute("aria-modal"),stepText=await dialog.innerText();
  const before=await p.request.get(base+"/api/auth/session").then(r=>r.json()).catch(()=>null);
  const saveRequired=before?.user?.tourCompleted===false;
  let steps=1;for(let i=0;i<3;i++){await tid(p,"button-tour-next").click();const text=await dialog.innerText();if(text===stepText)break;steps++;}
  const lastStepText=await dialog.innerText(),four=steps===4;
  const responseWait=saveRequired?p.waitForResponse(x=>x.request().method()==="PATCH"&&new URL(x.url()).pathname==="/api/preferences",{timeout:12000}).catch(()=>null):null;
  if(mode==="escape")await p.keyboard.press("Escape");
  else if(mode==="keyboard-enter"){await tid(p,"button-tour-skip").focus();await p.keyboard.press("Enter");}
  else await tid(p,"button-tour-close").click();
  await dialog.waitFor({state:"hidden",timeout:6000});
  const r=responseWait?await responseWait:null,body=await r?.json().catch(()=>null);
  const saved=saveRequired?!!r&&r.status()===200&&body?.user?.tourCompleted===true:true;
  const ok=initial==="false"&&four&&saved;
  record("onboarding",`4-step non-modal tour dismissed via ${mode}`,ok,{ariaModal:initial,stepCount:steps,lastStepText,lastStepConfirmedByStepAdvancement:four,saveRequired,patchStatus:r?.status()??"not-required (already complete)",tourCompleted:body?.user?.tourCompleted??before?.user?.tourCompleted});
  await checkpoint();await snap(p,`tour-${mode}`);
}
async function rapidToggle(p){
  const langWaits=[];for(let i=0;i<3;i++){const wanted=i%2===0?"ar":"en";langWaits.push(prefResponse(p));await tid(p,"button-language").click();await p.waitForFunction(x=>document.documentElement.lang===x,wanted,{timeout:7000});}
  const langResponses=await Promise.all(langWaits);const langStatuses=await Promise.all(langResponses.map(async r=>({status:r.status(),body:await r.json().catch(()=>null)})));
  const themeWaits=[];for(const wanted of ["dark","light","dark"]){themeWaits.push(prefResponse(p));await tid(p,"button-theme").click();await tid(p,`option-theme-${wanted}`).click();await p.waitForFunction(x=>document.documentElement.classList.contains("dark")===(x==="dark"),wanted,{timeout:7000});}
  const themeResponses=await Promise.all(themeWaits);const themeStatuses=await Promise.all(themeResponses.map(async r=>({status:r.status(),body:await r.json().catch(()=>null)})));
  const ok=langStatuses.every(x=>x.status===200)&&themeStatuses.every(x=>x.status===200)&&await p.locator("html").getAttribute("lang")==="ar"&&await p.locator("html").evaluate(e=>e.classList.contains("dark"));
  record("preferences","rapid language/theme toggles returned successful preference PATCH responses",ok,{language:langStatuses.map(x=>x.status),theme:themeStatuses.map(x=>x.status),finalLang:await p.locator("html").getAttribute("lang"),finalTheme:await p.locator("html").evaluate(e=>e.classList.contains("dark")?"dark":"light"),serverFinal:themeStatuses.at(-1)?.body?.user?.theme,languageFinal:langStatuses.at(-1)?.body?.user?.language});
  await checkpoint();
}
async function preferencePersistence(p){
  await setLang(p,"ar");await setTheme(p,"dark");await checkpoint();
  await p.reload();await tid(p,"page-help").waitFor({timeout:15000}).catch(()=>{});
  let state=async()=>({lang:await p.locator("html").getAttribute("lang"),dir:await p.locator("html").getAttribute("dir"),theme:await p.locator("html").evaluate(e=>e.classList.contains("dark")?"dark":"light")});
  let afterReload=await state();record("preferences","Arabic and dark survive reload",afterReload.lang==="ar"&&afterReload.dir==="rtl"&&afterReload.theme==="dark",afterReload);await checkpoint();
  await p.goto(base+"/help");await tid(p,"page-help").waitFor({timeout:15000});const direct=await state();record("preferences","direct Help link retains locale/theme",direct.lang==="ar"&&direct.dir==="rtl"&&direct.theme==="dark",direct);await checkpoint();
  await logout(p);await login(p);const relog=await state();record("preferences","Arabic and dark survive logout/login",relog.lang==="ar"&&relog.dir==="rtl"&&relog.theme==="dark",relog);await checkpoint();
  await p.goto(base+"/comparison");await tid(p,"page-comparison").waitFor({timeout:15000});const direct2=await state();record("preferences","direct Comparison link retains locale/theme after login",direct2.lang==="ar"&&direct2.dir==="rtl"&&direct2.theme==="dark",direct2);await checkpoint();
}
async function cell(p,screen,width,lang,theme,route,ready){
  const name=`${screen}-${width}-${lang}-${theme}`,entry={screen,width,lang,theme,route};
  try{
    await p.setViewportSize({width,height:900});
    const lr=await setLang(p,lang);if(lr)record("preferences",`${name} language save`,lr.status===200&&lr.body?.user?.language===lang,{status:lr.status,serverLanguage:lr.body?.user?.language});
    const tr=await setTheme(p,theme);if(tr)record("preferences",`${name} theme save`,tr.status===200&&tr.body?.user?.theme===theme,{status:tr.status,serverTheme:tr.body?.user?.theme});
    // Preference PATCH is complete before navigation, avoiding aborted optimistic writes.
    await p.goto(base+route);await tid(p,ready).waitFor({timeout:16000});
    if(screen==="sources")await p.locator('[data-testid="table-admin-sources"],[data-testid="state-admin-sources-empty"]').first().waitFor({timeout:12000});
    const d=await p.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,innerWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.classList.contains("dark")?"dark":"light",text:document.body.innerText.slice(0,240)}));
    entry.dom=d;entry.screenshot=await snap(p,name);entry.ok=d.documentWidth<=width&&d.bodyWidth<=width&&d.lang===lang&&d.dir===(lang==="ar"?"rtl":"ltr")&&d.theme===theme;
    if(screen==="sources")entry.scope="source administration section embedded in Settings; no standalone /sources route";
    if(!entry.ok)entry.reason="DOM width/locale/theme assertion failed";
  }catch(e){entry.ok=false;entry.reason=safe(e.message);try{entry.screenshot=await snap(p,name+"-failure")}catch{}}
  ev.matrix.push(entry);if(!entry.ok)ev.errors.push(`${name}: ${entry.reason}`);await checkpoint();
}
async function main(){
  await fs.mkdir(out,{recursive:false});if(!base||!password)throw Error("isolated local target or test credential unavailable");
  browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();
  p.on("console",m=>{if(m.type()==="error")ev.consoleErrors.push(safe(m.text()));});p.on("pageerror",e=>ev.consoleErrors.push(safe(e.message)));
  p.on("requestfailed",r=>ev.failedRequests.push({path:safe(new URL(r.url()).pathname),error:safe(r.failure()?.errorText)}));
  await login(p);
  const sess=await (await p.request.get(base+"/api/auth/session")).json();record("preferences","authenticated disposable Ethmar session",!!sess.user&&sess.memberships?.some(m=>m.factoryName==="Ethmar Plastics"),{authenticated:!!sess.user,isolatedBase:true});
  // Verify all four steps exist, then exercise click, Escape and keyboard activation separately.
  await tourCheck(p,"click");await replay(p);await tourCheck(p,"escape");await replay(p);await tourCheck(p,"keyboard-enter");
  await logout(p);await login(p);const tourStillHidden=!(await tid(p,"dialog-tour").count());record("onboarding","dismissed tour stays hidden after logout/login",tourStillHidden,{visible:!tourStillHidden});await checkpoint();
  await rapidToggle(p);await preferencePersistence(p);
  const pages=[
    ["overview","/overview","page-overview"],["imports","/imports","page-imports"],["runs","/runs","page-runs"],
    ["comparison","/comparison","page-comparison"],["quality","/quality","page-quality"],["settings","/settings","page-settings"],
    ["sources","/settings","page-settings"],["members","/members","text-members-title"],["help","/help","page-help"],
    ["not-found","/phase10-not-found","state-not-found"],
  ];
  for(const width of [360,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"])for(const [screen,route,ready] of pages)await cell(p,screen,width,lang,theme,route,ready);
  ev.expectedCells=80;ev.observedCells=ev.matrix.length;ev.finishedAt=new Date().toISOString();
  ev.summary={expectedCells:80,observedCells:ev.matrix.length,passed:ev.matrix.filter(x=>x.ok).length,failed:ev.matrix.filter(x=>!x.ok).length,preferenceChecks:ev.preferences.length,onboardingChecks:ev.onboarding.length,screenshots:ev.screenshots.length,errors:ev.errors.length,out};
  await checkpoint();console.log(JSON.stringify(ev.summary));await browser.close();if(ev.errors.length)process.exitCode=1;
}
main().catch(async e=>{ev.errors.push(safe(e.stack||e.message));ev.finishedAt=new Date().toISOString();ev.summary={failed:true,observedCells:ev.matrix.length,out};await fs.mkdir(out,{recursive:true}).catch(()=>{});await checkpoint().catch(()=>{});console.error(`Phase10 isolated browser driver stopped; evidence ${path.basename(out)}: ${safe(e.message)}`);await browser?.close().catch(()=>{});process.exitCode=1;});
