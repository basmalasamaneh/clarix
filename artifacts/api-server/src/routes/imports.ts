import { Router,type Request,type Response,type NextFunction } from "express";
import { z } from "zod";
import { CreateImportBody,SaveImportMappingBody,ApproveImportBody,CreateImportTemplateBody } from "@workspace/api-zod";
import { CellReadError } from "@workspace/calculation";
import { withRequestTenant,TenantAccessError } from "../lib/tenancy";
import { ImportError,limitConfig,validateMapping } from "../imports/model";
import * as service from "../imports/service";
import { approve } from "../imports/approval";
import {eventCodes,issues} from "../imports/review";
import * as sources from "../imports/sources";
const router=Router();
type Action=(ctx:service.Context,req:Request,res:Response)=>Promise<void>;
function route(action:Action,allowViewer=false) {
  return async(req:Request,res:Response,next:NextFunction)=>{
    try {
      if(!req.session.userId) throw new ImportError("UNAUTHENTICATED",401);
      if(!req.session.activeFactoryId || res.locals.identity?.user?.platformAdmin) throw new ImportError("FORBIDDEN",403);
      if(req.params.id && !z.string().uuid().safeParse(req.params.id).success) throw new ImportError("NOT_FOUND",404);
      let code=200; let payload:unknown;
      // Never send a success before COMMIT: deferred constraints or a failed
      // transaction must be able to return an error rather than false approval.
      const output={status(n:number){code=n;return this;},json(value:unknown){payload=value;return this;}} as Response;
      await withRequestTenant(req,async db=>{
        const {rows}=await db.query("SELECT m.role,f.settings FROM memberships m JOIN factories f ON m.factory_id=f.id WHERE m.user_id=$1 AND m.factory_id=$2",[req.session.userId,req.session.activeFactoryId]);
        if(!(allowViewer?["factory_manager","analyst","viewer"]:["factory_manager","analyst"]).includes(rows[0]?.role)) throw new ImportError("FORBIDDEN",403);
        await action({db,factory:req.session.activeFactoryId!,user:req.session.userId!,userName:res.locals.identity?.user?.name,settings:rows[0].settings??{}},req,output);
      });
      res.status(code).json(payload);
    } catch(e) {
      if(e instanceof ImportError) {res.status(e.status).json({error:e.code,details:e.details});return;}
      if(e instanceof TenantAccessError) {res.status(403).json({error:"FORBIDDEN"});return;}
      if(e instanceof CellReadError) {res.status(422).json({error:e.code,details:{file:e.file,line:e.line,column:e.column}});return;}
      if(e instanceof z.ZodError) {res.status(400).json({error:"INVALID_INPUT"});return;}
      if(e && typeof e==="object" && "code" in e && e.code==="23505") {res.status(409).json({error:"SOURCE_ID_CONFLICT"});return;}
      // Parse errors never crash the server, and never dump CSV contents in logs.
      if(e instanceof Error && /Invalid|Missing|Unknown order|Expected one|Comparison requires|Unsupported|Non-finite|Duplicate|Malformed|Unclosed/.test(e.message)) {
        res.status(422).json({error:"INVALID_MAPPING_OR_DATA",details:{message:e.message}});return;
      }
      next(e);
    }
  };
}
const page=(raw:unknown)=>z.coerce.number().int().min(1).max(1000000).parse(raw??1);
const id=(req:Request)=>String(req.params.id);
router.get("/data-sources",route(async(ctx,req,res)=>{res.json(await sources.listSources(ctx,page(req.query.page),String(req.query.search??"")));}));
router.post("/data-sources/recommend",route(async(ctx,req,res)=>{
  const input=z.object({files:z.array(z.object({name:z.string(),headers:z.array(z.string()).max(1000)})).max(4)}).parse(req.body);
  res.json(await sources.recommendSource(ctx,input.files));
}));
router.patch("/data-sources/archive",route(async(ctx,req,res)=>{
  const input=z.object({sourceName:z.string().trim().min(1).max(200),archived:z.boolean()}).parse(req.body);
  res.json(await sources.archiveSource(ctx,input.sourceName,input.archived));
}));
router.get("/source-runs",route(async(ctx,req,res)=>{res.json(await sources.sourceRuns(ctx,page(req.query.page),String(req.query.search??"")));},true));
router.get("/source-comparison",route(async(ctx,req,res)=>{
  const input=z.object({left:z.string().uuid(),right:z.string().uuid()}).parse(req.query);
  res.json(await sources.sourcePair(ctx,input.left,input.right));
},true));
router.get("/imports/config",route(async(ctx,_req,res)=>{res.json(limitConfig(ctx.settings));}));
router.get("/imports",route(async(ctx,req,res)=>{
  const p=page(req.query.page);
  const result=await ctx.db.query("SELECT * FROM imports WHERE factory_id=$1 ORDER BY created_at DESC,id LIMIT 20 OFFSET $2",[ctx.factory,(p-1)*20]);
  const total=(await ctx.db.query("SELECT count(*)::int AS n FROM imports WHERE factory_id=$1",[ctx.factory])).rows[0].n;
  res.json({items:await Promise.all(result.rows.map(r=>service.view(ctx,r))),page:p,total});
}));
router.post("/imports",route(async(ctx,req,res)=>{res.status(201).json(await service.create(ctx,CreateImportBody.parse(req.body)));}));
router.get("/imports/:id",route(async(ctx,req,res)=>{res.json(await service.view(ctx,await service.getRow(ctx,id(req)),true));}));
router.post("/imports/:id/finalize",route(async(ctx,req,res)=>{res.json(await service.finalize(ctx,await service.getRow(ctx,id(req),true)));}));
router.put("/imports/:id/mapping",route(async(ctx,req,res)=>{res.json(await service.saveMapping(ctx,await service.getRow(ctx,id(req),true),SaveImportMappingBody.parse(req.body).mapping));}));
router.post("/imports/:id/check",route(async(ctx,req,res)=>{res.json(await service.check(ctx,await service.getRow(ctx,id(req),true)));}));
router.post("/imports/:id/event-codes",route(async(ctx,req,res)=>{
  const row=await service.getRow(ctx,id(req));
  const mapping=z.object({files:z.object({events:z.object({file:z.string(),columns:z.record(z.string())}).optional()}),event_code_map:z.record(z.string()).default({}),ignored_event_codes:z.array(z.string()).default([])}).parse(req.body.mapping);
  res.json(await eventCodes(ctx,row,mapping as any));
}));
router.get("/imports/:id/errors",route(async(ctx,req,res)=>{res.json(await issues(ctx,await service.getRow(ctx,id(req)),1,true));}));
router.post("/imports/:id/approve",route(async(ctx,req,res)=>{res.json(await approve(ctx,await service.getRow(ctx,id(req),true),ApproveImportBody.parse(req.body)));}));
router.post("/imports/:id/reject",route(async(ctx,req,res)=>{
  const row=await service.getRow(ctx,id(req),true);service.editable(row);
  await ctx.db.query("UPDATE imports SET status='rejected' WHERE factory_id=$1 AND id=$2",[ctx.factory,row.id]);
  res.json(await service.view(ctx,await service.getRow(ctx,row.id)));
}));
router.get("/imports/:id/issues/:page",route(async(ctx,req,res)=>{
  res.json(await issues(ctx,await service.getRow(ctx,id(req)),page(req.params.page)));
}));
router.get("/import-templates",route(async(ctx,req,res)=>{
  const p=page(req.query.page),source=typeof req.query.source==="string"?req.query.source:null;
  const params=[ctx.factory,source];
  const filter="factory_id=$1 AND ($2::text IS NULL OR source_name=$2)";
  const {rows}=await ctx.db.query(`SELECT id,name,source_name AS "sourceName",version,mapping FROM column_mappings WHERE ${filter} ORDER BY source_name,version DESC LIMIT 20 OFFSET $3`,[...params,(p-1)*20]);
  const total=(await ctx.db.query(`SELECT count(*)::int AS n FROM column_mappings WHERE ${filter}`,params)).rows[0].n;
  res.json({items:rows,page:p,total});
}));
router.post("/import-templates",route(async(ctx,req,res)=>{
  const input=CreateImportTemplateBody.parse(req.body);
  const data=input.mapping as unknown as {files:Record<string,{file:string}>};
  const mapping=validateMapping(input.mapping,input.sourceName,Object.values(data.files??{}).map(f=>f.file));
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))",[ctx.factory+":"+input.sourceName]);
  const {rows}=await ctx.db.query(`INSERT INTO column_mappings(factory_id,source_name,name,version,mapping)
    SELECT $1,$2,$3,coalesce(max(version),0)+1,$4 FROM column_mappings WHERE factory_id=$1 AND source_name=$2
    RETURNING id,name,source_name AS "sourceName",version,mapping`,[ctx.factory,input.sourceName,input.name,JSON.stringify(mapping)]);
  res.status(201).json(rows[0]);
}));
export default router;
