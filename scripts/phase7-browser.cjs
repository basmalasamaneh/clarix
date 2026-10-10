// Phase 7 browser verification. Only runnable through the disposable-schema harness.
require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{chromium}=require("playwright-core");
const base=process.env.CLARIX_TEST_BASE_URL,password=process.env.SEED_TEST_PASSWORD;
const attempt=process.env.PHASE7_ATTEMPT||new Date().toISOString().replace(/[:.]/g,"-");
const out=path.resolve(`generated-artifacts/phase7/browser-${attempt}`);
const evidence={attempt,startedAt:new Date().toISOString(),environment:"isolated local API/Vite",journey:[],scenarios:[],matrix:[],focus:[],screenshots:[],errors:[],writesAttempted:false};
let browser;
const record=(name,ok,actual)=>{evidence.journey.push({name,status:ok?"PASS":"FAIL",actual});if(!ok)evidence.errors.push(`${name}: ${JSON.stringify(actual)}`);};
const expect=async(name,fn)=>{try{const v=await fn();record(name,!!v,v);return !!v}catch(e){record(name,false,String(e.message||e));return false}};
const visible=(p,id)=>p.locator(`[data-testid="${id}"]:visible`).first();
async function api(p,url){const r=await p.request.get(base+url);let body;try{body=await r.json()}catch{body=await r.text()}return {status:r.status(),body};}
async function login(p,email){await p.goto(base+"/login");await p.getByTestId("input-email").fill(email);await p.getByTestId("input-password").fill(password);await p.getByTestId("button-login").click();await p.getByTestId("link-nav-runs").waitFor({timeout:15000});await p.goto(base+"/runs");await p.getByTestId("page-runs").waitFor({timeout:15000});if(await p.getByTestId("dialog-tour").count())await p.getByTestId("button-tour-skip").click();}
async function allRuns(p,source){let items=[];for(let page=1;page<100;page++){const r=await api(p,`/api/runs?page=${page}${source?`&source=${encodeURIComponent(source)}`:""}`);if(r.status!==200)throw Error(`runs API ${r.status}`);items.push(...r.body.items);if(items.length>=r.body.total||!r.body.items.length)break;}return items;}
async function sourceIssues(p,source){let items=[];for(let pg=1;pg<100;pg++){const r=await api(p,`/api/quality?page=${pg}${source?`&source=${encodeURIComponent(source)}`:""}&includeArchived=true`);if(r.status!==200)throw Error(`quality API ${r.status}`);items.push(...r.body.items);if(items.length>=r.body.total||!r.body.items.length)break;}return items;}
async function openDrawer(p,tid){const l=visible(p,tid);await l.waitFor({timeout:10000});await l.click();await p.getByTestId("drawer-source").waitFor({timeout:10000});await p.getByTestId("section-source-value").waitFor({timeout:15000});await p.waitForFunction(()=>{const e=document.querySelector('[data-testid="drawer-source"]'),r=e?.getBoundingClientRect();return !!r&&e.getAnimations().every(a=>a.playState!=="running")&&r.x>=-1&&r.right<=innerWidth+1},{},{timeout:8000});}
async function closeDrawer(p){const c=p.getByTestId("button-close-source");if(await c.count())await c.click();await p.locator('[data-testid="drawer-source"]').waitFor({state:"hidden",timeout:10000});}
async function waitDrawer(p){await p.getByTestId("drawer-source").waitFor({timeout:10000});await p.getByTestId("section-source-value").waitFor({timeout:15000});}
async function pref(p,lang,theme){const html=p.locator("html"),cur=(await html.getAttribute("lang")||"en").startsWith("ar")?"ar":"en";if(cur!==lang){await visible(p,"button-language").click();await p.waitForFunction(x=>document.documentElement.lang.startsWith(x),lang,{timeout:5000});}
 const b=visible(p,"button-theme");await b.click();const opt=visible(p,`option-theme-${theme}`);await opt.click();await p.waitForFunction(x=>x==="dark"?document.documentElement.classList.contains("dark"):!document.documentElement.classList.contains("dark"),theme,{timeout:5000});}
