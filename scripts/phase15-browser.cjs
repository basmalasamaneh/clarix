const base=require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require(path.resolve("scripts/node_modules/playwright-core"));
const out=path.resolve("generated-artifacts/phase15",new Date().toISOString().replace(/[:.]/g,"-"));
const evidence={screens:[],failures:[],pdfs:[]};let browser,ctx,page,headers;
async function post(url,data){const r=await ctx.request.post(base+"/api"+url,{headers,data});assert.equal(r.status(),200,`${url}: ${r.status()}`);return r.json()}
async function create(url,data){const r=await ctx.request.post(base+"/api"+url,{headers,data});assert.equal(r.status(),201,`${url}: ${r.status()}`);return r.json()}
async function upload(folder,replacementCount=0){
 const dir=path.resolve("test-data",folder),files=(await fs.readdir(dir)).filter(n=>n.endsWith(".csv")).map(name=>({name,bytes:require("node:fs").readFileSync(path.join(dir,name))}));
 const draft=await create("/imports",{sourceName:"Report verification",files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});
 for(const f of files)assert.ok((await fetch(draft.files.find(x=>x.name===f.name).uploadUrl,{method:"PUT",body:f.bytes})).ok);
 await post(`/imports/${draft.id}/finalize`,{});
 const mapping=JSON.parse(await fs.readFile(path.join(dir,"mapping.json"),"utf8")),codes=await post(`/imports/${draft.id}/event-codes`,{mapping});
 mapping.ignored_event_codes=codes.items.filter(x=>!mapping.event_code_map[x.code]).map(x=>x.code);
 assert.equal((await ctx.request.put(base+`/api/imports/${draft.id}/mapping`,{headers,data:{mapping}})).status(),200);
 await post(`/imports/${draft.id}/check`,{});
 await post(`/imports/${draft.id}/approve`,{confirmReplacement:true,replacementCount,confirmErrors:true});
}
async function saveEvidence(){await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(evidence,null,2))}
async function pdf(id,language,name){
 await page.goto(base+`/snapshots/${id}`,{waitUntil:"domcontentloaded"});
 await page.getByTestId(`radio-report-language-${language}`).click();
 const response=page.waitForResponse(r=>r.url().endsWith(`/api/snapshots/${id}/report`)&&r.request().method()==="POST");
 await page.getByTestId("button-download-pdf").click();
 const res=await response;assert.equal(res.status(),200);
 const report=await res.json();
 await page.getByTestId("state-report-ready").waitFor();
 const html=await page.getByTestId("frame-report-print").evaluate(f=>f.contentDocument.documentElement.outerHTML);
 const document={html,filename:report.filename};
 await page.getByTestId("button-report-close").click();
 assert.ok(document.html.includes("data:font/")||document.html.includes("data:application/"));
 const sheet=await ctx.newPage();
 try{
  await sheet.setContent(document.html,{waitUntil:"load"});
  await sheet.evaluate(async()=>{await document.fonts.ready;await document.fonts.load("16px 'Clarix Plex Arabic'","عربي");});
  const expected=[...report.comparison.a.metrics,...report.comparison.b.metrics,...report.comparison.differences]
   .filter(m=>m.display!=null).flatMap(m=>[m.display,...(m.hours!=null?[m.hours]:[])])
   .map(s=>s.replace(/^-/,"−"));
  await sheet.pdf({path:path.join(out,name+".pdf"),format:"A4",printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
  await fs.writeFile(path.join(out,name+".expected.json"),JSON.stringify([...new Set(expected)]));
  await fs.writeFile(path.join(out,name+".html"),document.html);
  const body=await sheet.locator("body").innerText();
  assert.ok(!body.includes(report.comparison.a.id),"Internal run ID excluded");
  assert.ok(!body.includes(report.reconciliations[0]?.id||"__none__"),"Internal reconciliation ID excluded");
  if(name.startsWith("injection")){assert.ok(body.includes("'=Baseline <script>"));assert.ok(body.includes("'@Reference"));assert.equal(await sheet.locator("script").count(),0);}
  evidence.pdfs.push({name,language,filename:document.filename,expected:[...new Set(expected)]});await saveEvidence();
 }finally{await sheet.close();}
 return report;
}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 ctx=await browser.newContext();page=await ctx.newPage();page.setDefaultTimeout(15000);
 const guest=await (await ctx.request.get(base+"/api/auth/session")).json();
 const auth=await ctx.request.post(base+"/api/auth/login",{headers:{"X-CSRF-Token":guest.csrfToken},data:{email:"ethmar.analyst@clarix.test",password:process.env.SEED_TEST_PASSWORD}});
 assert.equal(auth.status(),200);headers={"X-CSRF-Token":(await auth.json()).csrfToken};
 await ctx.request.patch(base+"/api/preferences",{headers,data:{language:"en",theme:"light",tourCompleted:true}});
 await upload("ethmar-plastics/00_baseline");
 const runs=(await (await ctx.request.get(base+"/api/runs")).json()).items;
 const a=runs.find(r=>r.orderId==="E-01").id,b=runs.find(r=>r.orderId==="E-02").id;
 const saved=await create("/snapshots",{a,b,title:"Baseline production review",note:"Frozen approved figures",
   figures:{a:{input_kg:"1000",scrap_kg:"50"},b:{scrap_kg:"100",downtime_min:"45"},origin:"Factory report"}});
 const id=saved.snapshot.id;
 await page.goto(base+`/snapshots/${id}`,{waitUntil:"domcontentloaded"});
 await page.getByTestId("button-download-pdf").waitFor();
 await page.getByTestId("button-download-pdf").click();
 await page.getByTestId("state-report-ready").waitFor();
 assert.equal(await page.getByTestId("frame-report-print").count(),1);evidence.uiExportReady=true;
 await page.getByTestId("button-report-close").click();
 assert.equal(await page.getByTestId("frame-report-print").count(),0);
 const en=await pdf(id,"en","clarix-baseline-en");await pdf(id,"ar","clarix-baseline-ar");
 const injected=await create("/snapshots",{a,b,title:"=Baseline <script>alert(1)</script>",note:"@Reference",
   figures:{a:{input_kg:"1000"},b:{},origin:"-Untrusted reason"}});
 await pdf(injected.snapshot.id,"en","injection-en");
 const folder=(await fs.readdir("test-data/ethmar-plastics")).find(n=>n.startsWith("07_"));
 await upload("ethmar-plastics/"+folder,2);
 const frozen=await pdf(id,"en","clarix-superseded-en");
 assert.deepEqual(frozen.comparison,en.comparison);evidence.frozenAfterReplacement=true;
 const blocked=await create("/snapshots",{a,b,title:"Blocked group review",note:"",
   figures:{a:{input_kg:"1000"},b:{input_kg:"1000",scrap_kg:"100"},origin:"Report"}});
 await pdf(blocked.snapshot.id,"en","clarix-blocked-en");await pdf(blocked.snapshot.id,"ar","clarix-blocked-ar");
 const s05=(await fs.readdir("test-data/ethmar-plastics")).find(n=>n.startsWith("05_"));
 await upload("ethmar-plastics/"+s05,2);
 const blocked05=await create("/snapshots",{a,b,title:"Blocked volume, retained table values",note:"",figures:{a:{},b:{},origin:""}});
 await pdf(blocked05.snapshot.id,"en","clarix-blocked05-en");
 for(const width of [360,768,1280])for(const language of ["en","ar"])for(const theme of ["light","dark"]){
  assert.equal((await ctx.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}})).status(),200);
  await page.setViewportSize({width,height:900});
  for(const [surface,route,ready] of [["export",`/snapshots/${id}`,"section-report-export"],["help","/help","card-help-reports"]]){
   const item={surface,width,language,theme};
   try{
    await page.goto(base+route,{waitUntil:"domcontentloaded"});await page.getByTestId(ready).waitFor();
    await page.getByTestId(ready).scrollIntoViewIfNeeded();await page.waitForTimeout(200);
    item.dom=await page.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,dark:document.documentElement.classList.contains("dark"),width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    item.file=`${surface}-${width}-${language}-${theme}.png`;await page.screenshot({path:path.join(out,item.file)});
    assert.equal(item.dom.width,item.dom.scrollWidth);assert.equal(item.dom.lang,language);assert.equal(item.dom.dark,theme==="dark");
    evidence.screens.push(item);
   }catch(e){evidence.failures.push({...item,error:String(e.message).split("\n")[0]});}
   await saveEvidence();
  }
 }
 await page.setViewportSize({width:360,height:900});
 await page.goto(base+`/snapshots/${id}`,{waitUntil:"domcontentloaded"});
 await page.route("**/api/snapshots/*/report",async route=>{
  await new Promise(r=>setTimeout(r,1200));
  await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"REPORT_TIMEOUT"})});
 });
 await page.getByTestId("button-download-pdf").click();
 await page.getByTestId("state-report-loading").waitFor();await page.getByTestId("section-report-export").scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(out,"loading-ar-dark-360.png")});
 await page.getByTestId("state-report-error").waitFor();
 await page.screenshot({path:path.join(out,"error-ar-dark-360.png")});
 evidence.simulatedTimeoutStates=true;await saveEvidence();
 console.log(JSON.stringify({out,pdfs:evidence.pdfs.length,screens:evidence.screens.length,failures:evidence.failures.length}));
})().catch(async e=>{evidence.failures.push({fatal:String(e.message).replace(/https?:\/\/\S+/g,"[url]")});await saveEvidence();console.error(evidence.failures.at(-1));process.exitCode=1;}).finally(async()=>browser?.close());
