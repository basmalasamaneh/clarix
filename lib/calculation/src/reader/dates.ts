import { D, type Dec } from "../decimal";

// Calendar fields use exact integers; quantities and elapsed minutes use Decimal.
// UTC is only an arithmetic coordinate for naive plant-local fields, not a
// timezone conversion. Host timezone and DST must never change a duration.
export function parseLocalTime(raw: string, format: string): Dec | null {
  if (!raw) return null;
  const fields: string[]=[];
  const patterns: Record<string,string>={Y:"\\d{4}",m:"\\d{1,2}",d:"\\d{1,2}",H:"\\d{1,2}",M:"\\d{1,2}",S:"\\d{1,2}",f:"\\d{1,6}"};
  let pattern="^";
  for(let i=0;i<format.length;i++) {
    if(format[i]==="%") {
      const token=format[++i];
      if (!patterns[token]) throw new Error(`Unsupported date format token %${token}`);
      fields.push(token); pattern+=`(${patterns[token]})`;
    } else pattern+=format[i].replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  }
  const match=new RegExp(pattern+"$").exec(raw);
  if(!match) throw new Error(`Invalid date ${JSON.stringify(raw)} for ${format}`);
  const p: Record<string,string>=Object.fromEntries(fields.map((f,i)=>[f,match[i+1]]));
  const y=Number(p.Y), m=Number(p.m), d=Number(p.d), h=Number(p.H??0), min=Number(p.M??0), sec=Number(p.S??0);
  if(!Number.isInteger(y) || y<1 || y>9999 || m<1 || m>12 || d<1 || d>31 || h>23 || min>59 || sec>59) throw new Error("Invalid calendar date");
  const date=new Date(0); date.setUTCFullYear(y,m-1,d); date.setUTCHours(h,min,sec,0);
  if(date.getUTCFullYear()!==y || date.getUTCMonth()!==m-1 || date.getUTCDate()!==d) throw new Error("Invalid calendar date");
  return new D(date.getTime().toString()).div(1000).add(p.f ? new D(`0.${p.f}`):0);
}
export function normalizeDate(raw: string, format: string): string {
  if(!raw) return "";
  const value=parseLocalTime(raw,format)!;
  return new Date(value.mul(1000).toNumber()).toISOString().slice(0,10);
}
