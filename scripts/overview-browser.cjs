// Authenticated Overview check. MUST run only through test-isolated.ts --browser.
require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID}=require("node:crypto"),{chromium}=require("playwright-core");
const base=process.env.CLARIX_TEST_BASE_URL,password=process.env.SEED_TEST_PASSWORD;
const out=path.resolve(`generated-artifacts/phase10b/overview-${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID().slice(0,8)}`);
const ev={environment:"isolated local API/Vite only",scope:"authenticated Overview",startedAt:new Date().toISOString(),checks:[],matrix:[],simulated:[],screenshots:[],errors:[],consoleErrors:[]};
let browser;
const tid=(p,id)=>p.getByTestId(id),safe=s=>String(s??"").replace(/([?&](?:token|invite)=)[^&#\s]+/gi,"$1[redacted]").slice(0,350);
async function save(){ev.updatedAt=new Date().toISOString();await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(ev,null,2));}
function check(name,ok,actual){ev.checks.push({name,status:ok?"PASS":"FAIL",actual});if(!ok)ev.errors.push(`${name}: ${safe(JSON.stringify(actual))}`);}
async function shot(p,name){const file=`${name}.png`;await p.screenshot({path:path.join(out,file),fullPage:false,mask:[p.locator('input[type=password],[data-sensitive=true],[data-testid*=token]')],maskColor:"#000"});ev.screenshots.push(file);return file;}
async function api(p,url){const r=await p.request.get(base+url);return {status:r.status(),body:await r.json().catch(()=>null)};}
async function login(p,email="ethmar.manager@clarix.test"){await p.goto(base+"/login");await tid(p,"input-email").fill(email);await tid(p,"input-password").fill(password);await tid(p,"button-login").click();await tid(p,"button-user-menu").waitFor({timeout:15000});}
async function logout(p){await tid(p,"button-user-menu").click();await tid(p,"button-logout").click();await tid(p,"input-email").waitFor({timeout:12000});}
async function prefs(p,language,theme){const s=(await api(p,"/api/auth/session")).body;const r=await p.request.patch(base+"/api/preferences",{headers:{"X-CSRF-Token":s.csrfToken},data:{language,theme,tourCompleted:true}});const b=await r.json().catch(()=>null);check(`preference PATCH ${language}/${theme}`,r.status()===200&&b?.user?.language===language&&b?.user?.theme===theme,{status:r.status(),language:b?.user?.language,theme:b?.user?.theme});await p.reload();await tid(p,"page-overview").waitFor({timeout:15000});}
async function inspect(p,width,language,theme){
 const name=`overview-${width}-${language}-${theme}`,entry={width,language,theme,route:"/overview"};
 try{
  await p.setViewportSize({width,height:900});await p.goto(base+"/overview");await tid(p,"page-overview").waitFor({timeout:12000});await prefs(p,language,theme);
  const d=await p.evaluate(()=>{const main=document.querySelector("main")||document.body;const clipped=[...main.querySelectorAll("h1,h2,h3,p,a,button,span")].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflow!=="hidden"&&getComputedStyle(e).textOverflow!=="ellipsis").map(e=>(e.innerText||"").trim().slice(0,70)).filter(Boolean).slice(0,12);const targets=[...main.querySelectorAll("a,button,[role=button],input,select")].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {text:(e.innerText||e.getAttribute("aria-label")||"").trim().slice(0,45),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x=>x.w<44||x.h<44);return {docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,innerWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.classList.contains("dark")?"dark":"light",clipped,smallTargets:targets.slice(0,20),smallTargetCount:targets.length};});
  await p.keyboard.press("Tab");const focus=await p.evaluate(()=>{const e=document.activeElement,s=e&&getComputedStyle(e);return {tag:e?.tagName,text:(e?.innerText||e?.getAttribute("aria-label")||"").trim().slice(0,60),focusVisible:e?.matches(":focus-visible")||false,outline:s?`${s.outlineStyle} ${s.outlineWidth}`:"",boxShadow:s?.boxShadow||""};});
  entry.dom=d;entry.focus=focus;entry.screenshot=await shot(p,name);
  entry.ok=d.docWidth<=width&&d.bodyWidth<=width&&d.lang===language&&d.dir===(language==="ar"?"rtl":"ltr")&&d.theme===theme&&d.clipped.length===0&&d.smallTargetCount===0&&focus.focusVisible&&(focus.outline.startsWith("solid")||focus.boxShadow!=="none");
  if(!entry.ok)entry.reason="overflow, clipped text, small Overview target, focus ring, or locale/theme mismatch";
 }catch(e){entry.ok=false;entry.reason=safe(e.message);try{entry.screenshot=await shot(p,name+"-failure")}catch{}}
 ev.matrix.push(entry);if(!entry.ok)ev.errors.push(`${name}: ${entry.reason}`);await save();
}
async function simulated(p,name,language,mutate,verify){
 await prefs(p,language,language==="ar"?"dark":"light");let times=0,recover=false;const route=base+"/api/overview";
 await p.route(route,async r=>{times++;if(mutate==="delay")await new Promise(res=>setTimeout(res,1600));const apiResp=await r.fetch();if(mutate==="500"&&!recover)return r.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:"SIMULATED"})});if(typeof mutate==="function"){const b=mutate(await apiResp.json());return r.fulfill({response:apiResp,body:JSON.stringify(b)});}return r.fulfill({response:apiResp});});
 let ok=false,actual={};try{await p.reload();if(name==="loading-delay"){await tid(p,"state-overview-loading").waitFor({timeout:3000});await tid(p,"text-overview-approved").waitFor({timeout:10000});ok=true;actual={loadingObserved:true};}
 else if(name==="500-retry"){await tid(p,"state-overview-error").waitFor({timeout:20000});recover=true;await tid(p,"button-retry-overview").click();await tid(p,"text-overview-approved").waitFor({timeout:10000});ok=times>=2;actual={recovered:ok,requests:times};}
 else{await verify(p);ok=true;actual={state:true,requests:times};}
 }catch(e){actual={error:safe(e.message),requests:times};}
 await shot(p,`simulated-${name}-${language}`);check(`SIMULATED ${name} ${language}`,ok,actual);ev.simulated.push({name,language,label:"simulated route interception; not server/API test",ok,actual});await p.unroute(route).catch(()=>{});await save();
}
async function main(){
 await fs.mkdir(out,{recursive:true});if(!base||!password)throw Error("isolated local target or test credential unavailable");
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});const ctx=await browser.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();
 p.on("console",m=>{if(m.type()==="error")ev.consoleErrors.push(safe(m.text()));});p.on("pageerror",e=>ev.consoleErrors.push(safe(e.message)));
 await login(p);await tid(p,"page-overview").waitFor({timeout:15000});
 if(await tid(p,"dialog-tour").isVisible().catch(()=>false))await tid(p,"button-tour-skip").click();
 const s=(await api(p,"/api/auth/session")).body;check("authenticated Ethmar manager",!!s.user&&s.memberships?.some(m=>m.factoryName==="Ethmar Plastics"),{authenticated:!!s.user,factory:s.activeFactoryId});
 const [o,q,r]=await Promise.all([api(p,"/api/overview"),api(p,"/api/quality"),api(p,"/api/runs")]);
 check("Overview API vs DQ/Runs API counts",o.status===200&&q.status===200&&r.status===200&&JSON.stringify(o.body.statuses)===JSON.stringify(q.body.summary.orders)&&o.body.errors===q.body.summary.errors&&o.body.warnings===q.body.summary.warnings&&o.body.currentOrders===r.body.total,{overview:{statuses:o.body?.statuses,errors:o.body?.errors,warnings:o.body?.warnings,currentOrders:o.body?.currentOrders},quality:q.body?.summary,runsTotal:r.body?.total});
 check("latest imports capped at five",Array.isArray(o.body?.latestImports)&&o.body.latestImports.length<=5,{count:o.body?.latestImports?.length});
 check("visible Overview matches API values",await tid(p,"text-overview-approved").innerText()===String(o.body.approvedImports)&&await tid(p,"text-overview-orders").innerText()===String(o.body.currentOrders)&&await tid(p,"text-overview-errors").innerText()===String(o.body.errors)&&await tid(p,"text-overview-warnings").innerText()===String(o.body.warnings)&&await p.locator('[data-testid^="row-overview-import-"]').count()===o.body.latestImports.length,{approved:await tid(p,"text-overview-approved").innerText(),orders:await tid(p,"text-overview-orders").innerText(),latestRows:await p.locator('[data-testid^="row-overview-import-"]').count(),apiLatest:o.body.latestImports.length});
 const pair=o.body.comparisonRuns||[];check("comparison shortcut shows correct API pair",pair.length===2&&await p.locator('[data-testid^="card-overview-run-"]').count()===pair.length,{apiIds:pair.map(x=>x.id),visible:await p.locator('[data-testid^="card-overview-run-"]').evaluateAll(es=>es.map(e=>e.getAttribute("data-testid")))});
 if(pair.length===2){await tid(p,"link-overview-compare").click();await tid(p,"page-comparison").waitFor({timeout:12000});check("Compare click navigates to exact pair",new URL(p.url()).searchParams.get("a")===pair[0].id&&new URL(p.url()).searchParams.get("b")===pair[1].id,{url:new URL(p.url()).pathname+new URL(p.url()).search});}
 for(const [tidid,route,ready] of [["link-overview-quality","/quality","page-quality"],["link-overview-all-imports","/imports","page-imports"],["link-overview-runs","/runs","page-runs"]]){await p.goto(base+"/overview");await tid(p,tidid).click();await tid(p,ready).waitFor({timeout:12000});check(`${route} link works`,new URL(p.url()).pathname===route,{route:new URL(p.url()).pathname});}
 // Manager overview's live-data matrix: each cell includes overflow, text clipping, focus and target-size measurements.
 for(const w of [360,768,1280])for(const l of ["en","ar"])for(const t of ["light","dark"])await inspect(p,w,l,t);
 await simulated(p,"empty-approved0","en",b=>({...b,approvedImports:0}),async x=>{await tid(x,"list-overview-guide").waitFor();if(await tid(x,"text-overview-approved").innerText()!=="0")throw Error("approved count was not zero");});
 await simulated(p,"nullable-fields","ar",b=>({...b,currentOrders:null,errors:null,warnings:null,latestImports:b.latestImports.map(x=>({...x,date:null}))}),async x=>{await tid(x,"text-overview-orders").waitFor();if(!(await tid(x,"text-overview-orders").getAttribute("class")).includes("italic"))throw Error("nullable orders not rendered in designed unavailable style");if(await x.locator('[data-testid^="text-overview-import-date-"]').count())throw Error("null import date rendered as a date");});
 await simulated(p,"fewer-than-two","en",b=>({...b,comparisonRuns:(b.comparisonRuns||[]).slice(0,1)}),async x=>{await tid(x,"state-overview-few-runs").waitFor();});
 await simulated(p,"loading-delay","ar","delay",async()=>{});
 await simulated(p,"500-retry","en","500",async()=>{});
 await logout(p);await login(p,"ethmar.viewer@clarix.test");await tid(p,"page-overview").waitFor({timeout:15000});
 check("viewer can read Overview without forbidden Imports links",await tid(p,"page-overview").count()===1&&await tid(p,"link-overview-all-imports").count()===0&&await tid(p,"link-overview-guide-imports").count()===0,{importsLinks:await p.locator('[data-testid^="link-overview"][data-testid*=import]').count(),latestLead:(await p.locator('[data-testid="page-overview"]').innerText()).slice(0,280)});
 await logout(p);await login(p,"najm.manager@clarix.test");await tid(p,"page-overview").waitFor({timeout:15000});
 const no=(await api(p,"/api/overview")).body,ns=(await api(p,"/api/auth/session")).body,foreign=await p.request.get(base+`/api/runs/${pair[0]?.id??"invalid"}`),ethmarIds=new Set([...o.body.latestImports.map(x=>x.id),...pair.map(x=>x.id)]),najmIds=[...(no.latestImports||[]).map(x=>x.id),...(no.comparisonRuns||[]).map(x=>x.id)];
 check("Najm manager sees only their Overview data",ns.memberships?.some(m=>m.factoryId===ns.activeFactoryId&&/najm/i.test(m.factoryName))&&foreign.status()===404&&!najmIds.some(id=>ethmarIds.has(id)),{activeFactory:ns.activeFactoryId,overviewApproved:no?.approvedImports,foreignEthmarRunStatus:foreign.status(),noSharedOverviewIds:!najmIds.some(id=>ethmarIds.has(id))});
 ev.finishedAt=new Date().toISOString();ev.summary={matrixCells:ev.matrix.length,matrixPassed:ev.matrix.filter(x=>x.ok).length,matrixFailed:ev.matrix.filter(x=>!x.ok).length,simulated:ev.simulated.length,checks:ev.checks.length,failedChecks:ev.checks.filter(x=>x.status==="FAIL").length,screenshots:ev.screenshots.length,consoleErrors:ev.consoleErrors.length,out};await save();
 console.log(JSON.stringify(ev.summary));await browser.close();if(ev.errors.length)process.exitCode=1;
}
main().catch(async e=>{ev.errors.push(safe(e.stack||e.message));ev.finishedAt=new Date().toISOString();ev.summary={failed:true,matrixCells:ev.matrix.length,out};await fs.mkdir(out,{recursive:true}).catch(()=>{});await save().catch(()=>{});console.error(`Overview isolated browser driver stopped; evidence ${path.basename(out)}: ${safe(e.message)}`);await browser?.close().catch(()=>{});process.exitCode=1;});
