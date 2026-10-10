import pg from "pg";
import {randomBytes} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {fingerprint,importedTables,protectedTables,roleFingerprint,requireUnfilteredObserver} from "../maintenance/reset";
if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1") throw new Error("Tests cannot run in production");
const schema="clarix_test_"+randomBytes(12).toString("hex");
const root=fileURLToPath(new URL("../../../../",import.meta.url));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:"-c row_security=off"});
const c=await pool.connect();
const barrier=await pool.connect();
try {
  await requireUnfilteredObserver(c);
  await barrier.query("BEGIN");
  await barrier.query("SET LOCAL lock_timeout='10s'");
  await barrier.query(`LOCK TABLE ${[...protectedTables,...importedTables].map(t=>`public."${t}"`).join(",")} IN SHARE MODE`);
} catch(error) {
  await barrier.query("ROLLBACK");barrier.release();c.release();await pool.end();throw error;
}
const children:ReturnType<typeof spawn>[]=[];
let interrupted=false;
const stop=()=>{interrupted=true;for(const child of children) if(child.pid) {try{process.kill(-child.pid,"SIGTERM");}catch{}}};
process.on("SIGTERM",stop);process.on("SIGINT",stop);
const env={...process.env,NODE_ENV:"test",SEED_TEST_USERS:"true",CLARIX_TEST_SCHEMA:schema,
  PGOPTIONS:`-c role=${schema} -c search_path=${schema} -c lock_timeout=10000`,EXPECT_NON_BYPASS_OWNER:"true",LOG_LEVEL:"silent"};
