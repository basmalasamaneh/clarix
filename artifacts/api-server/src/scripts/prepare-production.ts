import pg from "pg";
import {prepareProductionSchema} from "../maintenance/production-schema";
if(process.env.SEED_TEST_USERS!=="false")throw new Error("Production setup requires SEED_TEST_USERS=false");
if(!process.env.DATABASE_URL)throw new Error("Privileged production database connection required");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:"-c row_security=off"});
const c=await pool.connect();
try{await prepareProductionSchema(c);console.log("Production schema and tenant policies prepared. Configure the runtime login next.");}
catch{console.error("Production setup failed; check privileges and migration baseline. No credentials logged.");process.exitCode=1;}
finally{c.release();await pool.end();}