async function getSource(p,kind,id,metric,other,page=1){let q=new URLSearchParams({kind,id,page:String(page)});if(metric)q.set("metric",metric);if(other)q.set("other",other);return api(p,`/api/source-detail?${q}`);}
function decimalUnits(v,scale){let s=String(v),neg=s.startsWith("-");if(neg)s=s.slice(1);const [a,b=""]=s.split(".");const n=BigInt(a)*10n**BigInt(scale)+BigInt((b+"0".repeat(scale)).slice(0,scale)||"0");return neg?-n:n;}
function decimalFormat(units,scale){const neg=units<0n,abs=neg?-units:units,factor=10n**BigInt(scale),whole=abs/factor,frac=(abs%factor).toString().padStart(scale,"0").replace(/0+$/,"");return `${neg?"-":""}${whole}${frac?`.${frac}`:""}`;}
function decimalSum(values){const scale=Math.max(0,...values.map(v=>(String(v).split(".")[1]||"").length));return decimalFormat(values.reduce((s,v)=>s+decimalUnits(v,scale),0n),scale);}
function decimalSub(a,b){const scale=Math.max((String(a).split(".")[1]||"").length,(String(b).split(".")[1]||"").length);return decimalFormat(decimalUnits(a,scale)-decimalUnits(b,scale),scale);}
async function focusMetrics(p,scope){const n=await p.evaluate(()=>[...document.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[role="button"],[tabindex]:not([tabindex="-1"])')].filter(e=>e.getClientRects().length&&!e.closest('[aria-hidden="true"]')).length);
 const found=new Map();for(let i=0;i<n+4;i++){await p.keyboard.press("Tab");const x=await p.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect(),target=e.matches('input[type="checkbox"]')?(e.closest("label")||e):e,tr=target.getBoundingClientRect(),tc=getComputedStyle(target),ring=(c.outlineStyle!=="none"&&parseFloat(c.outlineWidth)>0)||(c.boxShadow!=="none"&&c.boxShadow!=="");return {testId:e.getAttribute("data-testid"),tag:e.tagName,role:e.getAttribute("role"),label:e.getAttribute("aria-label")||e.innerText?.trim().slice(0,70),focusVisible:e.matches(":focus-visible"),outline:`${c.outlineStyle} ${c.outlineWidth}`,boxShadow:c.boxShadow,ring,w:Math.round(r.width),h:Math.round(r.height),targetTag:target.tagName,targetW:Math.round(tr.width),targetH:Math.round(tr.height),targetOutline:`${tc.outlineStyle} ${tc.outlineWidth}`,href:e.getAttribute("href")};});
 if(x){const key=x.testId||`${x.tag}:${x.label}:${x.href}`;if(!found.has(key))found.set(key,x);}}
 const rows=[...found].map(([key,v])=>({scope,key,...v}));evidence.focus.push(...rows);return rows;}
async function dims(p){return p.evaluate(()=>{const d=document.querySelector('[data-testid="drawer-source"]'),r=d?.getBoundingClientRect(),cs=d&&getComputedStyle(d);const missing=(document.body.innerText.match(/(?:^|\s)(?:rc|q|src|common|prefs)\.[\w.]+/g)||[]).slice(0,20);
return {document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,innerWidth,innerHeight,dir:document.documentElement.dir,lang:document.documentElement.lang},bodyScrollWidth:document.body.scrollWidth,missingTranslationKeys:missing,drawer:d?{side:d.getAttribute("data-side"),x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,overflowX:cs.overflowX}:null};});}
async function screenshotCombo(p,route,trigger,screen,width,lang,theme,sourceName){const tag=`${screen}-${width}-${lang}-${theme}`;try{
 await p.setViewportSize({width,height:1000});await pref(p,lang,theme);await p.goto(base+route);await p.getByTestId(screen==="comparison"?"page-comparison":screen==="quality"?"page-quality":"page-runs").waitFor({timeout:15000});
 if(screen==="runs"){await p.getByTestId("input-runs-source").fill(sourceName);await p.getByTestId("button-runs-apply").click();await visible(p,trigger).waitFor({timeout:15000});}
 if(screen==="comparison")await visible(p,trigger).waitFor({timeout:15000});
 if(screen==="quality")await visible(p,trigger).waitFor({timeout:10000});
 await openDrawer(p,trigger);
 const m=await dims(p);evidence.matrix.push({screen,width,lang,theme,...m});
  record(`${tag} viewport, RTL side, overflow, translations`,m.document.width<=width&&m.bodyScrollWidth<=width&&m.drawer?.height===1000&&m.drawer.x>=0&&m.drawer.x+m.drawer.width<=width&&m.drawer.side===(lang==="ar"?"left":"right")&&m.drawer.scrollWidth<=m.drawer.clientWidth&&m.document.dir===(lang==="ar"?"rtl":"ltr")&&m.missingTranslationKeys.length===0,{viewportWidth:width,documentWidth:m.document.width,bodyWidth:m.bodyScrollWidth,drawer:m.drawer,dir:m.document.dir,lang:m.document.lang,missingKeys:m.missingTranslationKeys});
 await p.screenshot({path:path.join(out,`${tag}.png`),fullPage:false});evidence.screenshots.push(`${tag}.png`);
 await closeDrawer(p);
 }catch(e){evidence.errors.push(`matrix ${tag}: ${e.message}`);evidence.matrix.push({screen,width,lang,theme,error:e.message});}}
