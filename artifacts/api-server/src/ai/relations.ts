import {D as Decimal} from "@workspace/calculation";
import type {AiFact,AiStatement} from "@workspace/api-zod";
// Presentation relations, not new engine metrics. Compare tolerances through
// multiplication before division; ROUND_HALF_UP applies only to shown values.
const D=Decimal.clone({precision:80,rounding:Decimal.ROUND_HALF_UP});
export function relationValues(a:string|null,b:string|null){
 if(a===null||b===null)return null;
 const x=new D(a),y=new D(b);
 if(!x.isFinite()||!y.isFinite()||x.lte(0)||y.lt(0))return null;
 return {ratio:y.div(x).toDecimalPlaces(2).toFixed(),
  share:y.minus(x).times(100).div(x).toDecimalPlaces(1).toFixed(),
  twice:y.gte(x.times("1.95"))&&y.lte(x.times("2.05")),
  half:y.gte(x.times("0.475"))&&y.lte(x.times("0.525"))};
}
export function relationStatements(facts:AiFact[],language:"en"|"ar"):AiStatement[]{
 const result:AiStatement[]=[],ar=language==="ar";
 for(const key of ["scrap_kg","scrap_rate_pct","changeover_min","downtime_min"]){
  const a=facts.find(f=>f.id===`a.${key}`),b=facts.find(f=>f.id===`b.${key}`);
  if(!a||!b||a.status==="red"||b.status==="red")continue;
  const r=relationValues(a.value,b.value);if(!r)continue;
  const label=a.label.split(" — ").slice(1).join(" — ");
  const relation=r.twice?(ar?"نحو ضعف القيمة":"about twice as much"):r.half?(ar?"نحو نصف القيمة":"about half as much"):
   (ar?`${r.ratio} من قيمة التشغيلة أ`:`${r.ratio} times Run A's value`);
  result.push({type:"FACT",text:ar?`${label}: التشغيلة ب ${relation} مقارنة بالتشغيلة أ.`:
    `${label}: Run B has ${relation} compared with Run A.`,refs:[a.id,b.id]});
  result.push({type:"FACT",text:ar?`بعبارة أخرى، الفرق في ${label} يساوي ${r.share}% من قيمة التشغيلة أ. هذه نسبة إلى التشغيلة أ، وليست فرقًا بالنقاط المئوية.`:
   `In other words, the difference in ${label} is ${r.share}% of Run A's value. This is relative to Run A, not a percentage-point difference.`,refs:[a.id,b.id]});
 }
 return result;
}
