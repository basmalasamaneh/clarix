import type {PoolClient} from "pg";
import {randomUUID} from "node:crypto";
import {D} from "@workspace/calculation";
import type {FactoryPreferences} from "@workspace/api-zod";
import {ImportError} from "../imports/model";
export const DEFAULT_LIMITS={maxMembers:50,maxFileBytes:5*1024*1024,maxRows:100000};
export const BUILTIN_UNITS={kg:"1",kgs:"1",t:"1000",tonne:"1000",lb:"0.45359237",g:"0.001"};
export function limits(settings:Record<string,any>={}){return {...DEFAULT_LIMITS,...settings.platformLimits};}
export async function ensureMemberCapacity(c:PoolClient,factory:string){
  const f=(await c.query("SELECT settings FROM factories WHERE id=$1 FOR NO KEY UPDATE",[factory])).rows[0];
  const n=(await c.query("SELECT count(*)::int n FROM memberships WHERE factory_id=$1 AND active",[factory])).rows[0].n;
  if(n>=limits(f.settings).maxMembers)throw new ImportError("MEMBER_LIMIT_REACHED",409);
}
export function preferences(f:any):FactoryPreferences {
  return {name:f.name,defaultLanguage:f.default_language,warningPercent:f.settings?.tolerances?.imbalance_warn_pct??"1",
    errorPercent:f.settings?.tolerances?.imbalance_error_pct??"5",
    units:Object.entries(f.settings?.unit_factors_to_kg??{}).filter(([u])=>!(u in BUILTIN_UNITS)).map(([unit,factor])=>({unit,factor:String(factor)}))};
}
export async function getPreferences(c:PoolClient,factory:string){
  return preferences((await c.query("SELECT name,default_language,settings FROM factories WHERE id=$1",[factory])).rows[0]);
}
export async function savePreferences(c:PoolClient,factory:string,user:string,input:FactoryPreferences){
  const number=/^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if(![input.warningPercent,input.errorPercent].every(s=>s.length<=40&&number.test(s)))throw new ImportError("INVALID_THRESHOLDS");
  const warn=new D(input.warningPercent),error=new D(input.errorPercent);
  if(warn.lt(0)||error.gt(100)||!warn.lt(error))throw new ImportError("INVALID_THRESHOLDS");
  const extra:Record<string,string>={};
  for(const {unit,factor} of input.units){
    if(!/^[a-z][a-z0-9_-]{0,31}$/.test(unit)||unit in BUILTIN_UNITS||unit in extra||!number.test(factor)||!new D(factor).gt(0))
      throw new ImportError("INVALID_UNIT_CONVERSION");
    extra[unit]=new D(factor).toFixed();
  }
  const old=await getPreferences(c,factory);
  const value={...input,name:input.name.trim(),warningPercent:warn.toFixed(),errorPercent:error.toFixed()};
  if(!value.name)throw new ImportError("INVALID_INPUT");
  await c.query(`UPDATE factories SET name=$2,default_language=$3,settings=settings||$4::jsonb WHERE id=$1`,
    [factory,value.name,value.defaultLanguage,JSON.stringify({unit_factors_to_kg:{...BUILTIN_UNITS,...extra},tolerances:{imbalance_warn_pct:value.warningPercent,imbalance_error_pct:value.errorPercent},managedImportSettings:true})]);
  await c.query(`INSERT INTO factory_settings_audit(id,factory_id,actor_id,action,old_value,new_value) VALUES($1,$2,$3,'settings_changed',$4,$5)`,
    [randomUUID(),factory,user,JSON.stringify(old),JSON.stringify(value)]);
  return value;
}
export async function managementAudit(c:PoolClient,page:number,factory?:string){
  const table=factory?"factory_settings_audit":"platform_audit",where=factory?"WHERE a.factory_id=$1":"";
  const args=factory?[factory]:[];
  const rows=(await c.query(`SELECT a.id,a.factory_id AS "factoryId",u.name AS "actorName",a.action,a.created_at AS "createdAt",a.old_value AS "oldValue",a.new_value AS "newValue"
    FROM ${table} a LEFT JOIN users u ON u.id=a.actor_id ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT 20 OFFSET $${args.length+1}`,[...args,(page-1)*20])).rows;
  const total=(await c.query(`SELECT count(*)::int n FROM ${table} a ${where}`,args)).rows[0].n;
  return {items:rows.map(r=>({...r,createdAt:r.createdAt.toISOString()})),page,total};
}
