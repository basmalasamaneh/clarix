import {guardReset,resetFactory} from "../maintenance/reset";
// Check guards before opening a privileged connection. Never imported by app.
guardReset(process.argv.slice(2));
const {pool}=await import("@workspace/db");
const c=await pool.connect();
try {console.log(JSON.stringify(await resetFactory(c,process.argv.slice(2)),null,2));}
catch(e){console.error(e instanceof Error?e.message:"Reset failed");process.exitCode=1;}
finally {c.release();await pool.end();}
