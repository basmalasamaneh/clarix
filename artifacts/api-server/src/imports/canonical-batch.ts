import type {Context} from "./service";
// JSON decimal strings are cast by PostgreSQL directly to numeric, never via
// a JavaScript Number. Ordinary INSERT preserves RLS, FK checks and triggers.
export async function insertCanonicalBatch(ctx:Context,source:string,order:string,kind:"records"|"events",rows:Record<string,unknown>[]) {
  const query=kind==="records"?`INSERT INTO production_records(factory_id,source_name,order_id,record_id,shift,date,input,good,scrap,unit,raw_row_id)
    SELECT $1,$2,$3,x.* FROM jsonb_to_recordset($4::jsonb) AS x(record_id text,shift text,date date,input numeric,good numeric,scrap numeric,unit text,raw_row_id uuid)`:
    `INSERT INTO events(factory_id,source_name,order_id,event_id,event_code,type,start,"end",duration_min,reason,raw_row_id)
    SELECT $1,$2,$3,x.* FROM jsonb_to_recordset($4::jsonb) AS x(event_id text,event_code text,type text,start timestamp,"end" timestamp,duration_min numeric,reason text,raw_row_id uuid)`;
  for(let offset=0;offset<rows.length;offset+=1000)
    await ctx.db.query(query,[ctx.factory,source,order,JSON.stringify(rows.slice(offset,offset+1000))]);
}
