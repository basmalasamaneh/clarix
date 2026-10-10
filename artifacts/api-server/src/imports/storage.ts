import { Storage } from "@google-cloud/storage";
const endpoint="http://127.0.0.1:1106";
// Standard Replit sidecar credentials. Never exposed to browser or logs.
const client=new Storage({credentials:{
  audience:"replit",subject_token_type:"access_token",token_url:`${endpoint}/token`,
  type:"external_account",credential_source:{url:`${endpoint}/credential`,format:{type:"json",subject_token_field_name:"access_token"}},
  universe_domain:"googleapis.com",
},projectId:""});
export interface FileStorage {
  uploadUrl(key:string):Promise<string>;
  read(key:string,limit:number):Promise<Buffer>;
  preserve(key:string,bytes:Uint8Array):Promise<void>;
}
function object(key:string) {
  const dir=process.env.PRIVATE_OBJECT_DIR;
  if(!dir) throw new Error("Private storage is not configured");
  const [bucket,...prefix]=dir.replace(/^\/+/,"").split("/");
  return client.bucket(bucket).file([...prefix,key].join("/"));
}
export const fileStorage:FileStorage={
  async uploadUrl(key) {
    const f=object(key);
    const response=await fetch(`${endpoint}/object-storage/signed-object-url`,{method:"POST",
      headers:{"Content-Type":"application/json"},body:JSON.stringify({
        bucket_name:f.bucket.name,object_name:f.name,method:"PUT",expires_at:new Date(Date.now()+900000).toISOString(),
      }),signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error("Storage unavailable");
    return (await response.json() as {signed_url:string}).signed_url;
  },
  async read(key,limit) {
    const f=object(key);
    const [meta]=await f.getMetadata();
    if(Number(meta.size)>limit) throw new Error("FILE_TOO_LARGE");
    // Bound actual streamed bytes too: a staging upload can change after HEAD.
    const chunks:Buffer[]=[]; let size=0;
    for await(const chunk of f.createReadStream({end:limit})) {
      const b=Buffer.from(chunk); size+=b.length;
      if(size>limit) throw new Error("FILE_TOO_LARGE");
      chunks.push(b);
    }
    return Buffer.concat(chunks);
  },
  async preserve(key,bytes) {
    // Original has no signed PUT URL. Only create-if-absent writes are allowed.
    await object(key).save(Buffer.from(bytes),{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:"text/csv"}});
  },
};
