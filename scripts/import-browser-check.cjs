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
  await page.getByTestId("input-email").waitFor({timeout:10000}).catch(()=>{});
  if (await page.getByTestId("input-email").count()) {
   await page.getByTestId("input-email").fill("ethmar.analyst@clarix.test");
   await page.getByTestId("input-password").fill(process.env.SEED_TEST_PASSWORD);
   await page.getByTestId("button-login").click();
   await page.waitForURL("**/overview");
  }
  // Use authenticated browser requests to select existing checked test data.
  const session=await (await page.request.get(base+"/api/auth/session")).json();
  const headers={"X-CSRF-Token":session.csrfToken};
  await page.request.patch(base+"/api/preferences",{headers,data:{language:"en",theme:"light",tourCompleted:true}});
  const fixture="test-data/ethmar-plastics/07_missing_scrap_value/";
  const mapping=JSON.parse(await fs.readFile(fixture+"mapping.json","utf8"));
  const label="browser-"+Date.now();
  await page.goto(base+"/imports?id=new");
  console.log("new import route:",page.url(),"source field count:",await page.getByTestId("input-source-name").count(),"page text:",(await page.locator("body").innerText()).slice(0,900));
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
  await page.getByTestId("select-code-choice-0").waitFor();
  await page.getByTestId("select-code-choice-0").selectOption("");
  assert.ok(await page.getByTestId("button-save-and-check").isDisabled(),"missing choice blocks step3");
  await page.getByTestId("select-code-choice-0").selectOption("IGNORE");
  await page.getByTestId("select-code-choice-1").selectOption("UNPLANNED_DOWNTIME");
  await page.getByTestId("step-upload").click();
  await page.getByTestId("step-map").click();
  assert.equal(await page.getByTestId("select-code-choice-0").inputValue(),"IGNORE","back navigation preserves edits");
  await page.getByTestId("button-save-and-check").click();
  await page.getByTestId("button-approve").waitFor({timeout:30000});
  const checkedText=await page.locator("body").innerText();
  assert.ok(checkedText.includes("set to be ignored"));
  assert.ok(checkedText.includes("Map the codes to see its changeover"));
  assert.match(checkedText,/excluded rows/i);
  assert.match(checkedText,/ethmar|analyst/i);
  assert.match(checkedText,/\b\d{1,2}:\d{2}\b|\b20\d{2}\b/,"IGNORE audit timestamp visible");
  assert.ok(Number(await page.getByTestId("count-error").innerText())>0,"scenario07 missing scrap produces an error");
  const hintRow=page.locator('[data-testid^="row-issue-"]').filter({hasText:"NO_CHANGEOVER_EVENT"}).first();
  const hintRowId=await hintRow.getAttribute("data-testid");
  await page.getByTestId(`button-jump-${hintRowId.split("-").at(-1)}`).click();
  await page.getByTestId("section-event-codes").waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),"section-event-codes","issue jump focuses event-code mapping");
  await page.getByTestId("step-check").click();
  await page.getByTestId("button-approve").waitFor();
  await page.getByTestId("button-change-settings").click();
  await page.getByTestId("select-code-choice-0").selectOption("CHANGEOVER");
  await page.getByTestId("button-open-save-template").click();
  await page.getByTestId("input-template-name").fill(label);
  await page.getByTestId("button-confirm-template").click();
  await page.getByTestId("button-confirm-template").waitFor({state:"hidden"});
  await page.getByTestId("button-save-and-check").click();
  await page.getByTestId("button-approve").waitFor({timeout:30000});
  await page.reload();
  const testedId=new URL(page.url()).searchParams.get("id");
  await fs.mkdir("generated-artifacts/import-verification",{recursive:true});
  for(const language of ["en","ar"]) for(const theme of ["light","dark"]) for(const width of [360,768,1280]) {
    await page.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}});
    await page.setViewportSize({width,height:1000});
    await page.goto(`${base}/imports?id=${testedId}&step=map`);
    await page.getByTestId("select-code-choice-0").waitFor();
    await page.screenshot({path:`generated-artifacts/import-verification/changed-map-${language}-${theme}-${width}.jpg`,fullPage:true,type:"jpeg",quality:55});
    await page.goto(`${base}/imports?id=${testedId}&step=check`);
    await page.getByTestId("button-approve").waitFor();
    assert.equal(await page.locator('[data-testid^="row-issue-"]').filter({hasText:"UNMAPPED_EVENT_CODE"}).count(),0,"recheck refreshes resolved unmapped warning");
    await page.screenshot({path:`generated-artifacts/import-verification/changed-check-${language}-${theme}-${width}.jpg`,fullPage:true,type:"jpeg",quality:55});
    await page.getByTestId("button-approve").click();
    assert.ok(await page.getByTestId("checkbox-confirm-errors").isVisible(),"scenario07 approval requires error confirmation");
    assert.ok(await page.getByTestId("button-confirm-approve").isDisabled(),"approval is disabled before error confirmation");
    await page.waitForTimeout(350);
    const box=await page.getByRole("dialog").boundingBox();
    assert.ok(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=1000,"dialog stays within viewport");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`generated-artifacts/import-verification/approve-${language}-${theme}-${width}.jpg`,type:"jpeg",quality:60});
  }
  await page.getByTestId("checkbox-confirm-errors").check();
  await page.getByTestId("button-confirm-approve").click();
  await page.getByTestId("banner-approved").waitFor();
  assert.match(await page.getByTestId("text-replaced-past").innerText(),/approved|replaced|no orders|already|استبدل|يُستبدل/i);
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
  // A second import with the same current orders/settings must show the blocking duplicate banner.
  await page.goto(base+"/imports?id=new");
  await page.getByTestId("input-source-name").fill(label);
  const duplicateFiles=await Promise.all(["orders.csv","production_records.csv","events.csv"].map(async name=>({
    name,mimeType:"text/csv",buffer:Buffer.from((await fs.readFile(fixture+name,"utf8")).replaceAll("E-01",label+"-1").replaceAll("E-02",label+"-2")),
  })));
  await page.getByTestId("input-files").setInputFiles(duplicateFiles);
  await page.getByTestId("button-start-upload").click();
  await page.getByTestId("button-continue-map").waitFor({timeout:30000});
  await page.getByTestId("button-continue-map").click();
  for(const [role,spec] of Object.entries(mapping.files)) for(const [field,col] of Object.entries(spec.columns)) {
    const el=page.getByTestId(`select-col-${role}-${field}`);if(await el.count()) await el.selectOption(col);
  }
  await page.getByTestId("select-code-choice-0").selectOption("CHANGEOVER");
  await page.getByTestId("select-code-choice-1").selectOption("UNPLANNED_DOWNTIME");
  await page.getByTestId("button-save-and-check").click();
  await page.getByTestId("button-approve").waitFor({timeout:30000});
  const dupId=new URL(page.url()).searchParams.get("id");
  const dupDetail=await (await page.request.get(`${base}/api/imports/${dupId}`)).json();
  console.log("duplicate state:",JSON.stringify({reason:dupDetail.duplicateReason,duplicateOf:dupDetail.duplicateOf,status:dupDetail.status}));
  assert.ok(await page.getByTestId("banner-duplicate-same").isVisible(),"same-current-mapping duplicate banner visible");
  assert.ok(await page.getByTestId("button-approve").isDisabled(),"same-current-mapping approval blocked");
  for(const language of ["en","ar"]) for(const theme of ["light","dark"]) for(const width of [360,768,1280]) {
    await page.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}});
    await page.setViewportSize({width,height:1000});
    await page.goto(`${base}/imports?id=${dupId}&step=check`);
    await page.getByTestId("banner-duplicate-same").waitFor();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false,`duplicate banner overflows at ${width}`);
    await page.screenshot({path:`generated-artifacts/import-verification/duplicate-${language}-${theme}-${width}.jpg`,fullPage:true,type:"jpeg",quality:55});
  }
  // Identical files with a changed event mapping remain approvable and get the changed-settings banner.
  await page.goto(base+"/imports?id=new");
  await page.getByTestId("input-source-name").fill(label);
  await page.getByTestId("input-files").setInputFiles(duplicateFiles);
  await page.getByTestId("button-start-upload").click();
  await page.getByTestId("button-continue-map").waitFor({timeout:30000});
  await page.getByTestId("button-continue-map").click();
  for(const [role,spec] of Object.entries(mapping.files)) for(const [field,col] of Object.entries(spec.columns)) {
    const el=page.getByTestId(`select-col-${role}-${field}`);if(await el.count()) await el.selectOption(col);
  }
  await page.getByTestId("select-code-choice-0").selectOption("IGNORE");
  await page.getByTestId("select-code-choice-1").selectOption("UNPLANNED_DOWNTIME");
  await page.getByTestId("button-save-and-check").click();
  await page.getByTestId("button-approve").waitFor({timeout:30000});
  const changedId=new URL(page.url()).searchParams.get("id");
  const changedDetail=await (await page.request.get(`${base}/api/imports/${changedId}`)).json();
  console.log("changed-mapping state:",JSON.stringify({reason:changedDetail.duplicateReason,duplicateOf:changedDetail.duplicateOf,codes:changedDetail.mapping?.codes}));
  await page.getByTestId("banner-duplicate-differs").waitFor();
  assert.equal(await page.getByTestId("button-approve").isDisabled(),false,"changed mapping remains approvable");
  for(const language of ["en","ar"]) for(const theme of ["light","dark"]) for(const width of [360,768,1280]) {
    await page.request.patch(base+"/api/preferences",{headers,data:{language,theme,tourCompleted:true}});
    await page.setViewportSize({width,height:1000});
    await page.goto(`${base}/imports?id=${changedId}&step=check`);
    await page.getByTestId("banner-duplicate-differs").waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`changed-mapping banner overflows at ${width}`);
    await page.screenshot({path:`generated-artifacts/import-verification/duplicate-differs-${language}-${theme}-${width}.jpg`,fullPage:true,type:"jpeg",quality:55});
  }
 } finally {await browser.close();}
 })().catch(e=>{console.error("Browser verification failed: "+String(e.message).split("\n").slice(0,8).join(" "));process.exitCode=1;});
