const {chromium}=require("playwright-core");
const fs=require("node:fs/promises");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),base=require("./isolated-browser-guard.cjs");
  await page.goto(base+"/login");await page.getByTestId("input-email").fill("ethmar.analyst@clarix.test");
  await page.getByTestId("input-password").fill(process.env.SEED_TEST_PASSWORD);await page.getByTestId("button-login").click();await page.waitForURL("**/overview");
  const session=await(await page.request.get(base+"/api/auth/session")).json(),headers={"X-CSRF-Token":session.csrfToken};
  const request=async(method,path,data)=>{
    const r=await page.request[method](base+"/api"+path,{headers,data});assert.ok(r.ok(),`${method} ${path}: ${r.status()}`);return r.json();
  };
  let found=[];
  for(let p=1;p<=30;p++){
    const list=await request("get",`/imports?page=${p}`);found.push(...list.items);
    if(found.some(i=>i.sourceName.startsWith("browser-")&&i.status==="checked"&&i.duplicateReason==="MAPPING_DIFFERS"))break;
  }
  const b=found.find(i=>i.sourceName.startsWith("browser-")&&i.status==="checked"&&i.duplicateReason==="MAPPING_DIFFERS");assert.ok(b);
  const folder="generated-artifacts/import-verification";await fs.mkdir(folder,{recursive:true});
  async function matrix(id,state,testid){
    for(const language of ["en","ar"])for(const theme of ["light","dark"])for(const width of [360,768,1280]){
      await request("patch","/preferences",{language,theme,tourCompleted:true});await page.setViewportSize({width,height:1000});
      await page.goto(`${base}/imports?id=${id}&step=check`);await page.getByTestId(testid).waitFor();
      await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:`${folder}/${state}-${language}-${theme}-${width}.jpg`,fullPage:true,type:"jpeg",quality:60});
    }
  }
  async function approve(id){
    await page.goto(`${base}/imports?id=${id}&step=check`);
    await page.getByTestId("button-approve").click();await page.getByTestId("button-confirm-approve").waitFor();
    for(const key of ["checkbox-confirm-errors","checkbox-confirm-replacement"])if(await page.getByTestId(key).count())await page.getByTestId(key).check();
    await page.getByTestId("button-confirm-approve").click();await page.getByTestId("banner-approved").waitFor();
    assert.equal(await page.getByTestId("button-approve").count(),0);
  }
  await matrix(b.id,"duplicate-differs","banner-duplicate-differs");await approve(b.id);
  // Create versions from the same fixed CSV bytes; only synthetic order IDs change.
  const fixture="test-data/ethmar-plastics/07_missing_scrap_value/";
  const mapping=JSON.parse(await fs.readFile(fixture+"mapping.json","utf8"));
  const bytes=await Promise.all(["orders.csv","production_records.csv","events.csv"].map(async name=>({name,bytes:Buffer.from((await fs.readFile(fixture+name,"utf8")).replaceAll("E-01",b.sourceName+"-1").replaceAll("E-02",b.sourceName+"-2"))})));
  async function version(suffix){
    const files=bytes.map(f=>({...f,bytes:Buffer.concat([f.bytes,Buffer.from(suffix)])}));
    const draft=await request("post","/imports",{sourceName:b.sourceName,files:files.map(f=>({name:f.name,size:f.bytes.length,mime:"text/csv"}))});
    for(const f of files){const res=await fetch(draft.files.find(x=>x.name===f.name).uploadUrl,{method:"PUT",body:new Uint8Array(f.bytes)});assert.ok(res.ok);}
    await request("post",`/imports/${draft.id}/finalize`);
    await request("put",`/imports/${draft.id}/mapping`,{mapping});
    return request("post",`/imports/${draft.id}/check`);
  }
  const a=await version("");assert.equal(a.duplicateOf,null);await approve(a.id);
  await matrix(a.id,"approved-final","text-replaced-past");
  const c=await version("\n");await approve(c.id);
  const old=await version("");assert.equal(old.duplicateReason,"FULLY_SUPERSEDED");
  await matrix(old.id,"duplicate-superseded","banner-duplicate-superseded");await approve(old.id);
  console.log("Changed mapping -> approve -> original mapping A again -> different file version -> fully superseded A again: browser passed. Three states x all 12 viewport/language/theme combinations.");
 }finally{await browser.close();}
})().catch(e=>{console.error(String(e.message).split("\n")[0]);process.exitCode=1;});
