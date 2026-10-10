require("./isolated-browser-guard.cjs");
const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID,randomBytes}=require("node:crypto"),{chromium}=require("playwright-core");
const base=process.env.CLARIX_TEST_BASE_URL,pw=process.env.SEED_TEST_PASSWORD,stamp=new Date().toISOString().replace(/[:.]/g,"-");
const out=path.resolve(`generated-artifacts/phase8/browser-${process.env.PHASE8_ATTEMPT||stamp}`);
const ev={attempt:path.basename(out),startedAt:new Date().toISOString(),journey:[],matrix:[],bounds:[],focus:[],screenshots:[],errors:[],writesAttempted:false};
let browser,tokenRam=null,inviteEmail=`phase8-${randomUUID()}@example.test`,acceptedPassword=`P8-${randomBytes(18).toString("base64url")}!`,newManagerPassword=`M8-${randomBytes(18).toString("base64url")}!`;
const safe=s=>String(s||"").replace(/\/invite\/[^/?#]+/gi,"/invite/[redacted]").replace(/([?&]token=)[^&#]+/gi,"$1[redacted]").replace(/\b[A-Za-z0-9_-]{40,}\b/g,"[redacted]").slice(0,500);
function rec(name,ok,actual){ev.journey.push({name,status:ok?"PASS":"FAIL",actual});if(!ok)ev.errors.push(`${name}: ${safe(JSON.stringify(actual))}`);}
async function attempt(name,fn){try{const v=await fn();rec(name,!!v,v);return !!v}catch(e){rec(name,false,safe(e.message));return false;}}
const tid=(p,id)=>p.getByTestId(id),shown=(p,id)=>p.locator(`[data-testid="${id}"]:visible`).first();
async function navReady(p,id){await tid(p,id).waitFor({timeout:15000});}
async function login(p,email,password=pw){await p.goto(base+"/login");await tid(p,"input-email").fill(email);await tid(p,"input-password").fill(password);await tid(p,"button-login").click();await tid(p,"link-nav-runs").waitFor({timeout:15000});}
async function session(p){const r=await p.request.get(base+"/api/auth/session");return r.status()===200?r.json():null;}
async function api(p,path){const r=await p.request.get(base+path);return {status:r.status(),body:r.status()===204?null:await r.json().catch(()=>null)};}
async function prefs(p,lang,theme){let cur=(await p.locator("html").getAttribute("lang")||"en").startsWith("ar")?"ar":"en";if(cur!==lang){await shown(p,"button-language").click();await p.waitForFunction(x=>document.documentElement.lang.startsWith(x),lang,{timeout:5000});}
 await shown(p,"button-theme").click();await shown(p,`option-theme-${theme}`).click();await p.waitForFunction(x=>x==="dark"?document.documentElement.classList.contains("dark"):!document.documentElement.classList.contains("dark"),theme,{timeout:5000});}
async function snap(p,tag,masks=[]){await p.screenshot({path:path.join(out,tag+".png"),fullPage:false,mask:masks});ev.screenshots.push(tag+".png");}
async function clickRole(p,testid,memberId,role){await tid(p,testid).click();await tid(p,`option-role-${role}-${memberId}`).click();await tid(p,"dialog-confirm").waitFor();await tid(p,"button-confirm-action").click();await tid(p,"dialog-confirm").waitFor({state:"hidden",timeout:10000});}
async function confirmClick(p,id){await tid(p,id).click();await tid(p,"dialog-confirm").waitFor();await snap(p,`state-${id}-confirmation`);await tid(p,"button-confirm-action").click();await tid(p,"dialog-confirm").waitFor({state:"hidden",timeout:10000});}
async function geometry(p,source){await p.waitForFunction(()=>{const e=document.querySelector('[data-testid="drawer-source"]');return e&&e.getAnimations().every(a=>a.playState!=="running")&&e.querySelector('[data-testid="section-source-value"]')},{},{timeout:15000});
 return p.evaluate(()=>{const e=document.querySelector('[data-testid="drawer-source"]'),r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,viewport:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,side:e.getAttribute("data-side")};});}
async function focusAudit(p,scope){await p.evaluate(()=>document.activeElement?.blur());const n=await p.locator('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[role="button"],[tabindex]:not([tabindex="-1"])').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&!e.closest('[aria-hidden="true"]')).length),seen=new Map();
 for(let i=0;i<n+2;i++){await p.keyboard.press("Tab");const x=await p.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect(),ring=(c.outlineStyle!=="none"&&parseFloat(c.outlineWidth)>0)||(c.boxShadow!=="none"&&c.boxShadow!=="");return {id:e.getAttribute("data-testid"),label:(e.getAttribute("aria-label")||e.innerText||"").trim().slice(0,50),focusVisible:e.matches(":focus-visible"),ring,w:Math.round(r.width),h:Math.round(r.height)};});if(x)seen.set(x.id||x.label,x);}
 const rows=[...seen.values()];ev.focus.push({scope,controls:rows});rec(`${scope} focus rings and 44px targets`,rows.length>0&&rows.every(x=>x.focusVisible&&x.ring&&x.w>=44&&x.h>=44),{total:rows.length,fail:rows.filter(x=>!x.focusVisible||!x.ring||x.w<44||x.h<44)});}
