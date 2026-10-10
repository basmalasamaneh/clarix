import {D} from "@workspace/calculation";
/** Grammatical selection only. Quantities are never converted to JS floats. */
export function pluralCategory(value:string){
 const n=new D(value).abs();
 if(n.eq(0))return "zero";if(n.eq(1))return "one";if(n.eq(2))return "two";
 if(!n.isInteger())return "other";
 const last=n.mod(100);return last.gte(3)&&last.lte(10)?"few":last.gte(11)&&last.lte(99)?"many":"other";
}
export function minutesText(value:string,language:"en"|"ar"){
 if(language==="en")return `${value} ${new D(value).abs().eq(1)?"minute":"minutes"}`;
 const category=pluralCategory(value);
 if(value==="1")return "دقيقة واحدة (1)";
 if(value==="2")return "دقيقتان (2)";
 return `${value} ${category==="few"||category==="zero"?"دقائق":"دقيقة"}`;
}
