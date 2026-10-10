// Phase 12 charts. This driver is intentionally runnable only by test-isolated.ts.
require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID}=require("node:crypto");
const {chromium}=require(path.resolve("scripts/node_modules/playwright-core"));
const base=process.env.CLARIX_TEST_BASE_URL,password=process.env.SEED_TEST_PASSWORD;
const out=path.resolve(`generated-artifacts/phase12/${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID().slice(0,8)}`);
const ev={environment:"isolated local API/Vite only",startedAt:new Date().toISOString(),checks:[],matrix:[],scenarios:[],screenshots:[],consoleErrors:[],failedRequests:[],errors:[]};
let browser;
const tid=(p,id)=>p.getByTestId(id),safe=s=>String(s??"").replace(/([?&](?:token|invite)=)[^&#\s]+/gi,"$1[redacted]").slice(0,500);
async function save(){ev.updatedAt=new Date().toISOString();await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(ev,null,2));}
function rec(group,name,ok,actual){ev[group].push({name,status:ok?"PASS":"FAIL",actual});if(!ok)ev.errors.push(`${name}: ${safe(JSON.stringify(actual))}`);}
async function shot(p,name,fullPage=false){const file=`${name}.png`;await p.screenshot({path:path.join(out,file),fullPage,mask:[p.locator('input[type=password],[data-sensitive=true],[data-testid*=token]')],maskColor:"#000"});ev.screenshots.push(file);return file;}
async function api(p,url){const r=await p.request.get(base+url);return {status:r.status(),body:await r.json().catch(()=>null)};}
async function settle(p){await p.evaluate(()=>Promise.all(document.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect?.getComputedTiming().iterations)).map(a=>a.finished.catch(()=>{}))));await p.waitForTimeout(650);}
async function login(p,email="ethmar.manager@clarix.test"){await p.goto(base+"/login");await tid(p,"input-email").waitFor({timeout:12000});await tid(p,"input-email").fill(email);await tid(p,"input-password").fill(password);await tid(p,"button-login").click();await tid(p,"button-user-menu").waitFor({timeout:15000});}
async function logout(p){await tid(p,"button-user-menu").click();await tid(p,"button-logout").click();await tid(p,"input-email").waitFor({timeout:12000});}
async function setPrefs(p,lang,theme){
  if(await p.locator("html").getAttribute("lang")!==lang){const r=p.waitForResponse(x=>x.request().method()==="PATCH"&&new URL(x.url()).pathname==="/api/preferences"&&JSON.parse(x.request().postData()||"{}").language===lang,{timeout:12000}).catch(()=>null);await tid(p,"button-language").click();await p.waitForFunction(x=>document.documentElement.lang===x,lang,{timeout:7000});const x=await r,body=await x?.json().catch(()=>null);rec("checks",`save language ${lang}`,x?.status()===200&&body?.user?.language===lang,{status:x?.status()??"no matching response",lang:await p.locator("html").getAttribute("lang"),serverLanguage:body?.user?.language});}
  const now=await p.locator("html").evaluate(e=>e.classList.contains("dark")?"dark":"light");
  if(now!==theme){const r=p.waitForResponse(x=>x.request().method()==="PATCH"&&new URL(x.url()).pathname==="/api/preferences"&&JSON.parse(x.request().postData()||"{}").theme===theme,{timeout:12000}).catch(()=>null);await tid(p,"button-theme").click();await tid(p,`option-theme-${theme}`).click();await p.waitForFunction(x=>document.documentElement.classList.contains("dark")===(x==="dark"),theme,{timeout:7000});const x=await r,body=await x?.json().catch(()=>null);rec("checks",`save theme ${theme}`,x?.status()===200&&body?.user?.theme===theme,{status:x?.status()??"no matching response",theme:await p.locator("html").evaluate(e=>e.classList.contains("dark")?"dark":"light"),serverTheme:body?.user?.theme});}
}
async function dimensions(p,width,lang,theme){return p.evaluate(()=>{const controls=[...document.querySelectorAll("a,button,[role=button],input,select")].filter(e=>e.getClientRects().length);const small=controls.map(e=>{const target=e.matches('input[type="checkbox"]')?(e.closest("label")||e):e,r=target.getBoundingClientRect();return{text:(target.innerText||e.getAttribute("aria-label")||"").trim().slice(0,45),w:Math.round(r.width),h:Math.round(r.height),measuredLabel:e!==target}}).filter(x=>x.w<44||x.h<44);return{width:document.documentElement.scrollWidth,body:document.body.scrollWidth,inner:innerWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.classList.contains("dark")?"dark":"light",clipped:[...document.querySelectorAll("main h1,main h2,main h3,main p,main a,main button,main span")].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflow!=="hidden"&&getComputedStyle(e).textOverflow!=="ellipsis").map(e=>(e.innerText||"").trim().slice(0,60)).filter(Boolean).slice(0,12),smallTargets:small.slice(0,30),smallTargetCount:small.length};});}
async function cell(p,screen,w,lang,theme,route,ready,pair,cmpData,overviewData){
  const name=`${screen}-${w}-${lang}-${theme}`,entry={screen,width:w,lang,theme,route};
  try{
    await p.setViewportSize({width:w,height:900});await setPrefs(p,lang,theme);
    const url=screen==="comparison"?`${base}${route}?a=${pair[0].id}&b=${pair[1].id}`:screen==="sourceDrawer"?`${base}/comparison?a=${pair[0].id}&b=${pair[1].id}&sourceKind=metric&sourceId=${pair[0].id}&sourceMetric=scrap_rate_pct`:base+route;
    await p.goto(url);await tid(p,ready).waitFor({timeout:15000});await p.reload();await tid(p,ready).waitFor({timeout:15000});
    if(screen==="comparison"||screen==="sourceDrawer"){await tid(p,"chart-scrap_rate_pct").waitFor();await tid(p,"chart-changeover_min").waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('[data-testid^="chart-"] svg .recharts-bar-rectangle path')].some(x=>{const b=x.getBBox();return b.width>0&&b.height>0}),null,{timeout:10000});}
    if(screen==="sourceDrawer"){await tid(p,"drawer-source").waitFor();await tid(p,"section-source-value").waitFor();}
    if(screen==="overview"){await tid(p,"chart-overview-order_status").waitFor();await tid(p,"section-overview-kpis").waitFor();}
    if(screen==="comparison"||screen==="overview")entry.countUpFirstPaint=await p.evaluate(()=>[...document.querySelectorAll('[data-testid^="card-kpi-"][data-testid$="-value"],[data-testid^="card-overview-kpi-"][data-testid$="-value"]')].map(x=>({testId:x.getAttribute("data-testid"),final:x.getAttribute("data-final"),firstFrame:x.querySelector('[aria-hidden="true"]')?.innerText??null,accessibleFinal:x.querySelector(".sr-only")?.innerText??null})));
    await settle(p);
    if(screen==="comparison"){
      entry.charts=[];for(const key of ["scrap_rate_pct","changeover_min"]){const spec=cmpData.chart_spec.find(x=>x.key===key),chart=tid(p,`chart-${key}`),result={key,tablePresent:await tid(p,`chart-${key}-table`).count()===1,points:[]};for(const pt of spec.series){const pointId=`chart-${key}-point-${pt.key}`,available=await tid(p,pointId).getAttribute("data-available");result.points.push({key:pt.key,available,expected:pt.display,visible:available==="true"?await tid(p,`chart-${key}-value-${pt.key}`).innerText().catch(()=>null):await tid(p,`chart-${key}-na-${pt.key}`).innerText().catch(()=>null)});}entry.charts.push(result);}
      entry.kpis=[];for(const s of cmpData.indicators){const id=`card-kpi-${s.key}`,card=tid(p,id),b=s.series.find(x=>x.key==="b"),exp=b?.display,actual=b?.available?await tid(p,`${id}-final`).innerText().catch(()=>null):null,na=await tid(p,`${id}-na`).count();entry.kpis.push({key:s.key,expected:exp,available:b?.available,actual,na,cardPresent:await card.count()===1});}
    }
    if(screen==="overview"){
      const spec=overviewData.chart_spec.find(x=>x.key==="order_status");entry.overviewChart={points:[]};for(const pt of spec.series)entry.overviewChart.points.push({key:pt.key,expected:pt.display,actual:await tid(p,`chart-overview-order_status-value-${pt.key}`).innerText().catch(()=>null),segment:await tid(p,`chart-overview-order_status-segment-${pt.key}`).count()});
      entry.kpis=[];for(const s of overviewData.indicators){const id=`card-overview-kpi-${s.key}`,b=s.series.find(x=>x.key==="b"),actual=b?.available?await tid(p,`${id}-final`).innerText().catch(()=>null):null,na=await tid(p,`${id}-na`).count();entry.kpis.push({key:s.key,expected:b?.display,available:b?.available,actual,na,cardPresent:await tid(p,id).count()===1});}
    }
    await p.keyboard.press("Tab");entry.focus=await p.evaluate(()=>{const e=document.activeElement,s=e&&getComputedStyle(e);return{tag:e?.tagName,testId:e?.getAttribute("data-testid"),text:(e?.innerText||e?.getAttribute("aria-label")||"").trim().slice(0,60),focusVisible:e?.matches(":focus-visible")||false,outline:s?`${s.outlineStyle} ${s.outlineWidth}`:"",boxShadow:s?.boxShadow||""};});
    const d=await dimensions(p,w,lang,theme);entry.dom=d;entry.topScreenshot=await shot(p,name);
    const chartOk=screen!=="comparison"||entry.charts.every(c=>c.tablePresent&&c.points.every(x=>x.available==="true"?!!x.expected&&String(x.visible).includes(x.expected):x.available==="false"&&/n\/a|not available|غير متاح/i.test(String(x.visible))));
    const kpiOk=!["comparison","overview"].includes(screen)||entry.kpis.length===4&&entry.kpis.every(x=>x.cardPresent&&(x.available===false?x.na===1:x.expected===x.actual));
    const overviewOk=screen!=="overview"||entry.overviewChart.points.every(x=>x.expected===x.actual&&(Number(x.expected)>0?x.segment===1:x.segment===0))&&entry.kpis.length===4;
    entry.contentOk=chartOk&&kpiOk&&overviewOk;
    entry.ok=d.width<=w&&d.body<=w&&d.lang===lang&&d.dir===(lang==="ar"?"rtl":"ltr")&&d.theme===theme&&d.clipped.length===0&&entry.contentOk;
    if(!entry.ok)entry.reason="overflow, clipping, locale, direction, or theme assertion failed";
    const sections=screen==="comparison"?["chart-scrap_rate_pct","chart-changeover_min",...cmpData.indicators.map(x=>`card-kpi-${x.key}`)]:screen==="overview"?["chart-overview-order_status",...overviewData.indicators.map(x=>`card-overview-kpi-${x.key}`)]:screen==="help"?["section-help-glossary"]:screen==="sourceDrawer"?["section-source-value","section-source-rows"]:[];
    entry.sectionScreenshots=[];
    for(const id of sections){const el=tid(p,id);await el.scrollIntoViewIfNeeded();await settle(p);entry.sectionScreenshots.push(await shot(p,`${name}-${id}`));}
  }catch(e){entry.ok=false;entry.reason=safe(e.message);try{entry.failureScreenshot=await shot(p,name+"-failure")}catch{}}
  ev.matrix.push(entry);if(!entry.ok)ev.errors.push(`${name}: ${entry.reason}`);await save();
}
async function main(){
 await fs.mkdir(out,{recursive:true});if(!base||!password)throw Error("Isolated local target or test credential unavailable");
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 const ctx=await browser.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();
 p.on("console",m=>{if(m.type()==="error")ev.consoleErrors.push(safe(m.text()));});p.on("pageerror",e=>ev.consoleErrors.push(safe(e.message)));
 p.on("requestfailed",r=>ev.failedRequests.push({path:safe(new URL(r.url()).pathname),error:safe(r.failure()?.errorText)}));
 await login(p);await p.goto(base+"/overview");await tid(p,"page-overview").waitFor({timeout:15000});
 const tourBefore=(await api(p,"/api/auth/session")).body?.user?.tourCompleted;let tourPatch=null;
 if(await tid(p,"dialog-tour").isVisible().catch(()=>false)){const pending=tourBefore===false?p.waitForResponse(x=>x.request().method()==="PATCH"&&new URL(x.url()).pathname==="/api/preferences"&&JSON.parse(x.request().postData()||"{}").tourCompleted===true,{timeout:12000}).catch(()=>null):null;await tid(p,"button-tour-skip").click();if(pending){tourPatch=await pending;}}
 await tid(p,"dialog-tour").waitFor({state:"hidden",timeout:7000}).catch(()=>{});
 const tourAfter=(await api(p,"/api/auth/session")).body?.user?.tourCompleted;
 rec("checks","first-run onboarding tour dismissed before chart pages",!(await tid(p,"dialog-tour").isVisible().catch(()=>false))&&(tourBefore!==false||tourAfter===true),{wasOpen:tourBefore===false,preferenceStatus:tourPatch?.status()??"not required",tourCompleted:tourAfter});
 const session=(await api(p,"/api/auth/session")).body;
 rec("checks","authenticated Ethmar manager",!!session?.user&&session.memberships?.some(x=>x.factoryName==="Ethmar Plastics"),{user:!!session?.user,factory:session?.activeFactoryId});
 let runs=[];for(let n=1;n<20;n++){const x=await api(p,`/api/runs?page=${n}`);if(x.status!==200)break;runs.push(...(x.body.items||[]));if(runs.length>=x.body.total||!x.body.items?.length)break;}
 const baseline=runs.filter(x=>x.sourceName?.endsWith("-00_baseline"));
 const a=baseline.find(x=>x.orderId==="E-01"),b=baseline.find(x=>x.orderId==="E-02");
 rec("checks","approved Ethmar 00_baseline E-01/E-02 fixtures discovered from isolated API",!!a&&!!b,{count:baseline.length,orders:baseline.map(x=>x.orderId)});
 if(!a||!b)throw Error("Isolated approved baseline pair not found; no UI matrix run");
 const pair=[a,b],cmp=await api(p,`/api/comparison?a=${a.id}&b=${b.id}`),overview=await api(p,"/api/overview");
 rec("checks","baseline comparison API loaded with explicit signed axes",cmp.status===200&&cmp.body?.chart_spec?.every(x=>Number.isFinite(x.axisMin)&&Number.isFinite(x.axisMax)),{status:cmp.status,charts:cmp.body?.chart_spec?.map(x=>({key:x.key,axisMin:x.axisMin,axisMax:x.axisMax})),indicators:cmp.body?.indicators?.map(x=>x.key)});
 const chart=k=>cmp.body?.chart_spec?.find(x=>x.key===k),point=(k,s)=>chart(k)?.series?.find(x=>x.key===s);
 rec("checks","scrap baseline API values 5/10/+5",point("scrap_rate_pct","a")?.display==="5"&&point("scrap_rate_pct","b")?.display==="10"&&chart("scrap_rate_pct")?.difference?.display==="+5",{a:point("scrap_rate_pct","a")?.display,b:point("scrap_rate_pct","b")?.display,difference:chart("scrap_rate_pct")?.difference?.display});
 const downtime=cmp.body?.indicators?.find(x=>x.key==="downtime_min");
 rec("checks","changeover baseline API values 240/360/+2h and separate downtime 45",point("changeover_min","a")?.display==="240"&&point("changeover_min","b")?.display==="360"&&chart("changeover_min")?.difference?.hours==="+2"&&downtime?.series?.find(x=>x.key==="b")?.display==="45",{a:point("changeover_min","a")?.display,b:point("changeover_min","b")?.display,hours:chart("changeover_min")?.difference?.hours,downtime:downtime?.series?.find(x=>x.key==="b")?.display});
 rec("checks","Overview chart API available",overview.status===200&&overview.body?.chart_spec?.some(x=>x.key==="order_status"),{status:overview.status,charts:overview.body?.chart_spec?.map(x=>x.key),indicators:overview.body?.indicators?.map(x=>x.key)});
 await p.goto(`${base}/comparison?a=${a.id}&b=${b.id}`);await tid(p,"page-comparison").waitFor({timeout:15000});await tid(p,"chart-scrap_rate_pct").waitFor();await settle(p);
 const scrapText=await tid(p,"chart-scrap_rate_pct").innerText(),changeText=await tid(p,"chart-changeover_min").innerText(),downtimeText=await tid(p,"card-kpi-downtime_min").innerText();
 rec("checks","baseline chart panels show 5/10/+5 and 240/360/+120; downtime 45 remains separate",await p.locator('[data-chart-key]').count()===2&&/5/.test(scrapText)&&/10/.test(scrapText)&&/\+5/.test(scrapText)&&/240/.test(changeText)&&/360/.test(changeText)&&/\+120/.test(changeText)&&/45/.test(downtimeText)&&await tid(p,"text-downtime-separate").count()===1,{chartCount:await p.locator('[data-chart-key]').count(),scrapText:scrapText.slice(0,360),changeText:changeText.slice(0,360),downtimeText:downtimeText.slice(0,220),separateNote:await tid(p,"text-downtime-separate").innerText()});
 for(const key of ["scrap_rate_pct","changeover_min"]){const card=tid(p,`card-kpi-${key}`),apiSpec=cmp.body.indicators.find(x=>x.key===key),expected=apiSpec?.series?.find(x=>x.key==="b")?.display;rec("checks",`${key} comparison KPI visibly matches isolated API`,await card.count()===1&&!!expected&&(await card.innerText()).includes(expected),{expected,visible:await card.innerText().catch(()=>"(missing)")});}
 // Real chart mechanics: accessible tables, keyboard how-to/glossary, source URL and focus restoration, and KPI formula source.
 for(const key of ["scrap_rate_pct","changeover_min"]){
  try{
  const chartId=`chart-${key}`,table=tid(p,`${chartId}-table`);
  rec("checks",`${key} always-present accessible table`,await table.count()===1&&((await table.getAttribute("class"))||"").includes("sr-only"),{count:await table.count(),class:await table.getAttribute("class")});
  const toggle=tid(p,`${chartId}-toggle-table`);await toggle.click();rec("checks",`${key} visible table toggles and has values`,await table.isVisible()&&await table.locator("tbody tr").count()>=2,{rows:await table.locator("tbody tr").count()});await toggle.click();
 const how=tid(p,`${chartId}-how-to-read`);await how.focus();await p.keyboard.press("Enter");const pop= p.locator('[data-radix-popper-content-wrapper]').last();await pop.waitFor({timeout:5000});const howText=await pop.innerText();await p.keyboard.press("Escape");await pop.waitFor({state:"hidden"});await p.waitForFunction(id=>document.activeElement?.getAttribute("data-testid")===id,`${chartId}-how-to-read`,{timeout:3000});const howFocus=await p.evaluate(()=>document.activeElement?.getAttribute("data-testid"));rec("checks",`${key} how-to-read Enter/Escape restores focus`,howFocus===`${chartId}-how-to-read`&&!!howText.trim(),{popover:howText.slice(0,120),focus:howFocus});
  }catch(e){rec("checks",`${key} chart interaction block completes`,false,{error:safe(e.message)});}
 }
 try{
 const gl=tid(p,"chart-scrap_rate_pct-change-glossary-pp");await gl.focus();await p.keyboard.press("Enter");await tid(p,"popover-glossary-pp").waitFor();const glText=await tid(p,"popover-glossary-pp").innerText();await p.keyboard.press("Escape");await tid(p,"popover-glossary-pp").waitFor({state:"hidden"});await p.waitForFunction(id=>document.activeElement?.getAttribute("data-testid")===id,"chart-scrap_rate_pct-change-glossary-pp",{timeout:3000});
 rec("checks","glossary opens with Enter and closes with Escape",!!glText.trim()&&await tid(p,"popover-glossary-pp").isHidden(),{definition:glText.slice(0,150),focus:await p.evaluate(()=>document.activeElement?.getAttribute("data-testid"))});
 }catch(e){rec("checks","glossary keyboard interaction",false,{error:safe(e.message)});}
 try{
 const bar=tid(p,"chart-scrap_rate_pct-bar-a");await bar.click();await tid(p,"drawer-source").waitFor();await tid(p,"section-source-value").waitFor();await settle(p);
 const sourceUrl=new URL(p.url()),srcDetail=await api(p,`/api/source-detail?kind=metric&id=${a.id}&metric=scrap_rate_pct`);
 rec("checks","scrap bar opens correct real source drawer and API source",sourceUrl.searchParams.get("sourceKind")==="metric"&&sourceUrl.searchParams.get("sourceId")===a.id&&sourceUrl.searchParams.get("sourceMetric")==="scrap_rate_pct"&&srcDetail.status===200,{kind:sourceUrl.searchParams.get("sourceKind"),metric:sourceUrl.searchParams.get("sourceMetric"),sourceStatus:srcDetail.status,drawer:await tid(p,"text-source-title").innerText().catch(()=>"(missing)")});
 const drawer=tid(p,"drawer-source");await p.evaluate(async()=>Promise.all(document.querySelectorAll('[data-testid="drawer-source"] *').length?document.getAnimations({subtree:true}).map(x=>x.finished.catch(()=>{})):[]));const box=await drawer.boundingBox();rec("checks","source drawer finished motion and viewport geometry",!!box&&box.width>0&&box.x>=0,{box});
 await tid(p,"button-close-source").click();await drawer.waitFor({state:"hidden"});rec("checks","source drawer close restores focus to source bar",await p.evaluate(()=>document.activeElement?.getAttribute("data-testid"))==="chart-scrap_rate_pct-bar-a",{focus:await p.evaluate(()=>document.activeElement?.getAttribute("data-testid"))});
 const kpi=tid(p,"card-kpi-changeover_min"),howCalc=tid(p,"card-kpi-changeover_min-how-calc");await howCalc.click();await tid(p,"drawer-source").waitFor();await settle(p);const kpurl=new URL(p.url());
 rec("checks","KPI how-calculated link opens changeover difference source",kpurl.searchParams.get("sourceKind")==="metric"&&kpurl.searchParams.get("sourceMetric")==="changeover_min"&&kpurl.searchParams.get("sourceId")===a.id&&kpurl.searchParams.get("sourceOther")===b.id,{metric:kpurl.searchParams.get("sourceMetric"),sourceId:kpurl.searchParams.get("sourceId"),other:kpurl.searchParams.get("sourceOther"),kpi:await kpi.getAttribute("data-kpi-key")});
 await tid(p,"button-close-source").click();await tid(p,"drawer-source").waitFor({state:"hidden"});await save();
 }catch(e){rec("checks","source drawer and KPI source interaction block",false,{error:safe(e.message)});}
 // Scenario APIs are read-only and are fetched from this isolated authenticated browser session.
 for(const [suffix,label] of [["05_suspected_duplicate_record","05 suspected duplicate"],["07_missing_scrap_value","07 missing scrap"],["23_no_changeover_event","23 missing changeover"]]){
  const rs=runs.filter(x=>x.sourceName?.endsWith("-"+suffix)),row={scenario:suffix,count:rs.length};
  try{if(rs.length<2)throw Error("two imported fixture runs unavailable");const d=await api(p,`/api/comparison?a=${rs[0].id}&b=${rs[1].id}`);row.apiStatus=d.status;await p.goto(`${base}/comparison?a=${rs[0].id}&b=${rs[1].id}`);await tid(p,"page-comparison").waitFor({timeout:12000});await settle(p);
  if(suffix.startsWith("05")){row.available=await tid(p,"chart-scrap_rate_pct-point-b").getAttribute("data-available");row.na=await tid(p,"chart-scrap_rate_pct-na-b").count();row.chartTableB=await tid(p,"chart-scrap_rate_pct-table-row-b").innerText();row.mainTableB=await tid(p,"text-b-scrap_rate_pct").innerText().catch(async()=>await tid(p,"text-card-b-scrap_rate_pct").innerText());row.changeoverAvailable=(await Promise.all(["a","b"].map(x=>tid(p,`chart-changeover_min-point-${x}`).getAttribute("data-available")))).every(x=>x==="true");}
   if(suffix.startsWith("07")){row.available=await tid(p,"chart-scrap_rate_pct-point-b").getAttribute("data-available");row.na=await tid(p,"chart-scrap_rate_pct-na-b").count();row.qualityLink=await tid(p,"chart-scrap_rate_pct-na-b-quality").getAttribute("href");row.reason=await tid(p,"chart-scrap_rate_pct-na-b-reason").innerText();row.naText=await tid(p,"chart-scrap_rate_pct-na-b").innerText();}
   if(suffix.startsWith("23")){row.available=await tid(p,"chart-changeover_min-point-b").getAttribute("data-available");row.downtime=await tid(p,"section-downtime").innerText();row.downtimeAvailable=await tid(p,"section-downtime").locator('[data-testid^="row-metric-downtime_min"],[data-testid*="downtime_min"]').count();}
   row.ok=d.status===200&&(suffix.startsWith("23")?row.available==="false"&&row.downtimeAvailable>0:row.available==="false"&&row.na===1&&(suffix.startsWith("05")?/10/.test(row.mainTableB)&&/not available|غير متاح/i.test(row.chartTableB)&&row.changeoverAvailable:!!row.reason&&!!row.qualityLink&&/n\/a|not available|غير متاح/i.test(row.naText)));
  }catch(e){row.ok=false;row.error=safe(e.message);}
  ev.scenarios.push(row);if(!row.ok)ev.errors.push(`${label}: ${safe(JSON.stringify(row))}`);await save();
 }
 const pages=[["comparison","/comparison","page-comparison"],["overview","/overview","page-overview"],["runs","/runs","page-runs"],["quality","/quality","page-quality"],["help","/help","page-help"],["sourceDrawer","/comparison","drawer-source"]];
 for(const w of [360,768,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"])for(const [s,r,ready] of pages)await cell(p,s,w,lang,theme,r,ready,pair,cmp.body,overview.body);
 // Follow an accessible status-count link, then correlate the real filtered Runs response and selector state.
 try{await p.goto(base+"/overview");await tid(p,"chart-overview-order_status").waitFor();await settle(p);const status=overview.body.chart_spec[0].series.find(x=>Number(x.value)>0)?.key;
  if(!status)throw Error("No nonzero status count link in actual Overview data");const link=tid(p,`chart-overview-order_status-value-${status}`),response=p.waitForResponse(r=>new URL(r.url()).pathname==="/api/runs"&&new URL(r.url()).searchParams.get("status")===status,{timeout:12000});
  await link.click();await tid(p,"page-runs").waitFor();const r=await response,body=await r.json(),url=new URL(p.url()),selected=await tid(p,"select-runs-status").inputValue(),totalText=await tid(p,"text-runs-total").innerText(),uiCount=Number(totalText.replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^\d]/g,""));
  rec("checks","Overview status count navigates to matching filtered Runs and real API count",url.pathname==="/runs"&&url.searchParams.get("status")===status&&selected===status&&body.total===uiCount,{status,url:url.pathname+url.search,selected,serverTotal:body.total,uiTotal:totalText});await shot(p,"overview-status-to-runs");
 }catch(e){rec("checks","Overview status-to-Runs filter flow",false,{error:safe(e.message)});}
 // Exercise keyboard glossary activation and focus return on each changed glossary-bearing page.
 for(const [name,route,ready] of [["runs",base+"/runs","page-runs"],["quality",base+"/quality","page-quality"],["help",base+"/help","page-help"],["sourceDrawer",`${base}/comparison?a=${a.id}&b=${b.id}&sourceKind=metric&sourceId=${a.id}&sourceMetric=scrap_rate_pct`,"drawer-source"]]){
  try{await p.goto(route);await tid(p,ready).waitFor({timeout:12000});const trigger=p.locator('[data-testid^="button-glossary-"]:visible').first();await trigger.waitFor({timeout:8000});const id=await trigger.getAttribute("data-testid");await trigger.focus();await p.keyboard.press("Enter");const pop=p.locator('[data-testid^="popover-glossary-"]:visible').last();await pop.waitFor({timeout:5000});const text=await pop.innerText();await p.keyboard.press("Escape");const focus=await p.evaluate(()=>document.activeElement?.getAttribute("data-testid"));rec("checks",`${name} glossary Enter/Escape restores focus`,!!text.trim()&&focus===id,{trigger:id,popover:text.slice(0,100),focus});}
  catch(e){rec("checks",`${name} glossary keyboard behavior`,false,{error:safe(e.message)});}
 }
 // Verify read-only viewer chart access and strict tenant isolation on a second real user.
 try{
  await logout(p);await login(p,"ethmar.viewer@clarix.test");const vs=(await api(p,"/api/auth/session")).body;
  await p.goto(`${base}/comparison?a=${a.id}&b=${b.id}`);await tid(p,"chart-scrap_rate_pct").waitFor({timeout:12000});await settle(p);
  const viewerSource=await api(p,`/api/source-detail?kind=metric&id=${a.id}&metric=scrap_rate_pct`);
  rec("checks","Ethmar viewer can render charts and read source details",!!vs?.user&&vs.memberships?.some(x=>x.factoryName==="Ethmar Plastics")&&await tid(p,"chart-scrap_rate_pct").count()===1&&viewerSource.status===200,{authenticated:!!vs?.user,sourceStatus:viewerSource.status});
  await shot(p,"viewer-comparison-chart");
  await logout(p);await login(p,"najm.manager@clarix.test");const ns=(await api(p,"/api/auth/session")).body,naRuns=await api(p,"/api/runs?page=1");
  const foreign=await api(p,`/api/source-detail?kind=metric&id=${a.id}&metric=scrap_rate_pct`);
  const nr=naRuns.body?.items||[];if(nr.length>=2){await p.goto(`${base}/comparison?a=${nr[0].id}&b=${nr[1].id}`);await tid(p,"page-comparison").waitFor({timeout:12000});await tid(p,"chart-scrap_rate_pct").waitFor({timeout:12000});}
  rec("checks","Najm manager renders their charts and cannot resolve Ethmar source",!!ns?.user&&ns.memberships?.some(x=>/najm/i.test(x.factoryName))&&naRuns.status===200&&nr.length>=2&&foreign.status===404&&await tid(p,"chart-scrap_rate_pct").count()===1,{authenticated:!!ns?.user,ownRuns:nr.length,foreignSourceStatus:foreign.status,activeFactory:ns?.activeFactoryId});
  if(nr.length>=2)await shot(p,"najm-comparison-chart");
 }catch(e){rec("checks","Viewer and Najm chart/tenant checks",false,{error:safe(e.message)});}
 // Reduced motion is an actual browser media setting, separately checked after the visual matrix.
 try{await p.emulateMedia({reducedMotion:"reduce"});await p.setViewportSize({width:1280,height:900});await p.goto(`${base}/comparison?a=${a.id}&b=${b.id}`);await tid(p,"chart-scrap_rate_pct").waitFor();await settle(p);
 const motion=await p.evaluate(()=>({reduce:matchMedia("(prefers-reduced-motion: reduce)").matches,animations:[...document.getAnimations({subtree:true})].filter(a=>a.playState==="running").length,bars:[...document.querySelectorAll('[data-testid="chart-scrap_rate_pct"] svg .recharts-bar-rectangle path')].map(x=>x.getBBox().width),kpis:[...document.querySelectorAll('[data-testid^="card-kpi-"][data-testid$="-value"]')].map(x=>({text:x.innerText,final:x.getAttribute("data-final"),animated:!!x.querySelector('[aria-hidden="true"]')}))}));
 rec("checks","reduced motion uses final values without running chart/count-up animations",motion.reduce&&motion.animations===0&&motion.kpis.length===4&&motion.kpis.every(x=>!x.animated&&x.text.includes(x.final)),motion);await shot(p,"reduced-motion-comparison-bars");}catch(e){rec("checks","reduced motion browser probe",false,{error:safe(e.message)});}
 ev.finishedAt=new Date().toISOString();ev.summary={expectedMatrix:72,matrix:ev.matrix.length,matrixPassed:ev.matrix.filter(x=>x.ok).length,matrixFailed:ev.matrix.filter(x=>!x.ok).length,checks:ev.checks.length,failedChecks:ev.checks.filter(x=>x.status==="FAIL").length,scenarios:ev.scenarios.length,scenarioPassed:ev.scenarios.filter(x=>x.ok).length,screenshots:ev.screenshots.length,consoleErrors:ev.consoleErrors.length,failedRequests:ev.failedRequests.length,out};
 await save();console.log(JSON.stringify(ev.summary));await browser.close();if(ev.errors.length)process.exitCode=1;
}
main().catch(async e=>{ev.errors.push(safe(e.stack||e.message));ev.finishedAt=new Date().toISOString();ev.summary={failed:true,matrix:ev.matrix.length,screenshots:ev.screenshots.length,out};await fs.mkdir(out,{recursive:true}).catch(()=>{});await save().catch(()=>{});console.error(`Phase12 isolated browser driver stopped; evidence ${path.basename(out)}: ${safe(e.message)}`);await browser?.close().catch(()=>{});process.exitCode=1;});