function run(command:string,args:string[],extra={}) {
  return new Promise<void>((resolve,reject)=>{
    if(interrupted) {reject(new Error("Test run interrupted"));return;}
    const child=spawn(command,args,{cwd:root,env:{...env,...extra},stdio:"inherit",detached:true});children.push(child);
    child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`Isolated command failed (${code})`)));
  });
}
let created=false;
const before=await fingerprint(c);
const factorySnapshots=async()=>Object.fromEntries(await Promise.all(["ethmar","najm"].map(async id=>[id,await fingerprint(c,"public",id)])));
const factoriesBefore=await factorySnapshots();
const rolesBefore=await roleFingerprint(c);
try {
  await c.query(`CREATE ROLE ${schema} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
  created=true;
  await c.query(`GRANT ${schema} TO CURRENT_USER`);
  await c.query(`GRANT clarix_runtime,clarix_identity,clarix_accounts TO ${schema}`);
  await c.query(`CREATE SCHEMA ${schema} AUTHORIZATION ${schema}`);
  await c.query(`GRANT USAGE ON SCHEMA ${schema} TO clarix_runtime,clarix_identity,clarix_accounts`);
  for(const t of [...protectedTables,...importedTables]) {
    await c.query(`CREATE TABLE ${schema}."${t}" (LIKE public."${t}" INCLUDING ALL)`);
    await c.query(`ALTER TABLE ${schema}."${t}" OWNER TO ${schema}`);
  }
  // LIKE does not copy foreign keys. Recreate their exact definitions against
  // only isolated tables; never point a test FK at the development schema.
  const fks=(await c.query(`SELECT cl.relname AS table_name,con.conname,pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND con.contype='f' AND cl.relname=ANY($1::text[])`,[[...protectedTables,...importedTables]])).rows;
  for(const fk of fks) {
    const def=fk.definition.replace(/REFERENCES (?:public\.)?("?[\w]+"?)/,`REFERENCES ${schema}.$1`);
    await c.query(`ALTER TABLE ${schema}."${fk.table_name}" ADD CONSTRAINT "${fk.conname}" ${def}`);
  }
  await c.query(`SET search_path=${schema}`);
  for(const file of ["foundation-rls.sql","canonical-rls.sql","history-rls.sql","accounts-rls.sql","runtime-grants.sql"]) {
    let sql=await readFile(root+"lib/db/"+file,"utf8");
    if(file==="foundation-rls.sql") sql=sql.slice(sql.indexOf("GRANT SELECT ON factories")); // roles already exist; no global role changes
    await c.query(sql);
  }
  // Functions must be owned by the disposable setup role as well.
  const funcs=(await c.query("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1",[schema])).rows;
  for(const f of funcs) await c.query(`ALTER FUNCTION ${schema}."${f.proname}"() OWNER TO ${schema}`);
  await c.query("RESET search_path");
  await run("pnpm",["--filter","@workspace/api-server","exec","tsx","src/scripts/seed.ts"]);
  const args=process.argv.slice(2);
  if(args[0]==="--browser") {
    if(!/^scripts\/[\w-]+\.cjs$/.test(args[1]??"")) throw new Error("Specify an existing scripts/<name>.cjs browser check");
    await run("pnpm",["--filter","@workspace/api-server","exec","tsx","--test","src/tests/imports.test.ts"]);
    const {createServer}=await import("node:net");
    const port=()=>new Promise<number>(resolve=>{const s=createServer();s.listen(0,"127.0.0.1",()=>{const p=(s.address() as {port:number}).port;s.close(()=>resolve(p));});});
    const apiPort=await port(),webPort=await port();
    for(const [filter,command,extras] of [
      ["@workspace/api-server",["exec","tsx","src/index.ts"],{PORT:String(apiPort)}],
      ["@workspace/clarix",["exec","vite"],{PORT:String(webPort),BASE_PATH:"/",CLARIX_TEST_API_PORT:String(apiPort)}],
    ] as const) children.push(spawn("pnpm",["--filter",filter,...command],{cwd:root,env:{...env,...extras},stdio:"ignore",detached:true}));
    for(const target of [apiPort,webPort]) {
      let ready=false;
      for(let i=0;i<60&&!ready;i++){if(interrupted)throw new Error("Interrupted");try{await fetch(`http://127.0.0.1:${target}`);ready=true;}catch{await new Promise(r=>setTimeout(r,500));}}
      if(!ready) throw new Error("Isolated browser server did not start");
    }
    if(args[1]==="scripts/import-version-browser.cjs") await run("node",["scripts/import-browser-check.cjs"],{CLARIX_TEST_BASE_URL:`http://127.0.0.1:${webPort}`});
    await run("node",[args[1]],{CLARIX_TEST_BASE_URL:`http://127.0.0.1:${webPort}`});
  } else {
    await run("pnpm",["--filter","@workspace/api-server","exec","tsx","--test","--test-concurrency=1",...(args.length?args:["src/tests/*.test.ts"])]);
  }
} finally {
  stop();
  await new Promise(r=>setTimeout(r,200));
  process.env.CLARIX_TEST_SCHEMA=schema;
  try {const {cleanupTestStorage}=await import("../imports/storage");await cleanupTestStorage(schema);}
  finally {
    await c.query("RESET search_path");
    if(created){
      await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await c.query(`DROP OWNED BY ${schema}`);
      await c.query(`DROP ROLE ${schema}`);
    }
    const after=await fingerprint(c);
    const factoriesAfter=await factorySnapshots();
    await mkdir(root+"generated-artifacts/test-isolation",{recursive:true});
    const rolesAfter=await roleFingerprint(c);
    await writeFile(root+"generated-artifacts/test-isolation/latest.json",JSON.stringify({schema,unfilteredObserverVerified:true,before,after,factoriesBefore,factoriesAfter,rolesBefore,rolesAfter,unchanged:JSON.stringify(before)===JSON.stringify(after)&&JSON.stringify(factoriesBefore)===JSON.stringify(factoriesAfter)&&JSON.stringify(rolesBefore)===JSON.stringify(rolesAfter)},null,2));
    await barrier.query("ROLLBACK");barrier.release();c.release();await pool.end();
    if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error("Development data changed during tests; inspect isolation evidence");
    if(JSON.stringify(rolesBefore)!==JSON.stringify(rolesAfter)) throw new Error("Database roles changed during tests");
    console.log("Isolated test target removed; development table counts and fingerprints unchanged.");
  }
}
