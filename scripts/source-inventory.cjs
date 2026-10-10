const {request}=require("playwright-core");
const fs=require("node:fs/promises");
const assert=require("node:assert/strict");
(async()=>{
 const api=await request.newContext({baseURL:"http://localhost:80"});
 try{
  const session=await(await api.get("/api/auth/session")).json();
  const response=await api.post("/api/auth/login",{headers:{"X-CSRF-Token":session.csrfToken},data:{email:"ethmar.manager@clarix.test",password:process.env.SEED_TEST_PASSWORD}});
  assert.ok(response.ok(),"Manager sign-in failed");
  const identity=await response.json(),headers={"X-CSRF-Token":identity.csrfToken};
  const target="API verification 87ae3e4a-b5e2-4aeb-8503-d0f342b06973";
  if(process.env.ARCHIVE_BASELINE==="1"){
    const archived=await api.patch("/api/data-sources/archive",{headers,data:{sourceName:target,archived:true}});
    assert.ok(archived.ok(),"Archive failed");
  }
  const rows=[];
  for(let page=1;;page++){
    const r=await api.get("/api/data-sources?page="+page);assert.ok(r.ok());
    const result=await r.json();rows.push(...result.items);if(rows.length>=result.total)break;
  }
  assert.equal(rows.find(r=>r.name===target)?.archived,true);
  const cell=x=>'"'+String(x??"").replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
  const csv=["Data source,Status,Current visible orders,Stored orders,Last approval",...rows.map(r=>[r.name,r.archived?"Archived":"Active",r.orderCount,r.storedOrderCount,r.lastApprovedAt].map(cell).join(","))].join("\n");
  await fs.mkdir("generated-artifacts/sources",{recursive:true});await fs.writeFile("generated-artifacts/sources/source-inventory.csv",csv);
  console.log(JSON.stringify({archivedSource:target,sources:rows.length,active:rows.filter(r=>!r.archived).length,archived:rows.filter(r=>r.archived).length,activeWithOrders:rows.filter(r=>!r.archived&&r.orderCount>0).length}));
 }finally{await api.dispose();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