(async()=>{
 await fs.mkdir(out,{recursive:false});if(!password)throw Error("SEED_TEST_PASSWORD missing inside isolated harness");
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 const ctx=await browser.newContext({viewport:{width:1280,height:1000}}),p=await ctx.newPage();
 await login(p,"ethmar.analyst@clarix.test");await pref(p,"en","light");
 const runs=await allRuns(p);const by=s=>runs.filter(r=>r.sourceName.endsWith("-"+s));
 const baseline=by("00_baseline"),f05=by("05_suspected_duplicate_record"),f07=by("07_missing_scrap_value"),f12=by("12_possible_overlap"),f17=by("17_multiple_changeover_events"),f23=by("23_no_changeover_event");
 const b1=baseline.find(r=>r.orderId==="E-01"),b2=baseline.find(r=>r.orderId==="E-02");
 record("Ethmar Analyst fixture baseline runs",!!(b1&&b2),baseline.map(r=>({id:r.id,order:r.orderId,source:r.sourceName})));
 if(!b1||!b2)throw Error("Baseline fixtures unavailable in isolated test target");
 const cmpR=await api(p,`/api/comparison?a=${b1.id}&b=${b2.id}`);if(cmpR.status!==200)throw Error(`comparison API ${cmpR.status}`);const cmp=cmpR.body;
 const metrics=cmp.a.metrics||[],diffs=cmp.differences||[];
 record("comparison baseline metrics loaded",metrics.length>=7,{count:metrics.length,keys:metrics.map(x=>x.key)});
 // The API is read-only evidence; decimal addition is performed here only as a test assertion.
 for(const [side,r,list] of [["a",b1,cmp.a.metrics||[]],["b",b2,cmp.b.metrics||[]],["d",b1,diffs]])for(const m of list){
  const s=await getSource(p,"metric",r.id,m.key,side==="d"?b2.id:null);
  record(`baseline ${side} ${m.key} source API`,s.status===200&&s.body.value===m.value,{status:s.status,value:s.body?.value,expected:m.value,rows:s.body?.total});
  if(side!=="d"&&s.status===200&&["input_kg","good_kg","scrap_kg","changeover_min","downtime_min"].includes(m.key)&&m.value!==null){
   const pages=[...(s.body.rows||[])];for(let pg=2;pages.length<s.body.total;pg++){const x=await getSource(p,"metric",r.id,m.key,null,pg);if(x.status!==200)break;pages.push(...(x.body.rows||[]));}
   const vals=pages.filter(row=>row.kind==="included").flatMap(row=>row.contributions.filter(c=>c.key===m.key).map(c=>c.value)).filter(v=>v!==null);
   const sum=decimalSum(vals);
   record(`baseline ${side} ${m.key} exact included source sum`,sum===String(m.value),{sum,expected:m.value,parts:vals});
  }
  if(side==="d"&&m.value!==null){const a=await getSource(p,"metric",b1.id,m.key),b=await getSource(p,"metric",b2.id,m.key);const calc=a.status===200&&b.status===200?decimalSub(b.body.value,a.body.value):null;record(`baseline difference ${m.key} exact B-A`,calc===String(m.value),{a:a.body?.value,b:b.body?.value,calculated:calc,expected:m.value});}
 }
 // Comparison value/difference click journey and required keyboard close/return checks.
 await p.goto(`${base}/compare?a=${b1.id}&b=${b2.id}`);await p.getByTestId("page-comparison").waitFor();await visible(p,"link-source-a-input_kg").waitFor({timeout:15000});
 for(const m of metrics){const link=visible(p,`link-source-a-${m.key}`);if(await link.count()){await openDrawer(p,`link-source-a-${m.key}`);const val=await p.getByTestId("text-source-value").innerText();record(`drawer opens from baseline ${m.key}`,val.includes(m.display??m.value??"Not"),{display:m.display,value:m.value,drawer:val});await closeDrawer(p);}}
 for(const m of cmp.b.metrics||[]){const link=visible(p,`link-source-b-${m.key}`);if(await link.count()){await openDrawer(p,`link-source-b-${m.key}`);const val=await p.getByTestId("text-source-value").innerText();record(`drawer opens from baseline B ${m.key}`,val.includes(m.display??m.value??"Not"),{display:m.display,value:m.value,drawer:val});await closeDrawer(p);}}
 for(const m of diffs){if(await visible(p,`link-source-d-${m.key}`).count()){await openDrawer(p,`link-source-d-${m.key}`);record(`difference drawer ${m.key}`,await p.getByTestId("text-source-title").count()===1,{title:await p.getByTestId("text-source-title").innerText()});await closeDrawer(p);}}
 await openDrawer(p,"link-source-a-scrap_rate_pct");
 record("baseline formula and input fields shown",await p.getByTestId("text-source-formula").count()===1&&await p.getByTestId("row-source-input-scrap_kg").count()===1&&await p.getByTestId("row-source-input-input_kg").count()===1,{formula:await p.getByTestId("text-source-formula").innerText(),scrap:await p.getByTestId("text-source-input-scrap_kg").innerText(),input:await p.getByTestId("text-source-input-input_kg").innerText()});
 await closeDrawer(p);
 // Baseline B event breakdown and row-linked input evidence.
 await openDrawer(p,"link-source-b-changeover_min");
 const bChangeText=await p.getByTestId("drawer-source").innerText();
 record("baseline B 360-minute changeover event breakdown",bChangeText.includes("360")&&await p.getByTestId("section-source-events-changeover").count()===1,{events:await p.getByTestId("section-source-events-changeover").innerText(),breakdown:await p.getByTestId("text-source-breakdown").innerText().catch(()=>"(no breakdown)")});
 await closeDrawer(p);
 await openDrawer(p,"link-source-b-input_kg");
 const inputD=await getSource(p,"metric",b2.id,"input_kg"),inputPart=inputD.body.rows?.find(row=>row.kind==="included"&&row.contributions.some(c=>c.key==="input_kg"));
 let partLinked=false;if(inputPart){const part=visible(p,`link-part-${inputPart.id}-input_kg`);if(await part.count()){await part.click();partLinked=await p.evaluate(id=>document.activeElement?.id===id,`source-row-main-${inputPart.id}`);}}
 record("baseline B input total 1000 and contribution links to source row",(await p.getByTestId("text-source-value").innerText()).includes("1000")&&!!inputPart&&partLinked,{value:await p.getByTestId("text-source-value").innerText(),part:inputPart&&{id:inputPart.id,file:inputPart.file,line:inputPart.line},focusedSourceRow:partLinked});
 await closeDrawer(p);
 const inputLink=visible(p,"link-source-a-input_kg");await inputLink.waitFor();await inputLink.focus();await p.keyboard.press("Enter");await waitDrawer(p);
 const triggerHandle=await inputLink.elementHandle(),activeInside=await p.evaluate(()=>!!document.activeElement?.closest('[data-testid="drawer-source"]'));
 record("Enter opens and focus enters drawer",activeInside,{active:await p.evaluate(()=>document.activeElement?.getAttribute("data-testid"))});
 await p.keyboard.press("Shift+Tab");const shiftInside=await p.evaluate(()=>!!document.activeElement?.closest('[data-testid="drawer-source"]'));
 await p.keyboard.press("Tab");const tabInside=await p.evaluate(()=>!!document.activeElement?.closest('[data-testid="drawer-source"]'));
 record("Tab and Shift+Tab focus remain trapped",shiftInside&&tabInside,{shiftInside,tabInside});
 await p.keyboard.press("Escape");await p.getByTestId("drawer-source").waitFor({state:"hidden",timeout:8000});
 record("Escape closes and restores exact trigger",await p.evaluate(el=>document.activeElement===el,triggerHandle),{active:await p.evaluate(()=>document.activeElement?.getAttribute("data-testid"))});
 await openDrawer(p,"link-source-a-input_kg");await closeDrawer(p);
 record("visible close restores exact trigger",await p.evaluate(el=>document.activeElement===el,triggerHandle),{active:await p.evaluate(()=>document.activeElement?.getAttribute("data-testid"))});
 await openDrawer(p,"link-source-a-changeover_min");const shared=p.url();await p.reload();await waitDrawer(p);
 record("reload deep link reopens drawer",p.url().includes("sourceKind=metric")&&await p.getByTestId("text-source-title").count()===1,{url:p.url()});
 await closeDrawer(p);
 record("deep-link close falls back to main",await p.evaluate(()=>document.activeElement?.id==="main"),{active:await p.evaluate(()=>({id:document.activeElement?.id,testid:document.activeElement?.getAttribute("data-testid")}))});
 record("shareable URL carries source params",/sourceKind=metric/.test(shared),shared);
 // Required source detail assertions for baseline B and scenario fixtures.
 const selectedScenario={};
 for(const [name,rs] of [["17_multiple_changeover_events",f17],["23_no_changeover_event",f23],["05_suspected_duplicate_record",f05],["07_missing_scrap_value",f07],["12_possible_overlap",f12]]){
  if(!rs.length){evidence.scenarios.push({name,status:"UNAVAILABLE"});continue;}
  let run=rs.find(x=>x.orderId==="E-02")||rs[0];
  if(name.startsWith("23")){for(const candidate of rs){const d=await getSource(p,"metric",candidate.id,"changeover_min");if(d.status===200&&d.body.value===null&&JSON.stringify(d.body.notes||[]).toLowerCase().includes("no changeover")){run=candidate;break;}}}
  if(name.startsWith("17")){for(const candidate of rs){const d=await getSource(p,"metric",candidate.id,"changeover_min");if(d.status===200&&d.body.rows.filter(x=>x.event?.type==="CHANGEOVER").length===2){run=candidate;break;}}}
  if(name.startsWith("12")){for(const candidate of rs){const d=await getSource(p,"metric",candidate.id,"changeover_min");if(d.status===200&&d.body.notes?.some(n=>/overlap/i.test(n.en||""))){run=candidate;break;}}}
  selectedScenario[name]=run;
  const keys=name.startsWith("05")?["input_kg"]:name.startsWith("07")?["scrap_kg"]:name.startsWith("17")||name.startsWith("23")?["changeover_min"]:["changeover_min","downtime_min"];
  for(const key of keys){const d=await getSource(p,"metric",run.id,key);const body=d.body||{};let checks={status:d.status,value:body.value,rows:body.rows?.length,notes:body.notes,breakdown:body.breakdown};
   if(name.startsWith("05")){checks.duplicatePairs=body.duplicatePairs?.map(x=>({original:x.original.line,suspected:x.suspected.line}));checks.alternatives=body.alternatives;}
   if(name.startsWith("07"))checks.highlighted=body.rows?.flatMap(x=>x.cells).filter(c=>c.highlighted).map(c=>({column:c.column,value:c.value}));
   if(name.startsWith("12"))checks.events=body.rows?.filter(x=>x.event).map(x=>({type:x.event.type,minutes:x.event.minutes}));
   if(name.startsWith("17"))checks.events=body.rows?.filter(x=>x.event).map(x=>({type:x.event.type,minutes:x.event.minutes}));
   if(name.startsWith("23"))checks.noteText=body.notes?.map(n=>n.en);
   let ok=d.status===200;
   if(name.startsWith("17")){const events=body.rows.filter(x=>x.event?.type==="CHANGEOVER");ok=ok&&events.length===2&&decimalSum(events.map(x=>x.event.minutes))==="360"&&body.value==="360";}
   if(name.startsWith("23"))ok=ok&&body.value===null&&JSON.stringify(body.notes||[]).toLowerCase().includes("no changeover");
   if(name.startsWith("05"))ok=ok&&(body.duplicatePairs||[]).length>0&&(body.alternatives||[]).some(x=>x.key==="exclude_suspected");
   if(name.startsWith("07"))ok=ok&&body.value===null&&body.rows.some(x=>x.cells.some(c=>c.column==="scrap"&&c.value===""&&c.highlighted));
   if(name.startsWith("12"))ok=ok&&body.notes?.some(n=>/overlap/i.test(n.en||""))&&body.rows.some(x=>/DOWNTIME/i.test(x.event?.type||""));
   evidence.scenarios.push({name,key,status:ok?"PASS":"FAIL",...checks});if(!ok)evidence.errors.push(`${name}/${key} details did not match`);
  }
 }
 // UI drawer scenario proof: suspected duplicate, missing scrap cell, two CHG events/no-CHG note, overlap and separate downtime.
const scenarioRun=async(rs,key,label,assertFn,name)=>{if(!rs.length){record(`${label} run data available`,false,0);return;}const r=selectedScenario[name]||rs.find(x=>x.orderId==="E-02")||rs[0];await p.goto(`${base}/runs`);await p.getByTestId("page-runs").waitFor();await p.getByTestId("input-runs-source").fill(r.sourceName);await p.getByTestId("button-runs-apply").click();const tid=`link-text-run-${key}-${r.id}`,trigger=visible(p,tid);try{await trigger.waitFor({timeout:15000});}catch{record(`${label} run trigger available`,false,{order:r.orderId,source:r.sourceName,metric:key});return;}await openDrawer(p,tid);const text=await p.getByTestId("drawer-source").innerText();const ok=assertFn(text);record(`${label} visible drawer evidence`,ok,text.slice(0,1200));if(label==="07-missing-cell"){const d=await getSource(p,"metric",r.id,"scrap_kg"),cell=d.body.rows.flatMap(x=>x.cells).find(c=>c.column==="scrap"&&c.value===""&&c.highlighted),el=cell&&p.locator(`[data-testid="cell-main-${d.body.rows.find(x=>x.cells.includes(cell)).id}-scrap"]`);record("07 UI highlights actual empty scrap cell",!!el&&await el.getAttribute("data-highlighted")==="true",{column:cell?.column,value:cell?.value,highlighted:el&&await el.getAttribute("data-highlighted")});}
 if(label==="05-duplicates"){record("05 UI shows paired duplicate rows and alternatives",await p.getByTestId("section-source-duplicates").count()===1&&await p.getByTestId("section-source-alternatives").count()===1,{pairs:await p.locator('[data-testid^="pair-duplicate-"]').count(),alternatives:await p.getByTestId("section-source-alternatives").count()});}
 if(label==="12-overlap"){record("12 UI keeps downtime separate with non-causal note",await p.getByTestId("section-source-events-downtime").count()===1&&await p.getByTestId("text-source-downtime-note").count()===1,{downtime:await p.getByTestId("section-source-events-downtime").count(),note:await p.getByTestId("text-source-downtime-note").innerText().catch(()=>null)});}
 await p.screenshot({path:path.join(out,`scenario-${label}.png`),fullPage:false});evidence.screenshots.push(`scenario-${label}.png`);await closeDrawer(p);};
 await scenarioRun(f05,"input_kg","05-duplicates",t=>/duplicate|مكرر/i.test(t)&&/alternative|without|بدون/i.test(t),"05_suspected_duplicate_record");
 await scenarioRun(f07,"scrap_kg","07-missing-cell",t=>/Not available|غير متوفر/i.test(t)&&/scrap|هدر/i.test(t),"07_missing_scrap_value");
 await scenarioRun(f17,"changeover_min","17-changeover",t=>/360/.test(t)&&/CHANGEOVER|تغيير/i.test(t),"17_multiple_changeover_events");
 await scenarioRun(f23,"changeover_min","23-no-changeover",t=>/No changeover|no event|لا يوجد|لا أحداث/i.test(t),"23_no_changeover_event");
 await scenarioRun(f12,"changeover_min","12-overlap",t=>/overlap|overlap minutes|تداخل/i.test(t)&&/downtime|stop|separat|منفصل/i.test(t),"12_possible_overlap");
 // Runs list trigger and Data Quality issue; choose the exact fixture issue, preferring historical if present.
 const baseSource=b1.sourceName,allIssues=await sourceIssues(p),issue=allIssues.find(i=>i.superseded)||allIssues.find(i=>i.code==="SUSPECTED_DUPLICATE_RECORD")||allIssues[0],issueSource=issue?.sourceName||f05[0]?.sourceName||baseSource;
 const runTrigger=`link-text-run-input_kg-${b1.id}`,runTriggerMobile=`link-text-run-card-input_kg-${b1.id}`;
 const qTrigger=issue&&`button-open-issue-${issue.id}`;
 record("Data Quality issue selected for drawer",!!issue,{id:issue?.id,code:issue?.code,sourceName:issue?.sourceName,superseded:issue?.superseded||false});
 // Viewer's real login and no write actions.
 await p.getByTestId("button-user-menu").click();await p.getByTestId("button-logout").click();await p.getByTestId("input-email").waitFor();
 await login(p,"ethmar.viewer@clarix.test");
 const vr=await api(p,`/api/source-detail?kind=metric&id=${b1.id}&metric=input_kg`);
 record("Viewer can read source detail",vr.status===200,{status:vr.status});
 await p.goto(`${base}/runs?sourceKind=metric&sourceId=${b1.id}&sourceMetric=input_kg`);await p.getByTestId("page-runs").waitFor();await p.getByTestId("drawer-source").waitFor();await p.getByTestId("section-source-value").waitFor();
 record("Viewer can read source drawer in UI",(await p.getByTestId("text-source-value").innerText()).includes("1000"),{value:await p.getByTestId("text-source-value").innerText()});await closeDrawer(p);
 // Tenancy URL denial: discover Najm ID in an authenticated Najm read-only session, then test as Ethmar analyst.
 await p.getByTestId("button-user-menu").click();await p.getByTestId("button-logout").click();await p.getByTestId("input-email").waitFor();
 await login(p,"najm.manager@clarix.test");const nr=await allRuns(p);const nrun=nr[0];record("Najm fixture ID available for tenancy probe",!!nrun,nrun&&{id:nrun.id});
 await p.getByTestId("button-user-menu").click();await p.getByTestId("button-logout").click();await p.getByTestId("input-email").waitFor();
 await login(p,"ethmar.analyst@clarix.test");
 if(nrun){await p.goto(`${base}/runs?sourceKind=metric&sourceId=${nrun.id}&sourceMetric=input_kg`);await p.getByTestId("page-runs").waitFor();await p.getByTestId("drawer-source").waitFor();const denied=await p.getByTestId("state-source-not-found").count();const text=await p.getByTestId("drawer-source").innerText();record("guessed Najm drawer URL is 404 without source/name leak",denied===1&&!text.includes(nrun.sourceName)&&!text.includes(nrun.orderId),{notFound:denied,leak:text.includes(nrun.sourceName)||text.includes(nrun.orderId)});await closeDrawer(p);}
 // Main parent journey routes used for the complete 3x2x2 screenshot matrix.
 for(const width of [360,768,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"]){
  const routeRuns="/runs",routeCmp=`/compare?a=${b1.id}&b=${b2.id}`,routeQuality=`/quality?source=${encodeURIComponent(issueSource||baseSource)}`;
  await screenshotCombo(p,routeRuns,width<768?runTriggerMobile:runTrigger,"runs",width,lang,theme,b1.sourceName);
  await screenshotCombo(p,routeCmp,"link-source-a-input_kg","comparison",width,lang,theme);
  if(qTrigger)await screenshotCombo(p,routeQuality,qTrigger,"quality",width,lang,theme);
 }
 // Rings and sidebar targets are explicitly measured, with keyboard modality, for each changed page and drawer.
 for(const [screen,route,trigger] of [["runs","/runs",runTrigger],["comparison",`/compare?a=${b1.id}&b=${b2.id}`,"link-source-a-input_kg"],["quality",`/quality?source=${encodeURIComponent(issueSource||baseSource)}`,qTrigger]]){
  if(!trigger)continue;await p.setViewportSize({width:1280,height:1000});await pref(p,"en","light");await p.goto(base+route);await p.getByTestId(screen==="comparison"?"page-comparison":screen==="quality"?"page-quality":"page-runs").waitFor();
  await visible(p,trigger).waitFor({timeout:15000});await p.evaluate(()=>document.activeElement?.blur());const controls=await focusMetrics(p,screen);
  const failed=controls.filter(x=>!x.ring||!x.focusVisible);record(`${screen} keyboard focus rings measured`,controls.length>0&&failed.length===0,{total:controls.length,failed:failed.map(x=>({testId:x.testId,tag:x.tag,label:x.label,focusVisible:x.focusVisible,outline:x.outline,boxShadow:x.boxShadow}))});
  const small=controls.filter(x=>x.targetW<44||x.targetH<44);record(`${screen} interactive touch targets >=44px`,small.length===0,{total:controls.length,small:small.map(x=>({testId:x.testId,tag:x.tag,targetTag:x.targetTag,width:x.targetW,height:x.targetH}))});
  if(screen==="runs"){const links=await p.locator('aside.sticky a[data-testid^="link-nav-"]').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {text:e.innerText.trim(),testId:e.getAttribute("data-testid"),width:Math.round(r.width),height:Math.round(r.height)}}));record("desktop sidebar touch targets measured",links.length>0&&links.every(x=>x.width>=44&&x.height>=44),links);}
  await p.goto(base+route);
  await openDrawer(p,trigger);const ds=await focusMetrics(p,`${screen}-drawer`);const bad=ds.filter(x=>!x.ring||!x.focusVisible);record(`${screen} drawer keyboard focus rings measured`,ds.length>0&&bad.length===0,{total:ds.length,failed:bad.map(x=>({testId:x.testId,label:x.label,focusVisible:x.focusVisible,outline:x.outline,boxShadow:x.boxShadow}))});const smallDrawer=ds.filter(x=>x.targetW<44||x.targetH<44);record(`${screen} drawer interactive targets >=44px`,smallDrawer.length===0,{total:ds.length,small:smallDrawer.map(x=>({testId:x.testId,targetTag:x.targetTag,width:x.targetW,height:x.targetH}))});await closeDrawer(p);
 }
 // Skip link gets keyboard focus and is measured directly (not BODY).
 await p.goto(base+"/runs");await p.getByTestId("page-runs").waitFor();await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press("Tab");
 const skip=await p.evaluate(()=>{const e=document.activeElement,c=e&&getComputedStyle(e),r=e?.getBoundingClientRect();return {text:e?.innerText?.trim(),href:e?.getAttribute("href"),focusVisible:e?.matches(":focus-visible"),outline:c?`${c.outlineStyle} ${c.outlineWidth}`:null,boxShadow:c?.boxShadow,width:r&&Math.round(r.width),height:r&&Math.round(r.height),ring:!!c&&((c.outlineStyle!=="none"&&parseFloat(c.outlineWidth)>0)||(c.boxShadow!=="none"&&c.boxShadow!==""))};});
 record("focused skip link measured",!!skip.href&&skip.focusVisible&&skip.ring&&skip.width>=44&&skip.height>=44,skip);
 evidence.finishedAt=new Date().toISOString();evidence.summary={screenshots:evidence.screenshots.length,matrix:evidence.matrix.length,focusElements:evidence.focus.length,failed:evidence.errors.length,out};
 await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence.summary));
 await browser.close();if(evidence.errors.length)process.exitCode=1;
})().catch(async e=>{evidence.errors.push(e.stack||String(e));evidence.finishedAt=new Date().toISOString();evidence.summary={failed:evidence.errors.length,out};await fs.mkdir(out,{recursive:true}).catch(()=>{});await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(evidence,null,2)).catch(()=>{});console.error(`Phase 7 browser driver failed; evidence: ${out}`,e.message);await browser?.close().catch(()=>{});process.exitCode=1;});
