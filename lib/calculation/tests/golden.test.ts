import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { calculateFiles, contentHash, D, type Mapping, type SourceFile } from "../src";

const root=fileURLToPath(new URL("../../../",import.meta.url));
type Json = null | boolean | string | number | Json[] | {[key:string]:Json};
type Obj = {[key:string]:Json};
const expected=JSON.parse(readFileSync(join(root,"expected/expected_results.json"),"utf8")) as {datasets:Record<string,Record<string,Obj>>};
const isObject=(x:Json):x is Obj => typeof x==="object" && x!==null && !Array.isArray(x);
export function merge(base:Obj, overrides:Obj):Obj {
  const result=structuredClone(base);
  for(const [k,v] of Object.entries(overrides)) {
    result[k]=isObject(v) && isObject(result[k]) ? merge(result[k],v):structuredClone(v);
  }
  return result;
}
function resolve(scenarios:Record<string,Obj>, name:string, seen=new Set<string>()):Obj {
  if(seen.has(name)) throw new Error("Cyclic extends");
  seen.add(name);
  const spec=scenarios[name];
  if(!spec) throw new Error(`Missing expectation ${name}`);
  const {extends:parent,...own}=spec;
  return parent ? merge(resolve(scenarios,String(parent),seen),own):structuredClone(own);
}
function compare(exp:Json,act:unknown,path:string):void {
  if(isObject(exp)) {
    assert.ok(act && typeof act==="object" && !Array.isArray(act),`${path}: object required`);
    assert.deepEqual(Object.keys(act).sort(),Object.keys(exp).sort(),`${path}: keys`);
    for(const k of Object.keys(exp)) compare(exp[k],(act as Record<string,unknown>)[k],`${path}.${k}`);
  } else if(Array.isArray(exp)) {
    assert.ok(Array.isArray(act),`${path}: array required`);
    assert.equal(act.length,exp.length,`${path}: length`);
    exp.forEach((v,i)=>compare(v,act[i],`${path}[${i}]`));
  } else if(exp===null || act===null || typeof exp==="boolean" || typeof act==="boolean") {
    assert.equal(act,exp,path);
  } else {
    const numeric=(s:unknown)=>typeof s==="number" || typeof s==="string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s);
    if(numeric(exp) && numeric(act)) assert.ok(new D(String(exp)).eq(String(act)),`${path}: ${act} != ${exp}`);
    else assert.equal(act,exp,path);
  }
}
function load(folder:string) {
  const files:SourceFile[]=readdirSync(folder,{withFileTypes:true}).filter((p)=>p.isFile())
    .map((p)=>({name:p.name,bytes:readFileSync(join(folder,p.name))}));
  const mapping=JSON.parse(readFileSync(join(folder,"mapping.json"),"utf8")) as Mapping;
  return {files,mapping};
}

for(const [dataset,scenarios] of Object.entries(expected.datasets)) {
  const base=join(root,"test-data",dataset);
  test(`${dataset}: every scenario folder has an expectation`,()=>{
    assert.deepEqual(readdirSync(base,{withFileTypes:true}).filter((p)=>p.isDirectory()).map((p)=>p.name).sort(),Object.keys(scenarios).sort());
  });
  for(const name of Object.keys(scenarios).sort()) {
    test(`golden: ${dataset}/${name}`,()=>{
      const exp=resolve(scenarios,name);
      const {files,mapping}=load(join(base,name));
      const pair=(exp.comparison as Obj).pair as [string,string];
      const act=calculateFiles(files,mapping,pair);
      for(const key of ["capability_level","runs","comparison","file_issues","formula_like_cells"] as const) compare(exp[key],act[key],key);
      for(const [id,reason] of Object.entries((exp.event_reasons as Obj|undefined)??{})) assert.equal(act.event_reasons[id],reason,`reason ${id}`);
      assert.deepEqual(calculateFiles(files,mapping,pair),act,"deterministic repeat");
      if(exp.import_checks) {
        const other=load(join(base,String((exp.import_checks as Obj).duplicate_of)));
        assert.equal(contentHash(files),contentHash(other.files),"scenario 20: identical content hash");
        assert.deepEqual(act.runs,calculateFiles(other.files,other.mapping,pair).runs,"hash check must not double-count rows");
      }
    });
  }
}
test("extends merges objects, replaces arrays/scalars and preserves null",()=>{
  assert.deepEqual(merge({a:{x:1,y:2},b:[1,2],c:5},{a:{x:3},b:[9],c:null}),{a:{x:3,y:2},b:[9],c:null});
});
test("all fixture files still match MANIFEST.sha256",()=>{
  const listing=readFileSync(join(root,"MANIFEST.sha256"),"utf8").trim().split(/\r?\n/);
  const found:string[]=[];
  function walk(folder:string) {
    for(const f of readdirSync(folder,{withFileTypes:true})) {
      const path=join(folder,f.name);
      if(f.isDirectory()) walk(path); else found.push(relative(root,path));
    }
  }
  walk(join(root,"test-data"));
  assert.deepEqual(found.sort(),listing.map((line)=>line.split("  ")[1]).sort());
  for(const line of listing) {
    const [hash,path]=line.split("  ");
    assert.equal(createHash("sha256").update(readFileSync(join(root,path))).digest("hex"),hash,path);
  }
});
