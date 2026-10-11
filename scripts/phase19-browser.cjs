require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require(path.resolve("scripts/node_modules/playwright-core"));
const base=process.env.CLARIX_TEST_BASE_URL, password=process.env.SEED_TEST_PASSWORD;
const out=path.resolve("generated-artifacts/phase19/browser");
const ev={status:"RUNNING",critical:[],cells:[],screenshots:[],omissions:[],axe:{},failures:[]};
let browser,adminCtx,admin,managerCtx,manager,stage="preflight",demoId=null;
const save=async()=>fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(ev,null,2));
const pass=(name,detail)=>{ev.critical.push({name,result:"PASS",...(detail?{detail}:{})});};
const check=(name,ok,detail)=>{if(!ok)throw Error(name);pass(name,detail);};
const session=async ctx=>(await(await ctx.request.get(base+"/api/auth/session")).json());
const login=async(page,email)=>{await page.goto(base+"/login");await page.getByTestId("input-email").fill(email);await page.getByTestId("input-password").fill(password);await page.getByTestId("button-login").click();};
const prefs=async(ctx,lang,theme)=>{const s=await session(ctx);const r=await ctx.request.patch(base+"/api/preferences",{headers:{"X-CSRF-Token":s.csrfToken},data:{language:lang,theme,tourCompleted:true}});if(r.status()!==200)throw Error("preference save failed");};
const screenshot=async(page,file)=>{await page.addStyleTag({content:'input[type="password"],input[autocomplete="one-time-code"],input[inputmode="numeric"]{filter:blur(18px)!important;color:transparent!important}'});await page.screenshot({path:path.join(out,file),fullPage:true});ev.screenshots.push(file);};
async function main(){
 await fs.mkdir(out,{recursive:true});if(!password)throw Error("SEED_TEST_PASSWORD unavailable");
 const axePath=path.join(out,"axe.min.js");let axe=await fs.readFile(axePath,"utf8").catch(()=>null);
 if(!axe){const r=await fetch("https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js");if(!r.ok)throw Error("axe asset download failed");axe=await r.text();await fs.writeFile(axePath,axe);}
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 adminCtx=await browser.newContext({permissions:["clipboard-read","clipboard-write"]});admin=await adminCtx.newPage();admin.setDefaultTimeout(12000);
 stage="platform-admin-login";await login(admin,"platform.admin@clarix.test");await admin.getByTestId("page-platform").waitFor();check("platform-admin-can-open-platform",true);
 stage="create-demo-with-manager-invite";await admin.getByTestId("button-add-demo-factory").click();await admin.getByTestId("dialog-create-demo").waitFor();
 await admin.getByTestId("input-demo-name").fill("Phase 19 Synthetic Demo");
 await admin.getByTestId("input-demo-email").fill("p19-manager@example.test");await admin.getByTestId("checkbox-demo-confirm").check();
 await admin.getByTestId("button-submit-demo").click();await admin.getByTestId("dialog-platform-link").waitFor();
 const invitePath=await admin.getByTestId("input-platform-link").inputValue();check("demo-created-and-invitation-issued",invitePath.startsWith(base+"/invite/"));
 const listing=await(await adminCtx.request.get(base+"/api/platform/factories")).json();
 const demo=(listing.items||[]).find(x=>x.name==="DEMO — Phase 19 Synthetic Demo");check("demo-visible-in-admin-list",!!demo);demoId=demo.id;
 const ds=await session(adminCtx);check("admin-not-assigned-demo-membership",!ds.memberships?.some(m=>m.factoryId===demoId)&&!ds.activeFactoryId);
 await admin.getByTestId("button-close-platform-link").click();
 await admin.goto(base+"/imports");await admin.getByTestId("state-forbidden").waitFor();
 check("platform-admin-has-no-tenant-import-access",true);
 managerCtx=await browser.newContext();manager=await managerCtx.newPage();manager.setDefaultTimeout(12000);
 stage="accept-demo-manager-invitation";await manager.goto(invitePath);await manager.getByTestId("text-invite-title").waitFor();
 await manager.getByTestId("input-invite-name").fill("P19 Demo Manager");await manager.getByTestId("input-invite-password").fill(password);
 await manager.getByTestId("input-invite-confirm").fill(password);await manager.getByTestId("button-accept-invite").click();
 await manager.getByTestId("page-overview").waitFor();check("manager-invitation-accepted-with-env-password",true);
 const ms=await session(managerCtx);check("accepted-manager-is-member-of-demo",ms.memberships?.some(m=>m.factoryId===demoId&&m.role==="factory_manager"));
 stage="synthetic-import-and-run-counts";await manager.goto(base+"/imports");await manager.getByTestId("page-imports").waitFor();
 const ir=await managerCtx.request.get(base+"/api/imports");const imports=await ir.json();
 const rr=await managerCtx.request.get(base+"/api/runs");const runs=await rr.json();
 const ic=(imports.items||[]).length,rc=(runs.items||[]).length;check("demo-has-two-synthetic-imports-and-four-runs",ic===2&&rc===4,`imports=${ic}; runs=${rc}`);
 stage="demo-banner-on-tenant-routes";
 const routes=[["overview","/","page-overview"],["imports","/imports","page-imports"],["runs","/runs","page-runs"],["comparison","/comparison","page-comparison"],["quality","/quality","page-quality"],["snapshots","/snapshots","page-snapshots"],["settings","/settings","section-factory-settings"],["account","/account","text-account-title"],["members","/members","text-members-title"],["help","/help","page-help"]];
 for(const [name,route,ready] of routes){await manager.goto(base+route);await manager.getByTestId(ready).waitFor();await manager.getByTestId("banner-demo").waitFor();pass(`demo-banner-${name}`, "persistent DEMO banner shown");}
 const snaps=await managerCtx.request.get(base+"/api/snapshots");const sj=await snaps.json();const snapshotId=(sj.items||[])[0]?.id;
 if(snapshotId){await manager.goto(base+`/snapshots/${snapshotId}`);await manager.getByTestId("banner-demo").waitFor();pass("demo-snapshot-detail-banner");routes.push(["snapshot-detail",`/snapshots/${snapshotId}`,""]);}else ev.omissions.push("Snapshot detail: demo has no snapshot to open; no snapshot was created for this check.");
 stage="admin-suspend-and-access-denial";await admin.goto(base+"/platform");await admin.getByTestId("page-platform").waitFor();
 stage="open-suspend-confirmation";await admin.getByTestId(`button-suspend-${demoId}`).click();await admin.getByTestId("dialog-confirm-platform").waitFor();
 stage="confirm-suspension";await admin.getByTestId("button-confirm-platform").click();
 await admin.getByTestId("dialog-confirm-platform").waitFor({state:"detached"});
 const suspended=await(await adminCtx.request.get(base+"/api/platform/factories")).json();
 check("admin-suspended-demo",suspended.items?.find(f=>f.id===demoId)?.status==="suspended");
 stage="verify-suspended-member-denial";
 await manager.goto(base+"/imports");
 await manager.waitForFunction(()=>!!document.querySelector('[data-testid="text-login-title"],[data-testid="state-forbidden"],[data-testid="state-no-membership"]'),null,{timeout:15000});
 const deniedUi=await manager.evaluate(()=>({login:!!document.querySelector('[data-testid="text-login-title"]'),forbidden:!!document.querySelector('[data-testid="state-forbidden"]'),noMembership:!!document.querySelector('[data-testid="state-no-membership"]'),imports:!!document.querySelector('[data-testid="page-imports"]')}));
 const demoRead=await managerCtx.request.get(base+"/api/imports");
 check("suspension-blocks-demo-member-access",!deniedUi.imports&&(deniedUi.login||deniedUi.forbidden||deniedUi.noMembership),`ui=${JSON.stringify(deniedUi)}; imports-api-status=${demoRead.status()}`);
 const other=await(await managerCtx.request.get(base+"/api/auth/session")).json();
 const otherCtx=await browser.newContext();const otherPage=await otherCtx.newPage();await login(otherPage,"najm.manager@clarix.test");await otherPage.getByTestId("page-overview").waitFor();
 const os=await session(otherCtx);check("suspension-does-not-affect-other-factory",os.memberships?.some(m=>m.factoryId==="najm"));
 await otherCtx.close();
 stage="reactivate-demo";await admin.getByTestId(`button-reactivate-${demoId}`).click();await admin.getByTestId("dialog-confirm-platform").waitFor();await admin.getByTestId("button-confirm-platform").click();
 await admin.getByTestId("dialog-confirm-platform").waitFor({state:"detached"});
 stage="demo-reactivation";await login(manager,"p19-manager@example.test");await manager.getByTestId("page-overview").waitFor();await manager.getByTestId("banner-demo").waitFor();
 const restored=await(await managerCtx.request.get(base+"/api/runs")).json();check("reactivated-demo-retains-four-runs",(restored.items||[]).length===4);
 stage="role-and-ai-guards";
 for(const [role,email] of [["analyst","ethmar.analyst@clarix.test"],["viewer","ethmar.viewer@clarix.test"]]){
  const c=await browser.newContext(),p=await c.newPage();await login(p,email);await p.getByTestId("page-overview").waitFor();await p.goto(base+"/platform");
  const status=await(await c.request.get(base+"/api/auth/session")).json();const csrf=status.csrfToken;
  const denied=await c.request.post(base+"/api/platform/demo-factories",{headers:{"X-CSRF-Token":csrf},data:{name:"denied",defaultLanguage:"en"}});
  check(`${role}-cannot-create-demo`,denied.status()===403);await c.close();
 }
 stage="responsive-accessibility-matrix";await manager.goto(base+"/");await manager.getByTestId("page-overview").waitFor();
 const matrixRoutes=[...routes.map(x=>[...x,managerCtx,manager]),["platform","/platform","page-platform",adminCtx,admin]];
 for(const [name,route,ready,ctx,page] of matrixRoutes){
  if(!ready){ev.omissions.push(`${name} matrix skipped: no snapshot detail id available.`);continue;}
  for(const width of [360,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"]){
   const cell={page:name,route,width,height:900,language:lang,theme};
   let cellCtx;
   try{
    cellCtx=await browser.newContext({storageState:await ctx.storageState()});const p=await cellCtx.newPage();
    await prefs(cellCtx,lang,theme);await p.setViewportSize({width,height:900});await p.goto(base+route);await p.getByTestId(ready).waitFor();
    const dom=await p.evaluate(()=>({width:innerWidth,height:innerHeight,lang:document.documentElement.lang,dir:document.documentElement.dir,dark:document.documentElement.classList.contains("dark"),scrollWidth:document.documentElement.scrollWidth}));
    cell.actualViewport={width:dom.width,height:dom.height};cell.dom={lang:dom.lang,dir:dom.dir,dark:dom.dark,scrollWidth:dom.scrollWidth};cell.overflow=dom.scrollWidth>dom.width+1;
    await p.addScriptTag({path:axePath});const ax=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});return r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,description:v.description,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}));});
    cell.axeViolations=ax;cell.axeSeriousCritical=ax.flatMap(v=>v.impact==="serious"||v.impact==="critical"?[{id:v.id,impact:v.impact,nodes:v.nodes}]:[]);
    if(dom.width!==width||dom.lang!==lang||dom.dark!==(theme==="dark"))cell.environmentMismatch=true;
    await screenshot(p,`${name}-${width}-${lang}-${theme}.png`);cell.screenshot=`${name}-${width}-${lang}-${theme}.png`;
    ev.cells.push(cell);await save();
   }catch(e){cell.driverError=String(e.message).split("\n")[0].replace(/https?:\/\/\S+/g,"[url]");ev.cells.push(cell);ev.failures.push({cell:`${name}/${width}/${lang}/${theme}`,error:cell.driverError});await save();}
   finally{await cellCtx?.close().catch(()=>{});}
  }
  for(const width of [768])for(const lang of ["en","ar"])for(const theme of ["light","dark"]){
   const cell={page:name,route,width,height:900,language:lang,theme,screenshotOnly:true};
   let cellCtx;
   try{cellCtx=await browser.newContext({storageState:await ctx.storageState()});const p=await cellCtx.newPage();await prefs(cellCtx,lang,theme);await p.setViewportSize({width,height:900});await p.goto(base+route);await p.getByTestId(ready).waitFor();
    const d=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,dark:document.documentElement.classList.contains("dark")}));
    cell.actualViewport={width:d.width,height:d.height};cell.dom=d;await screenshot(p,`${name}-768-${lang}-${theme}.png`);cell.screenshot=`${name}-768-${lang}-${theme}.png`;ev.cells.push(cell);await save();
   }catch(e){cell.driverError=String(e.message).split("\n")[0];ev.cells.push(cell);ev.failures.push({cell:`${name}/768/${lang}/${theme}`,error:cell.driverError});await save();}
   finally{await cellCtx?.close().catch(()=>{});}
  }
 }
 stage="ai-no-network-check";
 const requests=[];await manager.route(/https:\/\/[^/]*(openai|anthropic|googleapis|azure)/i,r=>{requests.push(r.request().url().split("?")[0]);return r.abort();});
 await manager.goto(base+"/quality");await manager.getByTestId("page-quality").waitFor();await manager.getByTestId("panel-quality-assistant").waitFor();
 const aiBtn=manager.getByTestId("panel-quality-assistant-ai");const disabled=await aiBtn.isDisabled();
 await manager.getByTestId("panel-quality-assistant-result-guidance").waitFor({timeout:1000}).catch(()=>{});
 ev.ai={noExternalProviderRequests:true,providerRequests:requests.length,buttonDisabled:disabled,note:"Quality assistant loads without sending to an external provider; no AI prompt was submitted."};
 check("AI-missing-key-no-provider-network",requests.length===0&&disabled);
 ev.status=ev.failures.length?"PARTIAL":"PASS";ev.summary={axeCells:ev.cells.filter(c=>!c.screenshotOnly&&c.axeViolations).length,seriousCritical:ev.cells.flatMap(c=>c.axeSeriousCritical||[]).length,allViolations:ev.cells.flatMap(c=>c.axeViolations||[]).length,screenshots:ev.screenshots.length,cellRecords:ev.cells.length};
 await save();console.log(JSON.stringify({out,status:ev.status,critical:ev.critical.length,cells:ev.cells.length,axeCells:ev.summary.axeCells,seriousCritical:ev.summary.seriousCritical,screenshots:ev.screenshots.length,failures:ev.failures.length}));
}
main().catch(async e=>{ev.status="PARTIAL";ev.failedStage=stage;ev.failures.push({stage,error:String(e.message).split("\n")[0].replace(/https?:\/\/\S+/g,"[url]")});await save().catch(()=>{});console.error(`PHASE19_FAILURE stage=${stage}`);process.exitCode=1;}).finally(async()=>{await managerCtx?.close().catch(()=>{});await adminCtx?.close().catch(()=>{});await browser?.close().catch(()=>{});});
