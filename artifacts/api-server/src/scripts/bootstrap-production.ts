import pg from "pg";
import {parseArgs} from "node:util";
import {bootstrapFactory} from "../maintenance/bootstrap";
const {values}=parseArgs({options:{name:{type:"string"},slug:{type:"string"},email:{type:"string"},origin:{type:"string"},"allow-existing-manager":{type:"boolean"}}});
// A TTY is required: never emit invitation secrets into workflow/captured logs.
if(!process.stdout.isTTY)throw new Error("Run interactively in a private terminal; do not redirect invitation output");
if(process.env.SEED_TEST_USERS!=="false")throw new Error("Set SEED_TEST_USERS=false for production setup");
const origin=new URL(values.origin??"");
if(origin.protocol!=="https:"||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/")
  throw new Error("Provide the verified HTTPS published origin");
if(!process.env.DATABASE_URL)throw new Error("Privileged database connection is required");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:"-c row_security=off"});
const c=await pool.connect();
try{
  const invite=await bootstrapFactory(c,{name:values.name,slug:values.slug,email:values.email,allowExistingManager:values["allow-existing-manager"]??false});
  process.stdout.write(`One-time invitation (expires ${invite.expiresAt.toISOString()}):\n${origin.origin}${invite.path}\nShare privately; this link is not stored and cannot be retrieved.\n`);
}catch{process.stderr.write("Setup refused or failed. Check factory details, manager/pending-invitation status and privileged connection. No invitation was printed.\n");process.exitCode=1;}
finally{c.release();await pool.end();}
