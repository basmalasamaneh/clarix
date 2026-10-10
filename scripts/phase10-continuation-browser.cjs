// Focused Phase10 locale/theme continuation; isolated test-isolated.ts --browser only.
require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID}=require("node:crypto"),{chromium}=require("playwright-core");
const base=process.env.CLARIX_TEST_BASE_URL,password=process.env.SEED_TEST_PASSWORD;
const attempt=`${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID().slice(0,8)}`;
const out=path.resolve(`generated-artifacts/phase10/phase10-continuation-${attempt}`);
const ev={attempt,environment:"isolated local API/Vite only",scope:"preferences persistence + Help 8-cell matrix only",startedAt:new Date().toISOString(),preferences:[],matrix:[],screenshots:[],errors:[],consoleErrors:[],failedRequests:[]};
let browser;
const tid=(p,id)=>p.getByTestId(id),langButton=p=>p.locator('[data-testid="button-language"]:visible').first(),themeButton=p=>p.locator('[data-testid="button-theme"]:visible').first();
const safe=s=>String(s??"").replace(/([?&](?:token|invite)=)[^&#\s]+/gi,"$1[redacted]").slice(0,500);
async function checkpoint(){ev.updatedAt=new Date().toISOString();await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(ev,null,2));}
function record(group,name,ok,actual){ev[group].push({name,status:ok?"PASS":"FAIL",actual});if(!ok)ev.errors.push(`${name}: ${safe(JSON.stringify(actual))}`);}
async function snap(p,name){const file=`${name}.png`;await p.screenshot({path:path.join(out,file),fullPage:false,mask:[p.locator('input[type="password"],[data-sensitive="true"],[data-testid*="token"]')],maskColor:"#000"});ev.screenshots.push(file);return file;}
function patchWait(p){return p.waitForResponse(r=>r.request().method()==="PATCH"&&new URL(r.url()).pathname==="/api/preferences",{timeout:30000}).then(response=>({response}),error=>({error:safe(error.message)}));}
async function patchValue(p,r,key,value){const body=await r.json().catch(()=>null);const ok=r.status()===200&&body?.user?.[key]===value;record("preferences",`${key} PATCH saved ${value}`,ok,{status:r.status(),serverValue:body?.user?.[key]});return ok;}
async function settlePatch(wait,key,value){const result=await wait;if(!result.response){record("preferences",`${key} PATCH response for ${value}`,false,{error:result.error??"no matching response"});await checkpoint();return false;}return patchValue(null,result.response,key,value);}
async function setLang(p,lang){const session=await p.request.get(base+"/api/auth/session").then(r=>r.json()),current=await p.locator("html").getAttribute("lang");if(current===lang&&session.user?.language===lang)return null;const wait=patchWait(p);await langButton(p).click();await p.waitForFunction(x=>document.documentElement.lang===x,lang,{timeout:7000});return settlePatch(wait,"language",lang);}
async function setTheme(p,theme){const session=await p.request.get(base+"/api/auth/session").then(r=>r.json()),current=await p.locator("html").evaluate(e=>e.classList.contains("dark")?"dark":"light");if(current===theme&&session.user?.theme===theme)return null;const wait=patchWait(p);await themeButton(p).click();await tid(p,`option-theme-${theme}`).click();await p.waitForFunction(x=>document.documentElement.classList.contains("dark")===(x==="dark"),theme,{timeout:7000});return settlePatch(wait,"theme",theme);}
async function login(p){await p.goto(base+"/login");await tid(p,"input-email").waitFor({timeout:12000});await tid(p,"input-email").fill("ethmar.manager@clarix.test");await tid(p,"input-password").fill(password);await tid(p,"button-login").click();await tid(p,"button-user-menu").waitFor({timeout:15000});}
async function logout(p){await tid(p,"button-user-menu").click();await tid(p,"button-logout").click();await tid(p,"input-email").waitFor({timeout:12000});}
async function state(p){return p.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.classList.contains("dark")?"dark":"light"}));}
async function assertState(p,name,lang,theme){
  const ui=await state(p),s=await p.request.get(base+"/api/auth/session").then(r=>r.json());
  const ok=ui.lang===lang&&ui.dir===(lang==="ar"?"rtl":"ltr")&&ui.theme===theme&&s.user?.language===lang&&s.user?.theme===theme;
  record("preferences",name,ok,{ui,server:{language:s.user?.language,theme:s.user?.theme}});
  await checkpoint();return ok;
}
async function rapidToggles(p){
  const languageResponses=[];
  for(const wanted of ["ar","en","ar"]){const wait=patchWait(p);await langButton(p).click();await p.waitForFunction(x=>document.documentElement.lang===x,wanted,{timeout:7000});languageResponses.push([wait,wanted]);}
  const langResults=await Promise.all(languageResponses.map(([r,w])=>settlePatch(r,"language",w)));
  // Themes are alternated quickly; responses are collected before any route navigation.
  const themePairs=[];for(const wanted of ["dark","light","dark"]){const wait=patchWait(p);await themeButton(p).click();await tid(p,`option-theme-${wanted}`).click();await p.waitForFunction(x=>document.documentElement.classList.contains("dark")===(x==="dark"),wanted,{timeout:7000});themePairs.push([wait,wanted]);}
  const themeResults=await Promise.all(themePairs.map(([r,wanted])=>settlePatch(r,"theme",wanted)));
  const ok=langResults.every(Boolean)&&themeResults.every(Boolean)&&await assertState(p,"rapid toggle final state is persisted", "ar","dark");
  record("preferences","rapid language/theme toggles complete",ok,{languageResponses:langResults.length,themeResponses:themeResults.length});
  await checkpoint();
}
async function main(){
  await fs.mkdir(out,{recursive:false});if(!base||!password)throw Error("isolated local target or test credential unavailable");
  browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();
  p.on("console",m=>{if(m.type()==="error")ev.consoleErrors.push(safe(m.text()));});p.on("pageerror",e=>ev.consoleErrors.push(safe(e.message)));
  p.on("requestfailed",r=>ev.failedRequests.push({path:safe(new URL(r.url()).pathname),error:safe(r.failure()?.errorText)}));
  await login(p);
  // First-run tour is not under test here. Mark it complete on this disposable account to keep screenshots unobstructed.
  const s=await p.request.get(base+"/api/auth/session").then(r=>r.json());
  if(s.user?.tourCompleted!==true){const r=await p.request.patch(base+"/api/preferences",{headers:{"X-CSRF-Token":s.csrfToken},data:{tourCompleted:true}});if(r.status()!==200)throw Error(`isolated tour-suppression setup returned ${r.status()}`);}
  await p.reload();await tid(p,"page-overview").waitFor({timeout:15000});
  record("preferences","fresh isolated session ready; tour suppressed for this continuation only",true,{authenticated:!!s.user,isolated:true});await checkpoint();
  await setLang(p,"en");await setTheme(p,"light");await rapidToggles(p);
  await setLang(p,"ar");await setTheme(p,"dark");await assertState(p,"Arabic/dark state before reload is persisted","ar","dark");
  await p.reload();await tid(p,"page-overview").waitFor({timeout:15000});await assertState(p,"Arabic/dark survives reload","ar","dark");
  for(const route of ["/help","/settings"]){await p.goto(base+route);await tid(p,route==="/help"?"page-help":"page-settings").waitFor({timeout:15000});await assertState(p,`direct link ${route} retains Arabic/dark`,"ar","dark");}
  await logout(p);await login(p);await tid(p,"page-overview").waitFor({timeout:15000});await assertState(p,"Arabic/dark survives logout/login","ar","dark");
  await p.goto(base+"/comparison");await tid(p,"page-comparison").waitFor({timeout:15000});await assertState(p,"direct Comparison link after login retains Arabic/dark","ar","dark");
  const results=[];
  for(const width of [360,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"]){
    const name=`help-${width}-${lang}-${theme}`,entry={screen:"Help",width,lang,theme,route:"/help"};
    try{
      await p.setViewportSize({width,height:900});await setLang(p,lang);await setTheme(p,theme);
      // Do not navigate until all preference PATCH responses for this cell have completed.
      await p.goto(base+"/help");await tid(p,"page-help").waitFor({timeout:15000});
      const dom=await p.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,innerWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.classList.contains("dark")?"dark":"light",text:document.body.innerText.slice(0,220)}));
      entry.dom=dom;entry.screenshot=await snap(p,name);entry.ok=dom.documentWidth<=width&&dom.bodyWidth<=width&&dom.lang===lang&&dom.dir===(lang==="ar"?"rtl":"ltr")&&dom.theme===theme;
      if(!entry.ok)entry.reason="DOM width/locale/theme assertion failed";
    }catch(e){entry.ok=false;entry.reason=safe(e.message);try{entry.screenshot=await snap(p,name+"-failure")}catch{}}
    ev.matrix.push(entry);if(!entry.ok)ev.errors.push(`${name}: ${entry.reason}`);await checkpoint();
  }
  ev.expectedCells=8;ev.observedCells=ev.matrix.length;ev.finishedAt=new Date().toISOString();ev.summary={expectedCells:8,observedCells:ev.matrix.length,passed:ev.matrix.filter(x=>x.ok).length,failed:ev.matrix.filter(x=>!x.ok).length,preferenceChecks:ev.preferences.length,screenshots:ev.screenshots.length,consoleErrors:ev.consoleErrors.length,errors:ev.errors.length,out};
  await checkpoint();console.log(JSON.stringify(ev.summary));await browser.close();if(ev.errors.length)process.exitCode=1;
}
main().catch(async e=>{ev.errors.push(safe(e.stack||e.message));ev.finishedAt=new Date().toISOString();ev.summary={failed:true,observedCells:ev.matrix.length,out};await fs.mkdir(out,{recursive:true}).catch(()=>{});await checkpoint().catch(()=>{});console.error(`Phase10 focused continuation stopped; evidence ${path.basename(out)}: ${safe(e.message)}`);await browser?.close().catch(()=>{});process.exitCode=1;});
