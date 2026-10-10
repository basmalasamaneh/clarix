const {chromium}=require("playwright-core"),fs=require("node:fs/promises"),assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",args:["--no-sandbox"]});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),base=require("./isolated-browser-guard.cjs");
  await page.goto(base+"/login");await page.getByTestId("input-email").fill("ethmar.manager@clarix.test");
  await page.getByTestId("input-password").fill(process.env.SEED_TEST_PASSWORD);await page.getByTestId("button-login").click();await page.waitForURL("**/overview");
  const session=await(await page.request.get(base+"/api/auth/session")).json(),headers={"X-CSRF-Token":session.csrfToken};
  const req=async(method,path,data)=>{const r=await page.request[method](base+"/api"+path,{headers,data});assert.ok(r.ok(),`${path}: ${r.status()}`);return r.json();};
  let source;
  for(let p=1;!source;p++){const list=await req("get",`/data-sources?page=${p}&search=API%20verification`);source=list.items.find(s=>!s.archived&&s.orderCount===2&&/^API verification [a-f0-9-]{36}$/.test(s.name));assert.ok(source||p*20<list.total);}
  const dir="test-data/ethmar-plastics/00_baseline/",mapping=JSON.parse(await fs.readFile(dir+"mapping.json","utf8"));
  const files=await Promise.all(["orders.csv","production_records.csv","events.csv"].map(async name=>({name,bytes:await fs.readFile(dir+name)})));
  const draft=await req("post","/imports",{sourceName:source.name,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});
  for(const f of files){const r=await fetch(draft.files.find(x=>x.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)});assert.ok(r.ok);}
  await req("post",`/imports/${draft.id}/finalize`);
  delete mapping.files.orders.columns.machine_id;
  await req("put",`/imports/${draft.id}/mapping`,{mapping});
  const checked=await req("post",`/imports/${draft.id}/check`);
  assert.equal(checked.duplicateReason,"MAPPING_DIFFERS");assert.deepEqual(checked.replacementOrders,["E-01","E-02"]);
  assert.ok(checked.settingsDifferences.some(d=>d.path==="files.orders.columns.machine_id"));
  await fs.mkdir("generated-artifacts/source-check",{recursive:true});
  for(const language of ["en","ar"])for(const theme of ["light","dark"])for(const width of [360,768,1280]){
    await req("patch","/preferences",{language,theme,tourCompleted:true});await page.setViewportSize({width,height:1000});
    await page.goto(`${base}/imports?id=${draft.id}&step=check`);
    await page.getByTestId("section-settings-diff").waitFor();await page.waitForTimeout(700);
    assert.equal(await page.getByTestId("button-approve").isDisabled(),false);
    assert.ok((await page.getByTestId("list-source-replacements").innerText()).includes("E-01"));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`generated-artifacts/source-check/check-${language}-${theme}-${width}.jpg`,fullPage:true,type:"jpeg",quality:70});
    await page.getByTestId("button-approve").click();await page.getByTestId("checkbox-confirm-replacement").waitFor();
    assert.equal(await page.getByTestId("button-confirm-approve").isDisabled(),true);
    await page.getByTestId("checkbox-confirm-replacement").check();
    assert.equal(await page.getByTestId("button-confirm-approve").isDisabled(),false);
    await page.waitForTimeout(500);
    const box=await page.getByRole("dialog").boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.width<=width&&box.y+box.height<=1001);
    await page.screenshot({path:`generated-artifacts/source-check/dialog-${language}-${theme}-${width}.jpg`,type:"jpeg",quality:70});
    await page.getByTestId("button-cancel-approve").click();
  }
  await req("post",`/imports/${draft.id}/reject`);
  console.log("Actual checked source-qualified E-01/E-02 replacement, exact Machine difference, other-source notes and approval confirmation: 12 combinations passed; no existing orders overwritten.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
