require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path");
const {chromium}=require(path.resolve("scripts/node_modules/playwright-core"));
const base=process.env.CLARIX_TEST_BASE_URL;
const out=path.resolve("generated-artifacts/arabic-language",new Date().toISOString().replace(/[:.]/g,"-"));
const evidence={screens:[],missing:[]};let browser;
(async()=>{
 await fs.mkdir(out,{recursive:true});
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",args:["--no-sandbox"],headless:true});
 const ctx=await browser.newContext(),page=await ctx.newPage();
 page.setDefaultTimeout(10000);
 const session=await (await ctx.request.get(base+"/api/auth/session")).json();
 const login=await ctx.request.post(base+"/api/auth/login",{headers:{"X-CSRF-Token":session.csrfToken},data:{email:"ethmar.analyst@clarix.test",password:process.env.SEED_TEST_PASSWORD}});
 if(login.status()!==200)throw Error("Isolated login failed");
 const auth=await login.json(),headers={"X-CSRF-Token":auth.csrfToken};
 const post=async(url,data)=>{const r=await ctx.request.post(base+"/api"+url,{headers,data});if(!r.ok())throw Error(url+" status "+r.status());return r.json()};
 const dir="test-data/ethmar-plastics/00_baseline";
 const files=(await fs.readdir(dir)).filter(n=>n.endsWith(".csv")).map(name=>({name,bytes:require("node:fs").readFileSync(path.join(dir,name))}));
 const draft=await post("/imports",{sourceName:"Arabic screenshots isolated",files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});
 for(const f of files){if(!(await fetch(draft.files.find(x=>x.name===f.name).uploadUrl,{method:"PUT",body:f.bytes})).ok)throw Error("Isolated upload failed");}
 await post(`/imports/${draft.id}/finalize`,{});
 const mapping=JSON.parse(await fs.readFile(path.join(dir,"mapping.json"),"utf8"));
 const codes=await post(`/imports/${draft.id}/event-codes`,{mapping});
 mapping.ignored_event_codes=codes.items.filter(x=>!mapping.event_code_map[x.code]).map(x=>x.code);
 const mr=await ctx.request.put(base+`/api/imports/${draft.id}/mapping`,{headers,data:{mapping}});if(!mr.ok())throw Error("Mapping failed");
 await post(`/imports/${draft.id}/check`,{});
 await post(`/imports/${draft.id}/approve`,{confirmReplacement:true,replacementCount:0,confirmErrors:true});
 const runs=await (await ctx.request.get(base+"/api/runs")).json();
 const a=runs.items.find(r=>r.orderId==="E-01").id,b=runs.items.find(r=>r.orderId==="E-02").id;
 const saved=await post("/snapshots",{a,b,title:"مراجعة اللغة العربية",note:"",figures:{a:{input_kg:"1000",scrap_kg:"55"},b:{scrap_kg:"50"},origin:"تقرير اختباري معزول"}});
 const id=saved.snapshot.id;
 const surfaces=[["comparison",`/comparison?a=${a}&b=${b}`,"page-comparison"],["overview","/overview","page-overview"],["snapshots",`/snapshots/${id}`,"page-snapshot-detail"],["reconciliation",`/snapshots/${id}`,"section-reconciliation-history"]];
 let consecutiveFailures=0;
 for(const width of [360,1280])for(const theme of ["light","dark"]){
  const prefs=await ctx.request.patch(base+"/api/preferences",{headers,data:{language:"ar",theme,tourCompleted:true}});if(!prefs.ok())throw Error("Preferences failed");
  await page.setViewportSize({width,height:900});
  for(const [surface,route,ready] of surfaces){
   const name=`${surface}-${width}-${theme}`,item={surface,width,theme};
   if(consecutiveFailures>=3){evidence.missing.push({...item,error:"Skipped after three consecutive browser failures"});continue;}
   try{
    await page.goto(base+route,{waitUntil:"domcontentloaded",timeout:45000});
    await page.getByTestId(ready).waitFor();
    if(surface==="snapshots"||surface==="reconciliation")await page.getByTestId("list-reconciliations").waitFor();
    await page.getByTestId(ready).scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    item.dom=await page.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dark:document.documentElement.classList.contains("dark"),wide:[...document.querySelectorAll("main *")].map(e=>({tag:e.tagName,id:e.getAttribute("data-testid"),cls:e.className,w:e.getBoundingClientRect().width,scroll:e.scrollWidth})).filter(e=>e.w>innerWidth||e.scroll>innerWidth).slice(-18)}));
    await page.screenshot({path:path.join(out,name+".png"),timeout:12000});
    item.file=name+".png";evidence.screens.push(item);consecutiveFailures=0;
   }catch(e){consecutiveFailures++;evidence.missing.push({...item,error:String(e.message).split("\n")[0]});}
   await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(evidence,null,2));
  }
 }
 await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({screens:evidence.screens.length,missing:evidence.missing.length,out}));
})().catch(e=>{console.error(String(e.message).replace(/https?:\/\/\S+/g,"[url]"));process.exitCode=1;}).finally(async()=>{await browser?.close();});
