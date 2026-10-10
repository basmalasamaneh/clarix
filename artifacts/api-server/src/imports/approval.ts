import { fmt } from "@workspace/calculation";
import {insertCanonicalBatch} from "./canonical-batch";
import { ImportError } from "./model";
import {replacementOrders,assertChoices,issues} from "./review";
import {assertActiveSource} from "./sources";
import { duplicate,replacementCount,runEngine,loadRaw,getRow,view,type Context,type ImportRow } from "./service";

export async function approve(ctx:Context,row:ImportRow,input:{confirmReplacement:boolean;replacementCount:number;confirmErrors?:boolean}) {
  if(row.status!=="checked") throw new ImportError("CHECK_REQUIRED",409);
  // Serializes approvals in a factory, including different sources, to close
  // duplicate-hash and replacement-confirmation races. RLS remains in force.
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[ctx.factory]);
  await assertActiveSource(ctx,row.source_name);
  await assertChoices(ctx,row);
  if((row.counts?.error??0)>0 && !input.confirmErrors) throw new ImportError("ERROR_CONFIRMATION_REQUIRED",409,{errors:(await issues(ctx,row,1,true)).items,errorCount:row.counts!.error});
  const existing=await duplicate(ctx,row);
  if(existing) throw new ImportError("DUPLICATE_FILE",409,{existingImportId:existing});
  const replacing=await replacementCount(ctx,row);
  const replaced=await replacementOrders(ctx,row);
  if(replacing!==input.replacementCount || replacing>0 && !input.confirmReplacement) throw new ImportError("REPLACEMENT_CONFIRMATION_REQUIRED",409,{replacementCount:replacing});
  const {canonical,result}=await runEngine(ctx,row);
  if(JSON.stringify(result)!==JSON.stringify(row.result)) {
    // PostgreSQL JSONB key ordering is not an equality contract.
    const same=(await ctx.db.query("SELECT $1::jsonb = $2::jsonb AS same",[JSON.stringify(result),JSON.stringify(row.result)])).rows[0].same;
    if(!same) throw new ImportError("CHECK_REQUIRED",409);
  }
  const raw=await loadRaw(ctx,row);
  const rawIds=new Map(raw.map(r=>[`${r.file}:${r.line_number}`,r.id]));
  const rawId=(file:string,line:number)=>rawIds.get(`${file}:${line}`);
  const orderSpec=canonical.mapping.files.orders;
  for(const sourceId of canonical.orders) {
    let current=(await ctx.db.query("SELECT * FROM orders WHERE factory_id=$1 AND source_name=$2 AND source_order_id=$3 FOR UPDATE",[ctx.factory,row.source_name,sourceId])).rows[0];
    if(current?.current_import_id) {
      await ctx.db.query(`INSERT INTO orders_history(factory_id,source_name,source_id,order_id,original_import_id,superseded_by_import_id,payload)
        SELECT factory_id,source_name,source_order_id,id,current_import_id,$3,to_jsonb(o) FROM orders o WHERE factory_id=$1 AND id=$2`,
        [ctx.factory,current.id,row.id]);
      // Archive before removal from current tables, in the SAME transaction.
      // No user-facing deletion exists; previous values live in append-only history.
      for(const [table,history,idColumn] of [
        ["production_records","production_records_history","record_id"],["events","events_history","event_id"],
      ]) {
        await ctx.db.query(`INSERT INTO ${history}(factory_id,source_name,source_id,order_id,original_import_id,raw_row_id,superseded_by_import_id,payload)
          SELECT c.factory_id,c.source_name,c.${idColumn},c.order_id,r.import_id,c.raw_row_id,$3,to_jsonb(c)
          FROM ${table} c JOIN raw_rows r ON r.factory_id=c.factory_id AND r.id=c.raw_row_id
          WHERE c.factory_id=$1 AND c.order_id=$2`,[ctx.factory,current.id,row.id]);
        await ctx.db.query(`DELETE FROM ${table} WHERE factory_id=$1 AND order_id=$2`,[ctx.factory,current.id]);
      }
    }
    const orderRaw=raw.find(r=>r.file===orderSpec.file && r.cells[orderSpec.columns.order_id]?.trim()===sourceId);
    const text=(key:string)=>orderRaw?.cells[orderSpec.columns[key]]?.trim()||null;
    current=(await ctx.db.query(`INSERT INTO orders(factory_id,source_name,source_order_id,product,line,machine,mold,current_import_id,metrics)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(factory_id,source_name,source_order_id) DO UPDATE SET product=excluded.product,line=excluded.line,
        machine=excluded.machine,mold=excluded.mold,current_import_id=excluded.current_import_id,metrics=excluded.metrics RETURNING id`,
      [ctx.factory,row.source_name,sourceId,text("product_code"),text("line_id"),text("machine_id"),text("mold_id"),row.id,JSON.stringify(result.runs[sourceId])])).rows[0];
    const run=result.runs[sourceId];
    const recordRefs=new Set(run.volume.source_lines);
    await insertCanonicalBatch(ctx,row.source_name,current.id,"records",
      canonical.records.filter(r=>r.order===sourceId && recordRefs.has(`${r.file}:${r.line}`)).map(r=>({
        record_id:r.rid,shift:r.shift||null,date:r.date||null,input:fmt(r.input),good:fmt(r.good),scrap:fmt(r.scrap),unit:r.unit,raw_row_id:rawId(r.file,r.line),
      })));
    const eventRefs=new Set([...run.changeover.source_lines,...run.downtime.source_lines]);
    await insertCanonicalBatch(ctx,row.source_name,current.id,"events",canonical.events.filter(e=>e.order===sourceId && eventRefs.has(`${e.file}:${e.line}`)).map(e=>{
      const stamp=(d:NonNullable<typeof e.start>)=>new Date(d.mul(1000).toNumber()).toISOString().replace("T"," ").replace("Z","");
      return {event_id:e.eid,event_code:e.code,type:canonical.mapping.event_code_map[e.code],start:stamp(e.start!),end:stamp(e.end!),duration_min:fmt(e.duration),reason:e.reason,raw_row_id:rawId(e.file,e.line)};
    }));
    await ctx.db.query("UPDATE data_issues SET order_id=$4 WHERE factory_id=$1 AND import_id=$2 AND source_order_id=$3",[ctx.factory,row.id,sourceId,current.id]);
  }
  await ctx.db.query("UPDATE imports SET status='approved',approved_at=now(),replaced_orders=$3 WHERE factory_id=$1 AND id=$2",[ctx.factory,row.id,JSON.stringify(replaced)]);
  await ctx.db.query("UPDATE factories SET last_approved_at=now() WHERE id=$1",[ctx.factory]);
  return view(ctx,await getRow(ctx,row.id));
}