(async()=>{
 await fs.mkdir(out,{recursive:true});if(!pw)throw Error("SEED_TEST_PASSWORD is unavailable inside isolated harness");
 browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox"]});
 const managerCtx=await browser.newContext({viewport:{width:1280,height:900},permissions:["clipboard-read","clipboard-write"]}),m=await managerCtx.newPage();
 await login(m,"ethmar.manager@clarix.test");await navReady(m,"link-nav-members");await m.goto(base+"/members");await navReady(m,"panel-members");await navReady(m,"panel-invitations");await navReady(m,"panel-audit");
 const mr=await api(m,"/api/members"),ir=await api(m,"/api/members/invitations"),ar=await api(m,"/api/members/audit");
 rec("Manager members, pending invitations, audit load",mr.status===200&&ir.status===200&&ar.status===200,{members:mr.body?.total,pending:ir.body?.total,audit:Array.isArray(ar.body)?ar.body.length:null});
 rec("Seeded Ethmar members initially active",mr.status===200&&mr.body.items.length===3&&mr.body.items.every(x=>x.active),{count:mr.body?.items?.length,allActive:mr.body?.items?.every(x=>x.active)});
 let runs=[];for(let page=1;page<100;page++){const batch=await api(m,`/api/runs?page=${page}`);if(batch.status!==200)break;runs.push(...(batch.body.items||[]));if(runs.length>=batch.body.total||!(batch.body.items||[]).length)break;}
 const baselineRuns=runs.filter(x=>x.sourceName?.endsWith("-00_baseline")),r1=baselineRuns.find(x=>x.orderId==="E-01"),r2=baselineRuns.find(x=>x.orderId==="E-02");
 rec("Isolated baseline fixture run IDs discovered from API",!!r1&&!!r2,{found:!!r1&&!!r2,baselineRunCount:baselineRuns.length});
 // Invite creation is a UI action. Keep the plaintext link only in this process.
 await tid(m,"button-invite-member").click();await tid(m,"dialog-invite").waitFor();await tid(m,"input-invite-email").fill(inviteEmail);
 await tid(m,"select-invite-role").click();await tid(m,"option-invite-role-viewer").click();await tid(m,"button-invite-submit").click();await tid(m,"dialog-invite-link").waitFor({timeout:10000});
 const rawLink=await tid(m,"input-invite-link").inputValue();tokenRam=new URL(rawLink).pathname.split("/").pop();
 const invitationRow=(await api(m,"/api/members/invitations")).body.items.find(x=>x.email===inviteEmail);
 let createdPath=rawLink.startsWith(base)?new URL(rawLink).pathname:rawLink;
 rec("UI creates viewer invitation and reveals copyable link once",!!tokenRam&&tokenRam.length>=32&&invitationRow?.role==="viewer"&&!JSON.stringify(invitationRow).includes(tokenRam),{created:!!tokenRam,role:invitationRow?.role,hashedFromList:!!tokenRam&&!JSON.stringify(invitationRow).includes(tokenRam)});
 await snap(m,"illustrative-invite-link-dialog",[tid(m,"input-invite-link")]);
 await tid(m,"button-copy-invite-link").click();await tid(m,"status-copy").waitFor();
 const copyStatus=await tid(m,"status-copy").innerText();
 rec("Invite link copy action reports copied status",!!copyStatus&&!/failed|تعذر/i.test(copyStatus),{copied:!!copyStatus&&!/failed|تعذر/i.test(copyStatus)});
 await tid(m,"button-invite-link-done").click();await tid(m,"dialog-invite-link").waitFor({state:"hidden"});
 const listNow=await api(m,"/api/members/invitations");rec("Pending listing never returns plaintext token",listNow.status===200&&!JSON.stringify(listNow.body).includes(tokenRam),{pending:listNow.body?.total,containsToken:JSON.stringify(listNow.body).includes(tokenRam)});
 // Reissue/revoke lifecycle through the actual manager UI, and no sensitive URL output.
 await tid(m,`button-reissue-invitation-${invitationRow.id}`).click();await tid(m,"dialog-confirm").waitFor();await tid(m,"button-confirm-action").focus();await m.keyboard.press("Enter");await tid(m,"dialog-confirm").waitFor({state:"hidden"});
 await tid(m,"dialog-invite-link").waitFor();const oldToken=tokenRam;const newLink=await tid(m,"input-invite-link").inputValue();tokenRam=new URL(newLink).pathname.split("/").pop();createdPath=new URL(newLink).pathname;
 const oldCheck=await api(m,`/api/auth/invitation?token=${encodeURIComponent(oldToken)}`),newCheck=await api(m,`/api/auth/invitation?token=${encodeURIComponent(tokenRam)}`);
 rec("Reissue invalidates old link and validates new link",oldCheck.status===404&&newCheck.status===200,{oldStatus:oldCheck.status,newStatus:newCheck.status});
 await tid(m,"button-invite-link-done").click();await tid(m,"dialog-invite-link").waitFor({state:"hidden"});
 // Signed-out invite page: bootstrap a fresh session first so acceptance has CSRF ready.
 const inviteCtx=await browser.newContext({viewport:{width:1280,height:900}}),iv=await inviteCtx.newPage();
 await iv.goto(base+"/login");await iv.waitForFunction(async()=>{const r=await fetch("/api/auth/session");return r.ok;},{},{timeout:10000});
 await iv.goto(base+createdPath);await navReady(iv,"text-invite-factory");await navReady(iv,"input-invite-name");
 const detailsText=await iv.locator("body").innerText();rec("Invite page shows factory, role, email and is signed out",detailsText.includes("Ethmar")&&detailsText.includes(inviteEmail)&&detailsText.toLowerCase().includes("viewer")&&!(await tid(iv,"text-invite-signed-in").count()),{factory:detailsText.includes("Ethmar"),email:detailsText.includes(inviteEmail),signedIn:false});
 // Required new-page screenshot matrix, EN/AR × light/dark × 360/768/1280.
 for(const width of [360,768,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"]){
  await iv.setViewportSize({width,height:900});await prefs(iv,lang,theme);await iv.goto(base+createdPath);await navReady(iv,"input-invite-name");
  const sizes=await iv.evaluate(()=>({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,dir:document.documentElement.dir}));
  ev.matrix.push({page:"invite",width,lang,theme,...sizes});rec(`Invite ${width}/${lang}/${theme} no horizontal overflow`,sizes.doc<=width&&sizes.body<=width&&sizes.dir===(lang==="ar"?"rtl":"ltr"),sizes);
  await snap(iv,`invite-${width}-${lang}-${theme}`);
 }
 // Acceptance in separate context with fresh csrf established before password fields.
 await prefs(iv,"en","light");await iv.goto(base+createdPath);await navReady(iv,"input-invite-name");await tid(iv,"input-invite-name").fill("Phase Eight Viewer");
 await tid(iv,"input-invite-password").fill(acceptedPassword);await tid(iv,"input-invite-confirm").fill(acceptedPassword);
 await tid(iv,"button-accept-invite").click();await tid(iv,"link-nav-runs").waitFor({timeout:15000});
 const acceptedSession=await session(iv),acceptedMember=(await api(m,"/api/members")).body.items.find(x=>x.email===inviteEmail);
 rec("Invite acceptance creates viewer membership and signs in",acceptedSession?.user?.email===inviteEmail&&acceptedMember?.role==="viewer"&&acceptedMember?.active,{signedIn:acceptedSession?.user?.email===inviteEmail,role:acceptedMember?.role,active:acceptedMember?.active});
 await iv.goto(base+"/members");await iv.waitForLoadState("domcontentloaded");const memberDenied=await api(iv,"/api/members");rec("Viewer cannot access manager members API",memberDenied.status===403,{status:memberDenied.status});
 await m.goto(base+"/members");await navReady(m,"panel-members");const accepted= (await api(m,"/api/members")).body.items.find(x=>x.email===inviteEmail),mid=accepted.id;
 await clickRole(m,`select-member-role-${mid}`,mid,"analyst");let role1=(await api(m,"/api/members")).body.items.find(x=>x.id===mid)?.role;
 await clickRole(m,`select-member-role-${mid}`,mid,"viewer");let role2=(await api(m,"/api/members")).body.items.find(x=>x.id===mid)?.role;
 rec("Manager changes invited member role viewer→analyst→viewer",role1==="analyst"&&role2==="viewer",{first:role1,second:role2});
 await confirmClick(m,`button-member-deactivate-${mid}`);let inactive=(await api(m,"/api/members")).body.items.find(x=>x.id===mid)?.active;
 const ended=await session(iv);rec("Deactivation immediately ends accepted member session",inactive===false&&ended?.user===null,{inactive,sessionEnded:ended?.user===null});
 await iv.goto(base+"/login");await tid(iv,"input-email").fill(inviteEmail);await tid(iv,"input-password").fill(acceptedPassword);await tid(iv,"button-login").click();await navReady(iv,"status-login-error");const blockedText=await tid(iv,"status-login-error").innerText();
 rec("Deactivated user login is blocked with generic message",!!blockedText,{errorShown:!!blockedText});
 await confirmClick(m,`button-member-reactivate-${mid}`);const reactivated=(await api(m,"/api/members")).body.items.find(x=>x.id===mid)?.active;
 const oldSession=(await session(iv)).user;rec("Reactivation works but prior ended session remains ended",reactivated===true&&oldSession===null,{reactivated,oldSession:oldSession===null});
 await login(iv,inviteEmail,acceptedPassword);rec("Reactivated member can establish a fresh session",(await session(iv)).user?.email===inviteEmail,{signedIn:(await session(iv)).user?.email===inviteEmail});
 // Invite accepted link is now neutral/unavailable, including while authenticated.
 await iv.goto(base+createdPath);await navReady(iv,"state-invite-unavailable");rec("Used invite link gives neutral unavailable state",await tid(iv,"state-invite-unavailable").count()===1,{unavailable:true});
 // Recovery is a manager-led re-invite for the same deactivated account; the user identity must remain stable.
 await confirmClick(m,`button-member-deactivate-${mid}`);const priorSession=await session(iv),deactivatedRequest=await api(iv,"/api/members");
 rec("Deactivation also rejects existing member API session immediately",priorSession?.user===null&&deactivatedRequest.status===401,{sessionEnded:priorSession?.user===null,status:deactivatedRequest.status});
 await tid(m,"button-invite-member").click();await tid(m,"dialog-invite").waitFor();await tid(m,"input-invite-email").fill(inviteEmail);
 await tid(m,"select-invite-role").click();await tid(m,"option-invite-role-viewer").click();await tid(m,"button-invite-submit").click();await tid(m,"dialog-invite-link").waitFor();
 const recoveryLink=await tid(m,"input-invite-link").inputValue(),recoveryPath=new URL(recoveryLink).pathname,recoveryPassword=`R8-${randomBytes(18).toString("base64url")}!`;
 tokenRam=new URL(recoveryLink).pathname.split("/").pop();await snap(m,"illustrative-reinvite-link",[tid(m,"input-invite-link")]);await tid(m,"button-invite-link-done").click();
 const recoveryCtx=await browser.newContext(),rp=await recoveryCtx.newPage();await rp.goto(base+"/login");await rp.waitForFunction(async()=>{const r=await fetch("/api/auth/session");return r.ok;},{},{timeout:10000});
 await rp.goto(base+recoveryPath);await navReady(rp,"input-invite-name");await tid(rp,"input-invite-name").fill("Phase Eight Viewer Recovered");
 await tid(rp,"input-invite-password").fill(recoveryPassword);await tid(rp,"input-invite-confirm").fill(recoveryPassword);await tid(rp,"button-accept-invite").click();await tid(rp,"link-nav-runs").waitFor({timeout:15000});
 const recovered=await session(rp),sameMember=(await api(m,"/api/members")).body.items.find(x=>x.email===inviteEmail);
 rec("Deactivated member can be re-invited with new password and same account identity",priorSession?.user===null&&recovered?.user?.id===mid&&sameMember?.id===mid,{oldSessionEnded:priorSession?.user===null,newSession:recovered?.user?.email===inviteEmail,sameIdentity:sameMember?.id===mid});
 const auditAfter=await api(m,"/api/members/audit"),auditText=JSON.stringify(auditAfter.body);
 rec("Member audit log contains no token/password values",auditAfter.status===200&&!auditText.includes(tokenRam)&&!auditText.includes(acceptedPassword)&&!auditText.includes(recoveryPassword)&&!/"(password|token)"\s*:/i.test(auditText),{status:auditAfter.status,containsSecrets:auditText.includes(tokenRam)||auditText.includes(acceptedPassword)||auditText.includes(recoveryPassword)});
 // Last manager protection should reject self-demotion/deactivation and explain why.
 const manager=(await api(m,"/api/members")).body.items.find(x=>x.email==="ethmar.manager@clarix.test");
 await tid(m,`select-member-role-${manager.id}`).click();await tid(m,`option-role-analyst-${manager.id}`).click();await tid(m,"dialog-confirm").waitFor();
 const lastWarning=await tid(m,"dialog-confirm").innerText();await snap(m,"illustrative-last-manager-warning");await tid(m,"button-confirm-action").click();await tid(m,"dialog-confirm").waitFor({state:"hidden"});
 const selfState=(await api(m,"/api/members")).body.items.find(x=>x.id===manager.id);
 const demoteFeedback=await m.locator("body").innerText();
 rec("Last active manager cannot be demoted with clear explanation",selfState?.role==="factory_manager"&&/active factory manager|last.*manager|مدير نشط/i.test(demoteFeedback),{role:selfState?.role,explanation:/active factory manager|last.*manager|مدير نشط/i.test(demoteFeedback)});
 const selfButton=await tid(m,`button-member-deactivate-${manager.id}`).elementHandle();
 await tid(m,`button-member-deactivate-${manager.id}`).click();await tid(m,"dialog-confirm").waitFor();const deactivateWarning=await tid(m,"dialog-confirm").innerText();
 await snap(m,"illustrative-last-manager-deactivation-warning");await m.keyboard.press("Escape");await tid(m,"dialog-confirm").waitFor({state:"hidden"});
 rec("Escape cancels destructive member confirmation and restores focus",await m.evaluate(el=>document.activeElement===el,selfButton),{restored:await m.evaluate(el=>document.activeElement===el,selfButton)});
 await tid(m,`button-member-deactivate-${manager.id}`).click();await tid(m,"dialog-confirm").waitFor();await tid(m,"button-confirm-action").click();await tid(m,"dialog-confirm").waitFor({state:"hidden"});
 const selfActive=(await api(m,"/api/members")).body.items.find(x=>x.id===manager.id)?.active;
 const deactivateFeedback=await m.locator("body").innerText();
 rec("Last active manager cannot deactivate self with clear explanation",selfActive===true&&/active factory manager|last.*manager|مدير نشط/i.test(deactivateFeedback),{active:selfActive,explanation:/active factory manager|last.*manager|مدير نشط/i.test(deactivateFeedback)});
 // Account password changes require current password, current session remains, other manager session ends.
 const siblingCtx=await browser.newContext(),sibling=await siblingCtx.newPage();await login(sibling,"ethmar.manager@clarix.test");
 await m.goto(base+"/account");await navReady(m,"input-current-password");await tid(m,"input-current-password").fill("incorrect-current-password");await tid(m,"input-new-password").fill(newManagerPassword);await tid(m,"input-confirm-password").fill(newManagerPassword);await tid(m,"button-change-password").click();await navReady(m,"error-change-password");
 rec("Password change rejects an incorrect current password",(await session(m)).user?.email==="ethmar.manager@clarix.test",{errorShown:true,currentSessionRetained:(await session(m)).user?.email==="ethmar.manager@clarix.test"});
 await tid(m,"input-current-password").fill(pw);await tid(m,"input-new-password").fill(newManagerPassword);await tid(m,"input-confirm-password").fill(newManagerPassword);await tid(m,"button-change-password").click();
 await navReady(m,"button-logout-everywhere");let ownAfter=(await session(m)).user,otherAfter=(await session(sibling)).user;
 rec("Password change validates current password, retains current session and ends other session",ownAfter?.email==="ethmar.manager@clarix.test"&&otherAfter===null,{currentRetained:ownAfter?.email==="ethmar.manager@clarix.test",otherEnded:otherAfter===null});
 // Sign out everywhere is a confirmed action that ends current and other sessions.
 const another=await browser.newContext(),anotherPage=await another.newPage();await login(anotherPage,"ethmar.manager@clarix.test",newManagerPassword);
 await tid(m,"button-logout-everywhere").click();await tid(m,"dialog-logout-everywhere").waitFor();await tid(m,"button-logout-everywhere-confirm").click();await tid(m,"input-email").waitFor({timeout:10000});
 rec("Sign out everywhere ends all manager sessions",(await session(anotherPage)).user===null,{otherSessionEnded:(await session(anotherPage)).user===null});
 // Restore a manager session with new in-memory password for visual matrices and bounds.
 await login(m,"ethmar.manager@clarix.test",newManagerPassword);await m.goto(base+"/members");await navReady(m,"panel-members");
 // Revoke a separate pending invitation and prove its only link is neutral/unavailable.
 const revokeEmail=`phase8-revoke-${randomUUID()}@example.test`;await tid(m,"button-invite-member").click();await tid(m,"dialog-invite").waitFor();await tid(m,"input-invite-email").fill(revokeEmail);await tid(m,"button-invite-submit").click();await tid(m,"dialog-invite-link").waitFor();
 const revokeLink=await tid(m,"input-invite-link").inputValue();tokenRam=new URL(revokeLink).pathname.split("/").pop();const revPath=new URL(revokeLink).pathname;
 const revokeInv=(await api(m,"/api/members/invitations")).body.items.find(x=>x.email===revokeEmail);
 const validBeforeRevoke=await api(m,`/api/auth/invitation?token=${encodeURIComponent(tokenRam)}`);await tid(m,"button-invite-link-done").click();
 await confirmClick(m,`button-revoke-invitation-${revokeInv.id}`);const afterRevoke=await api(m,`/api/auth/invitation?token=${encodeURIComponent(tokenRam)}`);
 rec("Revoking pending invitation invalidates its link",validBeforeRevoke.status===200&&afterRevoke.status===404,{validBefore:validBeforeRevoke.status,afterRevoke:afterRevoke.status});
 // 12 members and 12 account screenshots; additional 12 invite screenshots above = 36 new-screen combinations.
 for(const width of [360,768,1280])for(const lang of ["en","ar"])for(const theme of ["light","dark"]){
  for(const [page,route,ready] of [["members","/members","panel-members"],["account","/account","panel-profile"]]){
   await m.setViewportSize({width,height:900});await prefs(m,lang,theme);await m.goto(base+route);await navReady(m,ready);
   const sizes=await m.evaluate(()=>({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,dir:document.documentElement.dir}));
   ev.matrix.push({page,width,lang,theme,...sizes});rec(`${page} ${width}/${lang}/${theme} no horizontal overflow`,sizes.doc<=width&&sizes.body<=width&&sizes.dir===(lang==="ar"?"rtl":"ltr"),sizes);
   await snap(m,`${page}-${width}-${lang}-${theme}`);
  }
 }
 await m.setViewportSize({width:1280,height:900});await prefs(m,"en","light");await m.goto(base+"/members");await navReady(m,"panel-members");await focusAudit(m,"members");
 const inviteTrigger=await tid(m,"button-invite-member").elementHandle();await tid(m,"button-invite-member").click();await tid(m,"dialog-invite").waitFor();await focusAudit(m,"invite-dialog");
 await m.keyboard.press("Shift+Tab");const trapBack=await m.evaluate(()=>!!document.activeElement?.closest('[data-testid="dialog-invite"]'));
 await m.keyboard.press("Tab");const trapForward=await m.evaluate(()=>!!document.activeElement?.closest('[data-testid="dialog-invite"]'));
 await m.keyboard.press("Escape");await tid(m,"dialog-invite").waitFor({state:"hidden"});
 rec("Invite dialog traps keyboard focus, closes with Escape and restores trigger",trapBack&&trapForward&&await m.evaluate(el=>document.activeElement===el,inviteTrigger),{trapBack,trapForward,restored:await m.evaluate(el=>document.activeElement===el,inviteTrigger)});
 await m.goto(base+"/account");await navReady(m,"panel-profile");await focusAudit(m,"account");
 // Confirm account logout everywhere already exercised; normal logout separately.
 await tid(m,"button-account-logout").click();await tid(m,"input-email").waitFor();rec("Normal sign out returns to login",await tid(m,"input-email").count()===1,{loginVisible:true});
 // 24 source drawer strict bounds checks: fixture IDs discovered from imported-source API data.
 await login(m,"ethmar.manager@clarix.test",newManagerPassword);
 const baseRun=r1;let issues=[];for(let page=1;page<100;page++){const batch=await api(m,`/api/quality?page=${page}&includeArchived=true`);if(batch.status!==200)break;issues.push(...(batch.body.items||[]));if(issues.length>=batch.body.total||!(batch.body.items||[]).length)break;}
 const issue=issues.find(x=>/-(05_suspected_duplicate_record|07_missing_scrap_value)$/.test(x.sourceName||""));
 rec("Bounds fixtures selected by imported source names",!!baseRun&&!!issue,{run:!!baseRun,issue:!!issue});
 const cases=[["runs",`/runs?sourceKind=metric&sourceId=${baseRun?.id}&sourceMetric=input_kg`],["comparison",`/compare?a=${r1?.id}&b=${r2?.id}&sourceKind=metric&sourceId=${baseRun?.id}&sourceMetric=input_kg`],["quality",`/quality?sourceKind=issue&sourceId=${issue?.id}`]];
 for(const width of [360,768])for(const lang of ["en","ar"])for(const theme of ["light","dark"])for(const [screen,route] of cases){
  const name=`bounds-${screen}-${width}-${lang}-${theme}`;await m.setViewportSize({width,height:900});await prefs(m,lang,theme);await m.goto(base+route);
  try{await navReady(m,"drawer-source");const b=await geometry(m,screen),ok=b.x>=-0.1&&b.right<=width+0.1&&(width!==360||Math.abs(b.width-width)<1)&&b.doc<=width&&b.body<=width;
   ev.bounds.push({screen,width,lang,theme,...b,status:ok?"PASS":"FAIL"});rec(`${name} exact drawer bounds`,ok,b);await snap(m,name);await tid(m,"button-close-source").click().catch(()=>{});
  }catch(e){ev.bounds.push({screen,width,lang,theme,status:"ERROR",error:safe(e.message)});rec(`${name} exact drawer bounds`,false,safe(e.message));}
 }
 // Revoke remaining valid invitation, then verify stale link without storing it in evidence.
 await m.goto(base+"/members");await navReady(m,"panel-invitations");const currentInvite=(await api(m,"/api/members/invitations")).body.items.find(x=>x.id===invitationRow.id);
 if(currentInvite?.status==="pending"){await confirmClick(m,`button-revoke-invitation-${currentInvite.id}`);const stale=await api(iv,`/api/auth/invitation?token=${encodeURIComponent(tokenRam)}`);rec("Revocation invalidates invitation link",stale.status===404,{status:stale.status});}
 await m.goto(base+"/account");await navReady(m,"panel-profile");await snap(m,"account-final-en");
 ev.finishedAt=new Date().toISOString();ev.summary={journey:ev.journey.length,passed:ev.journey.filter(x=>x.status==="PASS").length,failed:ev.errors.length,matrix:ev.matrix.length,bounds:ev.bounds.length,boundsPassed:ev.bounds.filter(x=>x.status==="PASS").length,focusScopes:ev.focus.length,screenshots:ev.screenshots.length};
 await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(ev,null,2));console.log(JSON.stringify(ev.summary));
 await browser.close();if(ev.errors.length)process.exitCode=1;
})().catch(async e=>{ev.errors.push(safe(e.message));ev.finishedAt=new Date().toISOString();ev.summary={failed:ev.errors.length,journey:ev.journey.length,matrix:ev.matrix.length,bounds:ev.bounds.length,screenshots:ev.screenshots.length};await fs.mkdir(out,{recursive:true}).catch(()=>{});await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(ev,null,2)).catch(()=>{});console.error(`Phase 8 browser driver failed; evidence directory ${path.basename(out)}`);await browser?.close().catch(()=>{});process.exitCode=1;});
