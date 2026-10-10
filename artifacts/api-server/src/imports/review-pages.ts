import {ImportError} from "./model";
import type {Context,ImportRow} from "./service";
import {eventCodes,issues,replacementOrders,duplicateState} from "./review";
import {sourceInfo} from "./sources";
import {z} from "zod";
export const REVIEW_PAGE_SIZE=20;
export function preview(value:any):any {
  if(Array.isArray(value))return value.slice(0,REVIEW_PAGE_SIZE).map(preview);
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,
    k==="runs" && v && typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,20).map(([id,run])=>[id,preview(run)])):preview(v)]));
  return value;
}
export async function reviewPage(ctx:Context,row:ImportRow,input:{kind:string;page?:number;issueId?:string;code?:string;mapping?:any;path?:string[]}) {
  const p=input.page??1,offset=(p-1)*20;
  let items:any[]=[];
  if(input.kind==="issueRows" || input.kind==="issueCodes" || input.kind==="issueCodeRefs") {
    const issue=(await ctx.db.query("SELECT id,raw_row_ids FROM data_issues WHERE factory_id=$1 AND import_id=$2 AND id=$3",
      [ctx.factory,row.id,input.issueId??"00000000-0000-0000-0000-000000000000"])).rows[0];
    if(!issue)throw new ImportError("NOT_FOUND",404);
    if(input.kind==="issueRows") {
      const rows=(await ctx.db.query(`SELECT file,line_number AS line,cells FROM raw_rows
        WHERE factory_id=$1 AND import_id=$2 AND id=ANY($3::uuid[]) ORDER BY file COLLATE "C",line_number,id LIMIT 20 OFFSET $4`,
        [ctx.factory,row.id,issue.raw_row_ids,offset])).rows;
      return {items:rows,total:issue.raw_row_ids.length,page:p,pageSize:20};
    }
    const rank=(await ctx.db.query(`SELECT n FROM (SELECT id,row_number() OVER(ORDER BY code,id) AS n FROM data_issues WHERE factory_id=$1 AND import_id=$2) q WHERE id=$3`,[ctx.factory,row.id,issue.id])).rows[0].n;
    const detail=(await issues(ctx,row,Math.ceil(Number(rank)/20))).items.find((i:any)=>i.id===issue.id);
    const codes=detail?.details.eventCodes??[];
    items=input.kind==="issueCodes"?codes:codes.find(c=>c.code===input.code)?.refs??[];
  } else if(input.kind==="eventCodes"||input.kind==="eventCodeRefs"){
    const mapping=z.object({files:z.object({events:z.object({file:z.string(),columns:z.record(z.string())}).optional()}),event_code_map:z.record(z.string()).default({}),ignored_event_codes:z.array(z.string()).default([])}).parse(input.mapping??row.mapping);
    const codes=(await eventCodes(ctx,row,mapping as any)).items.sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0);
    items=input.kind==="eventCodes"?codes:codes.find(c=>c.code===input.code)?.refs??[];
  } else if(input.kind==="replacementOrders")items=await replacementOrders(ctx,row);
  else if(input.kind==="replacedOrders")items=[...(row.replaced_orders??[])].sort();
  else if(input.kind==="otherSourceOrders")items=(await sourceInfo(ctx,row)).otherSourceOrders;
  else if(input.kind==="settingsDifferences")items=(await duplicateState(ctx,row)).settingsDifferences;
  else if(input.kind==="resultRuns")items=Object.entries(row.result?.runs??{}).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([orderId,result])=>({orderId,result}));
  else if(input.kind==="resultRefs"){
    let value:any=row.result;
    for(const key of input.path??[]){
      if(!value || !Object.hasOwn(value,key))throw new ImportError("NOT_FOUND",404);
      value=value[key];
    }
    if(!Array.isArray(value))throw new ImportError("NOT_FOUND",404);
    items=value;
  } else throw new ImportError("NOT_FOUND",404);
  return {items:preview(items.slice(offset,offset+20)),total:items.length,page:p,pageSize:20};
}
