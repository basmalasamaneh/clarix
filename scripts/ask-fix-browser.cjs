const base=require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require(path.resolve("scripts/node_modules/playwright-core"));
const out=path.resolve("generated-artifacts/ask-fix/browser");
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 const ctx=await browser.newContext(),page=await ctx.newPage();
 const guest=await(await ctx.request.get(base+"/api/auth/session")).json();
 const login=await ctx.request.post(base+"/api/auth/login",{headers:{"X-CSRF-Token":guest.csrfToken},data:{email:"ethmar.manager@clarix.test",password:process.env.SEED_TEST_PASSWORD}});
 assert.equal(login.status(),200);const session=await login.json(),headers={"X-CSRF-Token":session.csrfToken};
 const put=await ctx.request.put(base+"/api/ai/consent",{headers,data:{enabled:true,version:2,confirmed:true}});assert.equal(put.status(),200);
 const runs=await(await ctx.request.get(base+"/api/runs")).json();assert.ok(runs.items.length>=2);
 const screens=[],checks=[];
 try{
 for(const width of [360,768,1280])for(const language of ["en","ar"])for(const theme of ["light","dark"]){
  await ctx.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}});
  await page.setViewportSize({width,height:900});
  for(const route of ["/overview","/quality",`/comparison?a=${runs.items[0].id}&b=${runs.items[1].id}`]){
   await page.goto(base+route);const input=page.getByTestId("input-ask");await input.waitFor();
   await input.fill(language==="ar"?"شو نسبة الهدر":"scrap rate");
   await page.getByTestId("button-ask-submit").click();
   await page.getByTestId("ask-status-unsupported").waitFor();
   assert.equal(await page.getByTestId("ask-status-unsupported").locator("p").count(),1);
   const suggestions=page.locator('[data-testid^="ask-suggestion-"]');assert.ok(await suggestions.count()>0);
   await page.getByTestId("ask-suggestions").scrollIntoViewIfNeeded();
   const name=`${route.split("?")[0].slice(1)}-${width}-${language}-${theme}`;
   await page.screenshot({path:path.join(out,name+".png")});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+" no overflow");
   assert.equal(await page.getByTestId("ask-status-unsupported").evaluate(e=>e.scrollHeight>e.clientHeight+1),false);
   await suggestions.first().click();await page.locator('[data-testid="ask-result"][data-status="code"]').waitFor();
   assert.ok(await page.getByTestId("ask-block-text-0").textContent());
   screens.push(name);checks.push({name,singleMessage:true,realRunSuggestion:true,codeAnswer:true});
  }
 }
 await fs.writeFile(path.join(out,"evidence.json"),JSON.stringify({status:"PASS",screens,checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
