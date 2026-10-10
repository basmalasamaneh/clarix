require("./isolated-browser-guard.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(path.resolve("scripts/node_modules/playwright-core"));
const base = process.env.CLARIX_TEST_BASE_URL, root = process.cwd();
const out = path.join(root, "generated-artifacts/phase6"), shots = path.join(out, "screenshots");
const password = process.env.SEED_TEST_PASSWORD;
const ev = { startedAt: new Date().toISOString(), journey: [], combos: [], screenshots: [], errors: [], publicWriteAttempted: false };
let browser;
const check = (ok, what, actual) => { ev.journey.push({ check: what, status: ok ? "PASS" : "FAIL", actual }); if (!ok) throw Error(`${what}: ${JSON.stringify(actual)}`); };
async function login(page,email) {
  await page.goto(base+"/login"); await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password); await page.getByTestId("button-login").click();
  await page.getByTestId("link-nav-runs").waitFor({timeout:10000}); await page.goto(base+"/runs");
  await page.getByTestId("page-runs").waitFor({timeout:10000});
  if(await page.getByTestId("dialog-tour").count()) await page.getByTestId("button-tour-skip").click();
  await page.getByTestId("dialog-tour").waitFor({state:"hidden"}).catch(()=>{});
}
async function api(page,url){const r=await page.evaluate(async u=>{const x=await fetch(u);return {status:x.status,body:await x.json()}},url);if(r.status!==200)throw Error(`${url} returned ${r.status}`);return r.body}
async function measure(page){
 return page.evaluate(()=>{const els=[...document.querySelectorAll("button,a,input,select,[role=button]")].filter(x=>x.getClientRects().length);
 const small=els.map(x=>{const checkbox=x.matches('input[type=checkbox]'),target=checkbox?(x.closest('label')||x):x,r=target.getBoundingClientRect(),cs=getComputedStyle(x),sr=cs.position==='absolute'&&cs.clip!=='auto';return {tag:x.tagName,text:(x.innerText||x.getAttribute('aria-label')||'').trim().slice(0,50),w:Math.round(r.width),h:Math.round(r.height),checkboxLabel:checkbox?{text:target.innerText.trim(),w:Math.round(r.width),h:Math.round(r.height)}:null,ignoredSrOnly:sr}}).filter(x=>(x.w<44||x.h<44)&&!x.ignoredSrOnly&&!/^(Skip to content|انتقل إلى المحتوى)$/.test(x.text));
 const active=document.activeElement,cs=active&&getComputedStyle(active), ring=cs&&(cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>0||cs.boxShadow!=='none');
 return {scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,dir:document.documentElement.dir,lang:document.documentElement.lang,missingKeys:(document.body.innerText.match(/(?:^|\\s)(?:rc|q|common|imp)\\.[\\w.]+/g)||[]).slice(0,20),smallTargets:small.slice(0,30),smallTargetCount:small.length,focused:active?.tagName,focusVisible:active?.matches?.(':focus-visible')??false,focusOutline:cs?`${cs.outlineStyle} ${cs.outlineWidth}`:null,focusShadow:cs?.boxShadow,hasFocusRing:!!ring};});
}
async function main(){
 if(!password) throw Error("SEED_TEST_PASSWORD missing; password is read only from process.env inside this isolated local driver");
 await fs.mkdir(shots,{recursive:true}); browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 const ctx=await browser.newContext({viewport:{width:1280,height:1000}}),page=await ctx.newPage();
 await login(page,"ethmar.analyst@clarix.test");
 let all=[]; for(let p=1;;p++){const b=await api(page,`/api/runs?page=${p}`);all.push(...b.items);if(p*b.items.length>=b.total||!b.items.length)break;}
 const bySuffix=s=>all.filter(r=>r.sourceName.endsWith("-"+s));
 const baseline=bySuffix("00_baseline"),suspect=bySuffix("05_suspected_duplicate_record"),missing=bySuffix("07_missing_scrap_value"),warning=bySuffix("12_possible_overlap"),eventRed=bySuffix("03_conflicting_duplicate_event_id"),event14=bySuffix("14_missing_event_id");
 check(baseline.length===2&&baseline.some(r=>r.orderId==="E-01")&&baseline.some(r=>r.orderId==="E-02"),"baseline fixture runs loaded",{runs:baseline.map(r=>({id:r.id,orderId:r.orderId,source:r.sourceName}))});
 // Runs list selection is performed through the visible filter and checkboxes.
 await page.getByTestId("input-runs-source").fill(baseline[0].sourceName); await page.getByTestId("button-runs-apply").click();
 for(const r of baseline) await page.locator(`[data-testid="checkbox-run-${r.id}"]:visible`).check();
 const compareBtn=page.getByTestId("button-compare");
 check(await compareBtn.isEnabled(),"compare enabled for exactly two",{});
 const extra=all.find(r=>!baseline.some(x=>x.id===r.id));
 if(extra){await page.getByTestId("input-runs-source").fill(extra.sourceName);await page.getByTestId("button-runs-apply").click();}
 // Selection cap applies globally; also test the actual tray's third-checkbox disabled state.
 const third=page.locator('input[data-testid^="checkbox-run-"]:visible:not(:checked)').first();
 check(await third.isDisabled(),"third run selection disabled",{disabled:await third.isDisabled()});
 const sourceNames=await page.locator('[data-testid^="row-run-"] [data-testid*="source"]').allTextContents().catch(()=>[]);
 await page.getByTestId("button-compare").click();
 await page.getByTestId("page-comparison").waitFor({timeout:10000});
 check(page.url().includes(`a=${baseline[0].id}`)||page.url().includes(`b=${baseline[0].id}`),"runs selection navigates to comparison",{url:page.url(),visibleSourceLabels:sourceNames});
 // Exact known baseline requirements and reference drawer anchors from actual rendered values.
 const baseCmp=await api(page,`/api/comparison?a=${baseline.find(r=>r.orderId==="E-01").id}&b=${baseline.find(r=>r.orderId==="E-02").id}`);
 const metric=(obj,key)=>(obj.metrics??obj).find(m=>m.key===key);
 check(metric(baseCmp.a,"scrap_rate_pct").display==="5"&&metric(baseCmp.b,"scrap_rate_pct").display==="10"&&metric(baseCmp.differences,"scrap_rate_pct").display==="+5","baseline scrap rates +5pp",{a:metric(baseCmp.a,"scrap_rate_pct").display,b:metric(baseCmp.b,"scrap_rate_pct").display,diff:metric(baseCmp.differences,"scrap_rate_pct").display});
 check(metric(baseCmp.a,"changeover_min").display==="240"&&metric(baseCmp.b,"changeover_min").display==="360"&&metric(baseCmp.differences,"changeover_min").hours==="+2","baseline changeover 240/360/+2h",{a:metric(baseCmp.a,"changeover_min"),b:metric(baseCmp.b,"changeover_min"),d:metric(baseCmp.differences,"changeover_min")});
 check(metric(baseCmp.b,"downtime_min").display==="45"&&/separat/i.test(await page.getByTestId("text-downtime-separate").innerText()),"unplanned stop separate from changeover",{downtime:metric(baseCmp.b,"downtime_min").display,note:await page.getByTestId("text-downtime-separate").innerText()});
 check((await page.getByTestId("section-questions").locator('[data-testid^="card-question-"]').count())===3,"three server quick questions",{count:await page.getByTestId("section-questions").locator('[data-testid^="card-question-"]').count()});
 const refs=metric(baseCmp.a,"input_kg").refs;
 check(refs.length>0&&refs.every(x=>x.file&&x.line&&x.column),"metric references carry file/line/column",{refs:refs.slice(0,3)});
 await page.locator('[data-testid="link-source-a-input_kg"]:visible').first().click();
 await page.locator('[data-testid="panel-src-a-input_kg"]:visible').first().waitFor();
 const referenceText=await page.locator('[data-testid="panel-src-a-input_kg"]:visible').first().innerText();
 check(referenceText.includes(refs[0].file)&&referenceText.includes(String(refs[0].line)),"source reference expands with physical row",{text:referenceText.slice(0,450)});
 // Designer scenarios test per-group red hiding rather than whole-comparison hiding.
 const scenarioEvidence=[];
 const event14Pair=event14.length>1?event14:[baseline.find(r=>r.orderId==="E-01"),...event14].filter(Boolean);
 for(const [name,rs,redGroup,visibleGroup] of [["05_suspected_duplicate_record",suspect,"volume","changeover"],["07_missing_scrap_value",missing,"volume","changeover"],["03_conflicting_duplicate_event_id",eventRed,"downtime","changeover"],["14_missing_event_id",event14Pair,"changeover","volume"]]){
   if(rs.length<2){scenarioEvidence.push({name,status:"NOT AVAILABLE",count:rs.length});continue;}
   const cmp=await api(page,`/api/comparison?a=${rs[0].id}&b=${rs[1].id}`);
   await page.goto(`${base}/compare?a=${rs[0].id}&b=${rs[1].id}`); await page.getByTestId("section-summary").waitFor({timeout:10000});
   const red=await page.getByTestId(`state-group-blocked-${redGroup}`).count(), visible=await page.getByTestId(`section-group-${visibleGroup}`).count();
   check(red===1&&visible===1,`${name}: only red metric group blocked`,{red,visible,overall:cmp.overall,groups:cmp.groups});
   if(name.startsWith("05")) check(await page.getByTestId("blocked-alternatives-volume").count()===1,"suspected duplicate exposes volume alternative",{text:await page.getByTestId("blocked-alternatives-volume").innerText()});
   if(name.startsWith("07")) check((await page.getByTestId("state-group-blocked-volume").innerText()).toLowerCase().includes("not available"),"missing value is not available rather than zero",{text:(await page.getByTestId("state-group-blocked-volume").innerText()).slice(0,400)});
   scenarioEvidence.push({name,status:"PASS",overall:cmp.overall,groups:cmp.groups,red,visible});
 }
 ev.scenarioGroups=scenarioEvidence;
 let warningIssueTid;
 if(warning.length>=2){await page.goto(`${base}/compare?a=${warning[0].id}&b=${warning[1].id}`);await page.getByTestId("banner-warnings").waitFor();
   const issueLink=page.locator('[data-testid^="link-issue-"]').first(); warningIssueTid=await issueLink.getAttribute("data-testid");
   await issueLink.click();await page.getByTestId("section-focused-issue").waitFor({timeout:10000});await page.getByTestId("focused-issue").waitFor({timeout:10000});
  ev.linkedIssue={from:warningIssueTid,to:page.url(),focusedText:(await page.getByTestId("focused-issue").innerText()).slice(0,800)};
   check(page.url().includes("issue="),"comparison issue link opens exact focused quality issue",ev.linkedIssue);
 } else throw Error("warning fixture 12 not found as two runs");
 // Read-only viewer may use runs and comparison; server-side write denial is already covered by auth tests, no writes attempted here.
 await page.getByTestId("button-user-menu").click();await page.getByTestId("button-logout").click();await page.getByTestId("input-email").waitFor();
 await login(page,"ethmar.viewer@clarix.test");
 const viewerRuns=await api(page,"/api/runs?page=1");
 check(viewerRuns.total>0&&await page.getByTestId("page-runs").count()===1,"Viewer can read runs",{total:viewerRuns.total});
 const vpair=viewerRuns.items.slice(0,2);
 if(vpair.length===2){const vc=await api(page,`/api/comparison?a=${vpair[0].id}&b=${vpair[1].id}`);check(!!vc.a&&!!vc.b,"Viewer can read comparison",{ids:vpair.map(x=>x.id)});}
 // UI matrix: runs, comparison and linked exact quality issue at each required viewport/language/theme.
 const matrixPair=warning.slice(0,2);
 for(const width of [360,768,1280]) for(const language of ["en","ar"]) for(const theme of ["light","dark"]){
   await page.setViewportSize({width,height:1000});
   const lang=(await page.locator("html").getAttribute("lang")||"en").startsWith("ar")?"ar":"en";
   if(lang!==language) await page.locator('[data-testid="button-language"]:visible').first().click();
   await page.getByTestId("button-theme").click(); await page.getByTestId(`option-theme-${theme}`).click().catch(async()=>{await page.getByTestId("button-theme").click();await page.getByTestId(`option-theme-${theme}`).click();});
   await page.goto(base+"/runs");await page.getByTestId("page-runs").waitFor();await page.keyboard.press("Tab");
   const runMeasure=await measure(page); await page.screenshot({path:path.join(shots,`runs-${width}-${language}-${theme}.png`),fullPage:true});
   ev.screenshots.push({screen:"runs",width,language,theme,expanded:"initial",file:`screenshots/runs-${width}-${language}-${theme}.png`});ev.combos.push({screen:"runs",width,language,theme,...runMeasure});
   await page.goto(`${base}/compare?a=${matrixPair[0].id}&b=${matrixPair[1].id}`);await page.getByTestId("page-comparison").waitFor();await page.getByTestId("banner-warnings").waitFor();await page.keyboard.press("Tab");
   const cmpMeasure=await measure(page);
   if(width===360&&language==="en"&&theme==="light"){await page.locator('[data-testid="link-source-a-input_kg"]:visible').first().click();await page.locator('[data-testid="panel-src-a-input_kg"]:visible').first().waitFor();}
   await page.screenshot({path:path.join(shots,`comparison-${width}-${language}-${theme}.png`),fullPage:true});
   ev.screenshots.push({screen:"comparison",width,language,theme,expanded:width===360&&language==="en"&&theme==="light"?"source-reference":"initial",file:`screenshots/comparison-${width}-${language}-${theme}.png`});ev.combos.push({screen:"comparison",width,language,theme,...cmpMeasure});
   const link=page.locator('[data-testid^="link-issue-"]').first();await link.click();await page.getByTestId("section-focused-issue").waitFor();await page.getByTestId("focused-issue").waitFor();await page.keyboard.press("Tab");
   if(width===360&&language==="en"&&theme==="light"){const d=page.locator('[data-testid^="button-toggle-issue-"]').first();if(await d.count())await d.click();}
   const qMeasure=await measure(page);await page.screenshot({path:path.join(shots,`quality-${width}-${language}-${theme}.png`),fullPage:true});
   ev.screenshots.push({screen:"quality",width,language,theme,expanded:width===360&&language==="en"&&theme==="light"?"issue-detail":"exact-linked-issue",file:`screenshots/quality-${width}-${language}-${theme}.png`});ev.combos.push({screen:"quality",width,language,theme,...qMeasure});
 }
 check(ev.screenshots.length===36,"36 screen/viewport/language/theme screenshots captured",{count:ev.screenshots.length});
 ev.finishedAt=new Date().toISOString(); await browser.close();
 await fs.writeFile(path.join(out,"results.json"),JSON.stringify(ev,null,2));
 console.log(JSON.stringify({journey:ev.journey.length,combos:ev.combos.length,screenshots:ev.screenshots.length,scenarioGroups:ev.scenarioGroups,linkedIssue:ev.linkedIssue}));
}
main().catch(async e=>{ev.errors.push(e.stack||e.message);await browser?.close().catch(()=>{});await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,"results.json"),JSON.stringify(ev,null,2));console.error("Phase6 browser check failed:",e.stack||e);process.exitCode=1;});
