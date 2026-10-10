import type {PoolConfig} from "pg";
export function runtimeConfig(role?:"clarix_identity"|"clarix_accounts"):PoolConfig {
  const password=process.env.CLARIX_RUNTIME_PASSWORD;
  if(!password||password.length<32) throw new Error("CLARIX_RUNTIME_PASSWORD must contain at least 32 characters");
  if(!process.env.DATABASE_URL) throw new Error("Database location is required");
  // Reuse location/TLS settings, never the managed owner's identity/password.
  const url=new URL(process.env.DATABASE_URL);
  url.username="clarix_runtime";url.password=password;
  const schema=process.env.CLARIX_TEST_SCHEMA;
  if(schema&&!/^clarix_test_[a-f0-9]+$/.test(schema)) throw new Error("Invalid isolated schema");
  // Do not inherit a setup script's PGOPTIONS role or caller-provided URL options.
  url.searchParams.delete("options");
  return {connectionString:url.toString(),allowExitOnIdle:true,
    options:`-c search_path=${schema??"public"} -c role=${role??"clarix_runtime"} -c lock_timeout=10000`};
}
