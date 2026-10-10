import type { Group, Severity, Status, SourceRef } from "./types";
export const GROUPS: Group[] = ["volume","changeover","downtime"];
export interface QualityEntry {order:string;code:string;severity:Severity;groups:Group[];refs:string[]}
export class Issues {
  readonly items: QualityEntry[]=[];
  readonly file = new Set<string>();
  add(order: string, code: string, severity: Severity, groups: Group[],rows:SourceRef[] = []) {
    this.items.push({order,code,severity,groups,refs:rows.map(ref)});
  }
  forRun(order: string): string[] {
    return [...new Set(this.items.filter((i)=>i.order===order).map((i)=>`${i.code}:${i.severity}`))].sort();
  }
  status(order: string, group: Group): Status {
    const items=this.items.filter((i)=>i.order===order && i.groups.includes(group));
    return items.some((i)=>i.severity==="error") ? "red" : items.some((i)=>i.severity==="warning") ? "yellow":"green";
  }
}
export const ref = (r: SourceRef) => `${r.file}:${r.line}`;
export const byLine = <T extends SourceRef>(a:T,b:T) => a.line-b.line;
export const lines = (rows: SourceRef[]) => [...rows].sort(byLine).map(ref);
export function groupsBy<T>(rows:T[], key:(row:T)=>string): T[][] {
  const map=new Map<string,T[]>();
  for(const row of rows) { const k=key(row); const list=map.get(k)??[]; list.push(row); map.set(k,list); }
  return [...map.values()];
}
