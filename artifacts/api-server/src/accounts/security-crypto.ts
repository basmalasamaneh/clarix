import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
import {TOTP,Secret} from "otpauth";
import {ImportError} from "../imports/model";
export const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
export const token=()=>randomBytes(32).toString("base64url");
function key(previous=false){
 const value=process.env[previous?"CLARIX_TOTP_PREVIOUS_ENCRYPTION_KEY":"CLARIX_TOTP_ENCRYPTION_KEY"];
 if(!value||!/^[a-fA-F0-9]{64}$/.test(value))throw new ImportError("SECURITY_NOT_CONFIGURED",503);
 return Buffer.from(value,"hex");
}
// Versioned AEAD, bound to the account. A database ciphertext cannot be swapped
// to another user. No secret material is included in errors.
export function encrypt(secret:string,user:string){
 const iv=randomBytes(12),k=key(),cipher=createCipheriv("aes-256-gcm",k,iv);
 cipher.setAAD(Buffer.from(user));
 const data=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
 return ["v1",digest(k.toString("hex")).slice(0,16),iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),data.toString("base64url")].join(".");
}
export function decrypt(value:string,user:string){
 const [version,id,iv,tag,data]=value.split(".");
 try{
  const k=key();const actual=digest(k.toString("hex")).slice(0,16)===id?k:key(true);
  if(version!=="v1"||digest(actual.toString("hex")).slice(0,16)!==id)throw Error();
  const cipher=createDecipheriv("aes-256-gcm",actual,Buffer.from(iv,"base64url"));
  cipher.setAAD(Buffer.from(user));cipher.setAuthTag(Buffer.from(tag,"base64url"));
  return Buffer.concat([cipher.update(Buffer.from(data,"base64url")),cipher.final()]).toString("utf8");
 }catch{throw new ImportError("SECURITY_NOT_CONFIGURED",503);}
}
export const newTotp=()=>new Secret({size:20}).base32;
export const totp=(secret:string)=>new TOTP({issuer:"Clarix",label:"Clarix",algorithm:"SHA1",digits:6,period:30,secret:Secret.fromBase32(secret)});
export function validStep(secret:string,code:string,lastStep:number){
 if(!/^\d{6}$/.test(code))return null;
 const now=Date.now(),delta=totp(secret).validate({token:code,timestamp:now,window:1});
 const step=Math.floor(now/30000)+(delta??0);
 return delta!==null&&step>lastStep?step:null;
}
const common=new Set(["password1234","password12345","password123456","123456789012","1234567890123","1234567890123456","qwerty1234567","qwertyuiop12","qwertyuiop123","administrator","letmein123456","welcome12345","welcome123456","iloveyou12345"]);
export function passwordAllowed(password:string){
 const n=Array.from(password).length;
 if(n<12||n>256)throw new ImportError("PASSWORD_LENGTH",400);
 if(common.has(password.toLowerCase().trim())||/^(.)\1+$/u.test(password))throw new ImportError("COMMON_PASSWORD",400);
}
