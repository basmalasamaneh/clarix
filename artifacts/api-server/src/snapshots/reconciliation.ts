import {D,fmt} from "@workspace/calculation";
import type {ReportFigures,RunComparison,ReconciliationResult,ReconciliationFigure,SourceText} from "@workspace/api-zod";
import {ImportError} from "../imports/model";
import {NBSP,isUnitKey,unitWord} from "../metrics/number-format";
const keys=["input_kg","good_kg","scrap_kg","changeover_min","downtime_min"] as const;
const text=(en:string,ar:string):SourceText=>({en,ar});
export function reconcile(comparison:RunComparison,input:ReportFigures):ReconciliationResult {
  const figures:ReconciliationFigure[]=[];
  for(const side of ["a","b"] as const) for(const key of keys) {
    const m=comparison[side].metrics.find(m=>m.key===key)!;
    const raw=(input[side][key]??"").trim();
    // Decimal strings only. No exponent, locale guessing, floats or empty=>zero.
    if(raw&&!/^-?\d{1,30}(?:\.\d{1,30})?$/.test(raw)) throw new ImportError("INVALID_REPORT_NUMBER",400);
    const reported=raw?fmt(new D(raw)):null;
    const blocked=m.status==="red"||m.value===null;
    // Report subtraction must retain every supplied digit. Use a private
    // context sized for both operands; never alter the locked engine context.
    const Exact=D.clone({precision:Math.max(80,(m.value?.length??0)+(reported?.length??0)+2)});
    const difference=reported!==null&&!blocked?fmt(new Exact(reported).sub(m.value!)):null;
    const result=reported===null?"not_provided":blocked?"unavailable":new D(difference!).isZero()?"matches":"differs";
    // User chose group-wide refusal for reconciliation, distinct from tables.
    const reason=blocked?m.status==="red"
      ?text("This metric group is blocked. Review its Data Quality issues.","مجموعة المقاييس هذه محجوبة. راجع مشكلاتها في جودة البيانات.")
      :text("Clarix has no available value for this figure.","لا تتوفر لدى Clarix قيمة لهذا الرقم.")
      :text("","");
    const q=(v:string|null,lang:"en"|"ar")=>`${v}${NBSP}${isUnitKey(m.unit)?unitWord(v??"",m.unit,lang,lang==="en"?{style:"long"}:{}):m.unit}`;
    const sentence=result==="not_provided"?text("Not provided","لم يُقدَّم"):
      result==="unavailable"?text(`Cannot be reconciled — ${reason.en}`,`لا يمكن المطابقة — ${reason.ar}`):
      result==="matches"?text("Clarix and your report match on this figure.","تتطابق قيمة Clarix مع تقريرك لهذا الرقم."):
      text(`Your report says ${q(reported,"en")}; Clarix counts ${q(m.value,"en")}. Difference (report − Clarix): ${q(difference,"en")}. See the source rows.`,
        `يذكر تقريرك ${q(reported,"ar")}، ويحتسب Clarix ${q(m.value,"ar")}. الفرق (التقرير − Clarix): ${q(difference,"ar")}. راجع الصفوف المصدر.`);
    figures.push({side,runId:comparison[side].id,key,unit:m.unit,clarix:m.value,reported,difference,result,reason,sentence});
  }
  return {origin:(input.origin??"").trim(),figures};
}
