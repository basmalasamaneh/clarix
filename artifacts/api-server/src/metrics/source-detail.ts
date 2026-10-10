import {D,fmt,parseNumber,parseLocalTime,type Mapping,type Run} from "@workspace/calculation";
import type {SourceDetail,SourceRow,SourceText,RunIssue} from "@workspace/api-zod";
import type {Context} from "../imports/service";
import {ImportError} from "../imports/model";
import {getRuns,compare} from "./service";
import {definitions,formatted} from "./values";

const text=(en:string,ar:string):SourceText=>({en,ar});
const na=text("Not available","غير متوفر");
const formulas:Record<string,SourceText>={
  input_kg:text("Input = sum of included input quantities converted to kg","المدخلات = مجموع كميات المدخلات المحتسبة بعد تحويلها إلى كغ"),
  good_kg:text("Good output = sum of included good quantities converted to kg","الإنتاج الجيد = مجموع كميات الإنتاج الجيد المحتسبة بعد تحويلها إلى كغ"),
  scrap_kg:text("Scrap = sum of included scrap quantities converted to kg","الهدر = مجموع كميات الهدر المحتسبة بعد تحويلها إلى كغ"),
  scrap_rate_pct:text("Scrap rate = scrap / input × 100","نسبة الهدر = الهدر / المدخلات × 100"),
  good_rate_pct:text("Good output rate = good output / input × 100","نسبة الإنتاج الجيد = الإنتاج الجيد / المدخلات × 100"),
  material_balance_kg:text("Material balance = input − good output − scrap","ميزان المواد = المدخلات − الإنتاج الجيد − الهدر"),
  changeover_min:text("Changeover = sum of end − start for included CHANGEOVER events, in minutes","تغيير القالب = مجموع النهاية − البداية لأحداث تغيير القالب المحتسبة بالدقائق"),
  downtime_min:text("Unplanned downtime = sum of end − start for included UNPLANNED_DOWNTIME events, in minutes","التوقف غير المخطط = مجموع النهاية − البداية لأحداث التوقف غير المخطط المحتسبة بالدقائق"),
  date:text("First production date = earliest included production record date","أول تاريخ إنتاج = أقدم تاريخ لسجلات الإنتاج المحتسبة"),
};
type Raw={id:string;file:string;line:number;cells:Record<string,string>};
type Stored={id:string;source_name:string;approved_at:Date;mapping:Mapping;result:{runs:Record<string,Run>}};
type Issue=RunIssue & {rawIds:string[]};
async function load(ctx:Context,importId:string,orderId:string|null) {
  const imp=(await ctx.db.query("SELECT id,source_name,approved_at,mapping,result FROM imports WHERE factory_id=$1 AND id=$2 AND status='approved'",[ctx.factory,importId])).rows[0] as Stored|undefined;
  if(!imp) throw new ImportError("NOT_FOUND",404);
  const issues=(await ctx.db.query(`SELECT id,code,severity,"group",source_order_id AS "orderId",raw_row_ids AS "rawIds",$4::text AS "sourceName"
    FROM data_issues WHERE factory_id=$1 AND import_id=$2 AND (source_order_id=$3 OR source_order_id IS NULL) ORDER BY code,id`,
    [ctx.factory,importId,orderId,imp.source_name])).rows as Issue[];
  return {imp,issues};
}
function rowView(raw:Raw,imp:Stored,orderId:string|null,run:Run|undefined,issues:Issue[]):SourceRow {
  const spec=Object.values(imp.mapping.files).find(s=>s?.file===raw.file)!;
  const cell=(field:string)=>raw.cells[spec.columns[field]]??"";
  const numeric=(field:string)=>parseNumber(cell(field),imp.mapping.format.decimal_separator);
  const ref=`${raw.file}:${raw.line}`;
  const groups=run?[run.volume,run.changeover,run.downtime]:[];
  const kind=groups.some(g=>g.quarantined_source_lines.includes(ref))?"quarantined":
    groups.some(g=>g.excluded_source_lines.includes(ref))?"excluded":
    groups.some(g=>g.source_lines.includes(ref))?"included":"related";
  const ownIssues=issues.filter(i=>i.rawIds.includes(raw.id));
  const unit=(spec.fixed_unit||cell("unit")||(raw.file===imp.mapping.files.totals?.file?"kg":"")).trim().toLowerCase();
  const factor=Object.entries(imp.mapping.unit_factors_to_kg).find(([k])=>k.toLowerCase()===unit)?.[1];
  const contributions:SourceRow["contributions"]=[];
  if(raw.file===imp.mapping.files.records?.file||raw.file===imp.mapping.files.totals?.file) {
    for(const field of ["input","good","scrap"]) {
      const n=numeric(field);
      // Level 1 engine values are supplied kg totals; only record-level
      // quantities go through unit conversion. Explain, do not reinterpret.
      contributions.push({key:`${field}_kg`,value:imp.mapping.capability_level===1?fmt(n):n!==null&&factor?fmt(n.mul(factor)):null,unit:"kg"});
    }
    if(imp.mapping.capability_level===1) {
      const hours=numeric("changeover_hours"),stop=numeric("downtime_min");
      contributions.push({key:"changeover_min",value:hours===null?null:fmt(hours.mul(60)),unit:"min"},
        {key:"downtime_min",value:fmt(stop),unit:"min"});
    }
  }
  let event:SourceRow["event"];
  if(raw.file===imp.mapping.files.events?.file) {
    const start=parseLocalTime(cell("start").trim(),imp.mapping.format.datetime_format);
    const end=parseLocalTime(cell("end").trim(),imp.mapping.format.datetime_format);
    const minutes=start!==null&&end!==null?fmt(end.sub(start).div(60)):null;
    event={type:imp.mapping.event_code_map[cell("event_code").trim()]??"UNMAPPED",start:cell("start"),end:cell("end"),minutes};
    contributions.push({key:event.type==="CHANGEOVER"?"changeover_min":"downtime_min",value:minutes,unit:"min"});
  }
  const cells=Object.entries(raw.cells).map(([column,value])=>{
    const field=Object.entries(spec.columns).find(([,c])=>c===column)?.[0];
    let reason=text("","");
    if(ownIssues.some(i=>i.code==="MISSING_VALUE")&&["input","good","scrap"].includes(field??"")&&!value.trim())
      reason=text("This quantity is missing; it is not treated as zero.","هذه الكمية مفقودة ولا تُعامل كصفر.");
    else if(ownIssues.some(i=>i.code==="MISSING_REQUIRED_FIELD")&&!value.trim()&&["record_id","event_id","order_id","start","end"].includes(field??""))
      reason=text("Required cell is missing.","خلية مطلوبة مفقودة.");
    else if(ownIssues.some(i=>i.code==="INCOMPATIBLE_UNIT")&&field==="unit"&&!factor)
      reason=text("This unit cannot be converted to kg.","لا يمكن تحويل هذه الوحدة إلى كغ.");
    else if(ownIssues.some(i=>i.code==="ZERO_INPUT")&&field==="input")
      reason=text("Total input is zero; rates cannot be calculated.","إجمالي المدخلات صفر؛ لا يمكن حساب النسب.");
    else if(ownIssues.some(i=>i.code==="UNMAPPED_EVENT_CODE")&&field==="event_code")
      reason=text("This event code is not counted in the metrics.","رمز الحدث هذا لا يُحتسب في المقاييس.");
    else if(ownIssues.some(i=>["INVALID_TIME_RANGE","POSSIBLE_OVERLAP"].includes(i.code))&&["start","end"].includes(field??""))
      reason=text("These timestamps are involved in the reported time issue.","هذه الأوقات مرتبطة بمشكلة الزمن المذكورة.");
    else if(ownIssues.some(i=>i.code==="DURATION_MISMATCH")&&["start","end","duration_min"].includes(field??""))
      reason=text("Timestamps are authoritative, not the entered duration.","تُعتمد الأوقات الفعلية وليس المدة المدخلة.");
    else if(ownIssues.some(i=>i.code.startsWith("DUPLICATE_")||i.code.startsWith("SUSPECTED_DUPLICATE"))&&["record_id","event_id","input","good","scrap","record_date","shift","start","end"].includes(field??""))
      reason=text("Compare this cell with the related record.","قارن هذه الخلية بالسجل المرتبط.");
    return {column,value,highlighted:!!reason.en,reason};
  });
  return {id:raw.id,importId:imp.id,sourceName:imp.source_name,orderId,file:raw.file,line:raw.line,kind,cells,contributions,...(event?{event}:{})};
}
function duplicatePairs(rows:Raw[],imp:Stored,run:Run|undefined,issues:Issue[],order:string|null) {
  if(!run||!issues.some(i=>i.code==="SUSPECTED_DUPLICATE_RECORD")) return [];
  const spec=imp.mapping.files.records;
  if(!spec) return [];
  const seen=new Map<string,Raw>(),pairs:SourceDetail["duplicatePairs"]=[];
  for(const row of rows.filter(r=>r.file===spec.file&&run.volume.source_lines.includes(`${r.file}:${r.line}`))) {
    const v=(key:string)=>(row.cells[spec.columns[key]]??"").trim();
    const signature=JSON.stringify([v("order_id"),v("shift"),fmt(parseLocalTime(v("record_date"),imp.mapping.format.date_format)),
      ...["input","good","scrap"].map(k=>fmt(parseNumber(v(k),imp.mapping.format.decimal_separator))),
      (spec.fixed_unit||v("unit")).toLowerCase()]);
    const original=seen.get(signature);
    if(original) pairs.push({original:rowView(original,imp,order,run,issues),suspected:rowView(row,imp,order,run,issues)});
    else seen.set(signature,row);
  }
  return pairs;
}
function explanation(key:string,run:Run|undefined,rows:SourceRow[],value:string|null,unit:string):{inputs:SourceDetail["inputs"];breakdown:SourceText} {
  const volume=run?.volume;
  const dependencies=key==="scrap_rate_pct"?["scrap_kg","input_kg"]:key==="good_rate_pct"?["good_kg","input_kg"]:
    key==="material_balance_kg"?["input_kg","good_kg","scrap_kg"]:[];
  const inputs=dependencies.map(k=>({key:k,value:(volume as unknown as Record<string,string|null>)?.[k]??null,unit:"kg"}));
  if(value===null) return {inputs,breakdown:na};
  if(dependencies.length) {
    const vals=inputs.map(i=>i.value??"?");
    const expression=dependencies.length===3?`${vals[0]} − ${vals[1]} − ${vals[2]}`:`${vals[0]} / ${vals[1]} × 100`;
    return {inputs,breakdown:text(`${expression} = ${value} ${unit}`,`${expression} = ${value} ${unit}`)};
  }
  const parts=rows.filter(r=>r.kind==="included").flatMap(r=>r.contributions.filter(c=>c.key===key).map(c=>c.value));
  const expression=parts.length?`${parts.map(v=>v??"?").join(" + ")} = ${value} ${unit}`:`${value} ${unit}`;
  return {inputs,breakdown:text(expression,expression)};
}
async function single(ctx:Context,importId:string,orderId:string|null,key:string,metricValue:string|null,metricDisplay:string|null,unit:string,issueId?:string) {
  const {imp,issues:allIssues}=await load(ctx,importId,orderId),run=orderId?imp.result.runs[orderId]:undefined;
  const def=definitions.find(d=>d.key===key);
  const metricGroup=key==="date"?"volume":def?.group;
  const selectedIssue=issueId?allIssues.find(i=>i.id===issueId):undefined;
  if(issueId&&!selectedIssue) throw new ImportError("NOT_FOUND",404);
  const issues=allIssues.filter(i=>issueId?i.id===issueId:!metricGroup||i.group==="file"||i.group==="all"||i.group.split(",").includes(metricGroup));
  const groups=run?(metricGroup?[run[metricGroup]]:[run.volume,run.changeover,run.downtime]):[];
  const refs=new Set(groups.flatMap(g=>[...g.source_lines,...g.excluded_source_lines,...g.quarantined_source_lines]));
  const rawIds=[...new Set(issues.flatMap(i=>i.rawIds))];
  // Fetch only this approved import under the authenticated tenant. Historical
  // quality issues use their original import, never the current order version.
  const raw=(await ctx.db.query(`SELECT id,file,line_number AS line,cells FROM raw_rows WHERE factory_id=$1 AND import_id=$2
    AND (id=ANY($3::uuid[]) OR file||':'||line_number::text=ANY($4::text[]))
    ORDER BY file,line_number`,[ctx.factory,imp.id,rawIds,[...refs]])).rows as Raw[];
  const pairs=duplicatePairs(raw,imp,run,issues,orderId);
  const relevant=issueId?raw.filter(r=>rawIds.includes(r.id)||pairs.some(p=>p.original.id===r.id||p.suspected.id===r.id)):raw;
  const rows=relevant.map(r=>rowView(r,imp,orderId,run,issues));
  const alternatives:SourceDetail["alternatives"]=[];
  for(const d of definitions.filter(d=>run&&(issueId||d.key===key))) {
    for(const [altKey,alt] of Object.entries(run![d.group].alternatives)) {
      const val=typeof alt==="object"&&alt!==null?(alt as Record<string,string|null>)[d.field]:alt;
      if(val!==undefined) alternatives.push({key:altKey,metric:d.key,value:formatted(val as string|null,d.unit),unit:d.unit});
    }
  }
  const notes:SourceText[]=[];
  if(issues.some(i=>i.code==="POSSIBLE_OVERLAP")) for(const overlap of run?.overlaps??[]) {
    notes.push(text(
      `Recorded overlap: stop ${overlap.stop_event_id} and changeover ${overlap.changeover_event_id}: ${overlap.overlap_min??"Not available"} minutes. This does not establish a cause.`,
      `تداخل مسجّل: التوقف ${overlap.stop_event_id} وتغيير القالب ${overlap.changeover_event_id}: ${overlap.overlap_min??"غير متوفر"} دقيقة. هذا لا يثبت علاقة سببية.`));
  }
  for(const [unitName,factor] of Object.entries(imp.mapping.unit_factors_to_kg)) {
    if(imp.mapping.capability_level===1) break;
    if(new D(factor).eq(1)) continue;
    const used=raw.some(r=>{
      const spec=Object.values(imp.mapping.files).find(s=>s?.file===r.file)!;
      return (spec.fixed_unit||r.cells[spec.columns.unit]||"").trim().toLowerCase()===unitName.toLowerCase();
    });
    if(used) notes.push(text(`Unit conversion: 1 ${unitName} = ${factor} kg. Original cells remain unchanged.`,
      `تحويل الوحدة: 1 ${unitName} = ${factor} كغ. تبقى الخلايا الأصلية دون تغيير.`));
  }
  if(key==="downtime_min"||rows.some(r=>r.event?.type==="UNPLANNED_DOWNTIME"))
    notes.push(text("Recorded separately. Not included in changeover time and not assumed to be a cause of scrap.","مسجّلة بشكل منفصل. لا تُحتسب ضمن زمن تغيير القالب ولا يُفترض أنها سبب الهدر."));
  if(key==="downtime_min"&&metricValue==="0"&&run?.downtime.event_count===0)
    notes.push(text("No events recorded (0). This is not missing data.","لا أحداث مسجلة (0). هذه ليست بيانات مفقودة."));
  if(issues.some(i=>i.code==="NO_CHANGEOVER_EVENT"))
    notes.push(text("No changeover event was recorded. Changeover time is not available, not zero.","لم يُسجّل حدث لتغيير القالب. زمن تغيير القالب غير متوفر وليس صفراً."));
  if(imp.mapping.capability_level===1) notes.push(text("Totals-only source: supplied totals, not a reconstruction of individual events.","مصدر إجماليات فقط: إجماليات مقدّمة وليست إعادة بناء لأحداث منفردة."));
  if(key==="date") notes.push(text("Rows show the production dates used to select the earliest included date.","تُظهر الصفوف تواريخ الإنتاج المستخدمة لاختيار أقدم تاريخ محتسب."));
  const formula=issueId?text("Original rows related to this issue; no correction is applied.","الصفوف الأصلية المرتبطة بهذه المشكلة؛ لا يُطبّق أي تصحيح."):
    imp.mapping.capability_level===1&&key==="changeover_min"?text("Changeover minutes = supplied hours × 60","دقائق تغيير القالب = الساعات المقدّمة × 60"):formulas[key];
  return {key,value:metricValue,display:metricDisplay,unit,formula,notes,
    ...explanation(key,run,rows,metricValue,unit),rows,total:rows.length,page:1,
    imports:[{id:imp.id,sourceName:imp.source_name,orderId,approvedAt:imp.approved_at.toISOString()}],
    issues:issues.map(({rawIds,...i})=>i),alternatives,duplicatePairs:pairs} satisfies SourceDetail;
}
export async function sourceDetail(ctx:Context,input:{kind:"metric"|"issue";id:string;metric?:string;other?:string;page:number}):Promise<SourceDetail> {
  let result:SourceDetail;
  if(input.kind==="issue") {
    const issue=(await ctx.db.query("SELECT import_id,source_order_id,code FROM data_issues WHERE factory_id=$1 AND id=$2",[ctx.factory,input.id])).rows[0];
    if(!issue) throw new ImportError("NOT_FOUND",404);
    result=await single(ctx,issue.import_id,issue.source_order_id,issue.code,null,null,"",input.id);
  } else {
    const key=input.metric??"";
    if(!formulas[key]) throw new ImportError("NOT_FOUND",404);
    const [a,...others]=await getRuns(ctx,input.other?[input.id,input.other]:[input.id]);
    const metric=a.metrics.find(m=>m.key===key);
    result=await single(ctx,a.importId,a.orderId,key,key==="date"?a.date:metric!.value,key==="date"?a.date:metric!.display,metric?.unit??"");
    if(others.length) {
      if(key==="date") throw new ImportError("NOT_FOUND",404);
      const b=others[0],m=b.metrics.find(m=>m.key===key)!;
      const right=await single(ctx,b.importId,b.orderId,key,m.value,m.display,m.unit);
      const difference=(await compare(ctx,a.id,b.id)).differences.find(m=>m.key===key)!;
      result={...result,value:difference.value,display:difference.display,unit:difference.unit,
        formula:text("Difference = Run B − Run A","الفرق = الدفعة ب − الدفعة أ"),
        inputs:[{key:"run_b",value:m.value,unit:m.unit},{key:"run_a",value:metric!.value,unit:metric!.unit}],
        breakdown:difference.value===null?na:text(`${m.value} − ${metric!.value} = ${difference.value} ${difference.unit}`,`${m.value} − ${metric!.value} = ${difference.value} ${difference.unit}`),
        rows:[...result.rows,...right.rows],imports:[...result.imports,...right.imports],issues:[...result.issues,...right.issues],
        duplicatePairs:[...result.duplicatePairs,...right.duplicatePairs],notes:[...result.notes,...right.notes],
        alternatives:[]};
    }
  }
  return {...result,page:input.page,total:result.rows.length,rows:result.rows.slice((input.page-1)*20,input.page*20)};
}
