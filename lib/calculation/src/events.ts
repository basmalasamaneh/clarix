import { D, fmt, type Dec } from "./decimal";
import { Issues, byLine, groupsBy, lines } from "./issues";
import type { EventType, Group, WorkingEvent, EventValues, Overlap } from "./types";

const groupOf = (type: EventType|null): Group => type==="CHANGEOVER" ? "changeover":"downtime";
export const minutesBetween = (a:Dec,b:Dec) => b.sub(a).div(60);
const duration = (r:WorkingEvent) => minutesBetween(r.start!,r.end!);
export function processEvents(rows:WorkingEvent[],issues:Issues): void {
  for(const r of rows) if(!r.eid || !r.order || r.start===null || r.end===null) {
    r.state="quarantined";
    if(r.order) issues.add(r.order,"MISSING_REQUIRED_FIELD","error",[groupOf(r.type)]);
    else issues.file.add("MISSING_REQUIRED_FIELD:error");
  }
  for(const r of rows) if(r.state==="ok" && r.end!.lte(r.start!)) {
    r.state="quarantined"; issues.add(r.order,"INVALID_TIME_RANGE","error",[groupOf(r.type)]);
  }
  const sig=(r:WorkingEvent)=>JSON.stringify([r.order,r.code,fmt(r.start),fmt(r.end),fmt(r.duration),r.reason,r.machine,r.mold,r.shift]);
  for(const group of groupsBy(rows.filter((r)=>r.state==="ok"),(r)=>r.eid)) {
    if(group.length<2) continue;
    const identical=group.every((r)=>sig(r)===sig(group[0]));
    for(const r of identical ? group.slice(1):group) {
      r.state=identical ? "excluded":"quarantined";
      issues.add(r.order,identical ? "DUPLICATE_EVENT_ID_IDENTICAL":"DUPLICATE_EVENT_ID_CONFLICT",identical ? "warning":"error",[groupOf(r.type)]);
    }
  }
  for(const r of rows) {
    if(r.state!=="ok") continue;
    if(r.type===null) { r.state="unmapped"; issues.add(r.order,"UNMAPPED_EVENT_CODE","warning",["downtime"]); }
    else if(r.type==="PLANNED_STOP") { r.state="planned"; issues.add(r.order,"PLANNED_EVENT_IGNORED","info",["downtime"]); }
  }
  const live=rows.filter((r)=>r.state==="ok").sort(byLine);
  for(const r of live) if(r.duration!==null && !r.duration.eq(duration(r))) {
    issues.add(r.order,"DURATION_MISMATCH","warning",[groupOf(r.type)]);
  }
  const seen=new Set<string>();
  for(const r of live) {
    const key=JSON.stringify([r.order,r.type,fmt(r.start),fmt(r.end)]);
    if(seen.has(key)) { r.suspected=true; issues.add(r.order,"SUSPECTED_DUPLICATE_EVENT","warning",[groupOf(r.type)]); }
    seen.add(key);
  }
}
export function analyzeEvents(order:string,rows:WorkingEvent[],issues:Issues) {
  const mine=rows.filter((r)=>r.order===order);
  const live=mine.filter((r)=>r.state==="ok");
  const changes=live.filter((r)=>r.type==="CHANGEOVER").sort(byLine);
  const stops=live.filter((r)=>r.type==="UNPLANNED_DOWNTIME").sort(byLine);
  const qc=mine.filter((r)=>r.state==="quarantined" && r.type==="CHANGEOVER");
  const qd=mine.filter((r)=>r.state==="quarantined" && r.type!=="CHANGEOVER");
  const ec=mine.filter((r)=>r.state==="excluded" && r.type==="CHANGEOVER");
  const ed=mine.filter((r)=>["excluded","unmapped"].includes(r.state) && r.type!=="CHANGEOVER");
  const overlaps:Overlap[]=[];
  for(const stop of stops) for(const change of changes) {
    const start=D.max(stop.start!,change.start!), end=D.min(stop.end!,change.end!);
    if(end.gt(start)) {
      overlaps.push({stop_event_id:stop.eid,changeover_event_id:change.eid,overlap_min:fmt(minutesBetween(start,end))});
      issues.add(order,"POSSIBLE_OVERLAP","warning",["changeover","downtime"]);
    }
  }
  const sum=(rs:WorkingEvent[])=>rs.reduce((acc,r)=>acc.add(duration(r)),new D(0));
  const co=qc.length ? null : changes.length ? sum(changes):null;
  if(!qc.length && !changes.length) issues.add(order,"NO_CHANGEOVER_EVENT","warning",["changeover"]);
  if(changes.length>1) issues.add(order,"MULTIPLE_CHANGEOVER_EVENTS","info",["changeover"]);
  const dt=qd.length ? null:sum(stops);
  const values=(rs:WorkingEvent[],q:WorkingEvent[],ex:WorkingEvent[],minutes:Dec|null):EventValues => ({
    minutes:fmt(minutes),event_ids:rs.map((r)=>r.eid),source_lines:lines(rs),
    excluded_source_lines:lines(ex),quarantined_source_lines:lines(q),
    alternatives:rs.some((r)=>r.suspected) && minutes!==null ?
      {minutes_if_suspected_excluded:fmt(sum(rs.filter((r)=>!r.suspected)))}:{},
  });
  return {changeover:values(changes,qc,ec,co),downtime:{...values(stops,qd,ed,dt),event_count:stops.length},overlaps};
}
