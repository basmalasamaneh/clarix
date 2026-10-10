import type {AiAssistBlock,AiAssistInput} from "@workspace/api-zod";
import type {Context} from "../imports/service";
import {ImportError} from "../imports/model";
import {issueAdvice} from "./catalogue";
export async function qualityBlocks(ctx:Context,input:AiAssistInput){
 const page=input.page??1,ar=input.language==="ar";
 if(input.importId){
  const row=(await ctx.db.query("SELECT status FROM imports WHERE factory_id=$1 AND id=$2",[ctx.factory,input.importId])).rows[0];
  if(!row)throw new ImportError("NOT_FOUND",404);
  const role=(await ctx.db.query("SELECT role FROM memberships WHERE factory_id=$1 AND user_id=$2",[ctx.factory,ctx.user])).rows[0]?.role;
  if(row.status!=="approved"&&!["factory_manager","analyst"].includes(role))throw new ImportError("FORBIDDEN",403);
 }
 const from=`FROM data_issues d JOIN imports i ON i.id=d.import_id AND i.factory_id=d.factory_id JOIN factories f ON f.id=d.factory_id`;
 const where=`d.factory_id=$1 AND ($2::uuid IS NULL OR d.import_id=$2) AND ($3::uuid IS NULL OR d.id=$3)
  AND ($4::uuid IS NULL OR d.order_id=$4) AND ($2::uuid IS NOT NULL OR i.status='approved')
  AND ($5::boolean OR NOT coalesce((f.settings->'sourceArchives'->i.source_name->>'archived')::boolean,false))
  AND ($6::text IS NULL OR i.source_name=$6) AND ($7::text IS NULL OR d.source_order_id=$7)
  AND ($8::text IS NULL OR d.severity=$8)
  AND ($9::text IS NULL OR $9=ANY(string_to_array(d."group",',')))`;
 const params=[ctx.factory,input.importId??null,input.issueId??null,input.runId??null,input.includeArchived??false,
  input.source??null,input.order??null,input.severity??null,input.group??null];
 const total=(await ctx.db.query(`SELECT count(*)::int n ${from} WHERE ${where}`,params)).rows[0].n;
 if(input.issueId&&!total)throw new ImportError("NOT_FOUND",404);
 const rows=(await ctx.db.query(`SELECT d.id,d.code,d.severity,d."group",d.source_order_id,
  coalesce((SELECT jsonb_agg(jsonb_build_object('file',r.file,'line',r.line_number)) FROM
  (SELECT file,line_number FROM raw_rows WHERE factory_id=d.factory_id AND import_id=d.import_id
   AND id=ANY(d.raw_row_ids) ORDER BY file,line_number LIMIT 3) r),'[]') refs
  ${from} WHERE ${where} ORDER BY CASE d.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,d.code,d.id
  LIMIT 20 OFFSET $10`,[...params,(page-1)*20])).rows;
 const blocks:AiAssistBlock[]=rows.map(r=>{
  const [meaning,why,check]=issueAdvice(r.code,input.language);
  const refs=r.refs.map((ref:{file:string;line:number})=>`${ref.file}:${ref.line}`).join(", ");
  let text=ar?`${meaning}\nلماذا يهم: ${why}\nما يجب فحصه: ${check}${refs?`\nافتح الصفوف المصدر: ${refs}`:""}`:
   `${meaning}\nWhy it matters: ${why}\nWhat to check: ${check}${refs?`\nOpen source rows: ${refs}`:""}`;
  if(r.severity==="error")text+=ar?"\nالأرقام المتأثرة في الشرح غير متوفرة حتى معالجة المشكلة.":"\nAffected figures in the explanation are Not available until the issue is addressed.";
  return {id:r.id,type:"SUGGESTION",title:`${r.code}${r.source_order_id?` — ${r.source_order_id}`:""}`,text,facts:[],
   href:input.importId?`/imports?id=${input.importId}&step=check`:`/quality?issue=${r.id}`};
 });
 // Only fixed catalogue codes, severities/groups and opaque IDs are ranked.
 // Local text contains filenames/lines and MUST NEVER be provider material.
 const ranking=rows.map(r=>({id:r.id,code:r.code,severity:r.severity,group:r.group}));
 return {blocks,total,page,ranking};
}
