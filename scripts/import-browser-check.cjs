// Local browser verification: secret stays in the workspace process, never logs.
const {chromium}=require("playwright-core");
const fs=require("node:fs/promises");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const base="http://localhost:80";
  await page.goto(base+"/login");
  await page.getByTestId("input-email").fill("ethmar.analyst@clarix.test");
  await page.getByTestId("input-password").fill(process.env.SEED_TEST_PASSWORD);
  await page.getByTestId("button-login").click();
  await page.waitForURL("**/overview");
  // Use authenticated browser requests to select existing checked test data.
  const session=await (await page.request.get(base+"/api/auth/session")).json();
  const headers={"X-CSRF-Token":session.csrfToken};
  await page.request.patch(base+"/api/preferences",{headers,data:{language:"en",theme:"light",tourCompleted:true}});
  const fixture="test-data/ethmar-plastics/00_baseline/";
  const mapping=JSON.parse(await fs.readFile(fixture+"mapping.json","utf8"));
  const label="browser-"+Date.now();
  await page.goto(base+"/imports?id=new");
  await page.getByTestId("input-source-name").fill(label);
  const uploadFiles=await Promise.all(["orders.csv","production_records.csv","events.csv"].map(async name=>({
    name,mimeType:"text/csv",buffer:Buffer.from((await fs.readFile(fixture+name,"utf8")).replaceAll("E-01",label+"-1").replaceAll("E-02",label+"-2")),
  })));
  await page.getByTestId("input-files").setInputFiles(uploadFiles);
  await page.getByTestId("button-start-upload").click();
  await page.getByTestId("button-continue-map").waitFor({timeout:30000});
  await page.getByTestId("button-continue-map").click();
  for(const [role,spec] of Object.entries(mapping.files)) for(const [field,col] of Object.entries(spec.columns)) {
    const el=page.getByTestId(`select-col-${role}-${field}`);
    if(await el.count()) await el.selectOption(col);
  }
  for(const [i,[code,type]] of Object.entries(mapping.event_code_map).entries()) {
    await page.getByTestId("button-add-code").click();
    await page.getByTestId(`input-code-${i}`).fill(code);
    await page.getByTestId(`select-code-type-${i}`).selectOption(type);
  }
  await page.getByTestId("step-upload").click();
  await page.getByTestId("step-map").click();
  assert.equal(await page.getByTestId("input-code-0").inputValue(),Object.keys(mapping.event_code_map)[0],"back navigation preserves edits");
  await page.getByTestId("button-open-save-template").click();
  await page.getByTestId("input-template-name").fill(label);
  await page.getByTestId("button-confirm-template").click();
  await page.getByTestId("button-confirm-template").waitFor({state:"hidden"});
  await page.getByTestId("button-save-and-check").click();
  await page.getByTestId("button-approve").waitFor({timeout:30000});
  await page.reload();
  await page.getByTestId("button-approve").click();
  await fs.mkdir("generated-artifacts/import-verification",{recursive:true});
  for(const language of ["en","ar"]) for(const theme of ["light","dark"]) for(const width of [360,768,1280]) {
    await page.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}});
    await page.setViewportSize({width,height:1000});
    await page.reload();await page.getByTestId("button-approve").click();
    await page.waitForTimeout(350);
    const box=await page.getByRole("dialog").boundingBox();
    assert.ok(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=1000,"dialog stays within viewport");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`generated-artifacts/import-verification/approve-${language}-${theme}-${width}.jpg`,type:"jpeg",quality:60});
  }
  await page.getByTestId("button-confirm-approve").click();
  await page.getByTestId("banner-approved").waitFor();
  console.log("Actual browser login, upload, mapping, template save, back navigation, check, reload and approval passed.");
  if(process.env.DIALOG_ONLY==="1") return;
  const list=await (await page.request.get(base+"/api/imports")).json();
  const item=list.items.find(x=>x.finalized && x.status==="checked");
  assert.ok(item,"checked import available");
  await fs.mkdir("generated-artifacts/import-verification",{recursive:true});
  const results=[];
  for(const language of ["en","ar"]) for(const theme of ["light","dark"]) for(const width of [360,768,1280]) {
    await page.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}});
    await page.setViewportSize({width,height:1000});
    for(const [screen,path] of [["history","/imports"],["new-upload","/imports?id=new"],["upload",`/imports?id=${item.id}&step=upload`],["map",`/imports?id=${item.id}&step=map`],["check",`/imports?id=${item.id}&step=check`]]) {
      await page.goto(base+path);await page.waitForTimeout(350);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      const errors=await page.locator('[data-testid="state-import-error"]').count();
      assert.equal(errors,0,screen);
      const file=`generated-artifacts/import-verification/${screen}-${language}-${theme}-${width}.jpg`;
      await page.screenshot({path:file,fullPage:true,type:"jpeg",quality:55});
      results.push({screen,language,theme,width,overflow});
    }
  }
  await fs.writeFile("generated-artifacts/import-verification/results.json",JSON.stringify(results,null,2));
  console.log(JSON.stringify({combinations:results.length,overflow:results.filter(r=>r.overflow)}));
 } finally {await browser.close();}
})().catch(e=>{console.error("Browser verification failed: "+String(e.message).split("\n").slice(0,2).join(" "));process.exitCode=1;});
