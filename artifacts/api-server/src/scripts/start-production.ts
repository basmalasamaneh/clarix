import pg from "pg";
import {fileURLToPath} from "node:url";
import {configureDeployment} from "../maintenance/deployment-security";

// This executable is separate from the API bundle. No app import is permitted.
// execve discards the privileged process image and its owner credentials.
try{
  if(!process.execve)throw new Error("Process replacement unavailable");
  const ownerUrl=process.env.DATABASE_URL;
  if(!ownerUrl)throw new Error("Database connection required");
  const pool=new pg.Pool({connectionString:ownerUrl,max:1});
  try{
    const c=await pool.connect();
    try{await configureDeployment(c,process.env);}finally{c.release();}
  }finally{await pool.end();}
  const url=new URL(ownerUrl);
  url.username="clarix_runtime";url.password=process.env.CLARIX_RUNTIME_PASSWORD!;
  url.searchParams.delete("options");
  const env:Record<string,string>={};
  // Explicit allowlist: no owner/legacy PG credentials or bootstrap token are
  // inherited by the request-serving process.
  for(const key of ["PATH","HOME","LANG","TZ","NODE_ENV","PORT","BASE_PATH","SESSION_SECRET","CLARIX_RUNTIME_PASSWORD",
    "DEFAULT_OBJECT_STORAGE_BUCKET_ID","PRIVATE_OBJECT_DIR","PUBLIC_OBJECT_SEARCH_PATHS","LOG_LEVEL",
    "REPL_ID","REPLIT_DEPLOYMENT","REPLIT_SIDECAR_URL","REPLIT_DOMAINS"])
    if(process.env[key]!==undefined)env[key]=process.env[key]!;
  env.DATABASE_URL=url.toString();env.SEED_TEST_USERS="false";
  process.execve(process.execPath,[process.execPath,fileURLToPath(new URL("./index.mjs",import.meta.url))],env);
}catch{
  // No exception/PG details/env values: failures may carry sensitive inputs.
  process.stderr.write("Production security setup failed; API not started.\n");
  process.exitCode=1;
}
