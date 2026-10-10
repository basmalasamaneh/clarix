import pg from "pg";
import {randomBytes,pbkdf2Sync,createHmac,createHash} from "node:crypto";
import {isProduction} from "../lib/permissions";
if(isProduction()) throw new Error("Runtime role setup is development-only");
const password=process.env.CLARIX_RUNTIME_PASSWORD;
if(!password||password.length<32) throw new Error("A runtime password of at least 32 characters is required");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  // Send a SCRAM verifier, never a plaintext password in SQL statements/logs.
  const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,"sha256");
  const client=createHmac("sha256",salted).update("Client Key").digest();
  const stored=createHash("sha256").update(client).digest("base64");
  const server=createHmac("sha256",salted).update("Server Key").digest("base64");
  const verifier=`SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}`;
  await pool.query(`ALTER ROLE clarix_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${verifier}'`);
  // PUBLIC grants otherwise let any login create temporary tables despite the
  // absence of direct grants. Database/schema owners retain setup privileges.
  await pool.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC',current_database()); END $$;`);
  console.log("Runtime login configured; no credential values printed.");
} catch {
  console.error("Runtime login configuration failed; credentials were not logged.");
  process.exitCode=1;
} finally {await pool.end();}
