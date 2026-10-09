import type { Dec } from "./decimal";

export type Group = "volume" | "changeover" | "downtime";
export type Status = "green" | "yellow" | "red";
export type Severity = "info" | "warning" | "error";
export type EventType = "CHANGEOVER" | "UNPLANNED_DOWNTIME" | "PLANNED_STOP";
export type State = "ok" | "excluded" | "quarantined" | "unmapped" | "planned";
export interface FileMapping { file: string; columns: Record<string, string>; fixed_unit?: string }
export interface Mapping {
  schema_version: number;
  capability_level: 1 | 2 | 3;
  source_name: string;
  format: { encoding: string; delimiter: string; decimal_separator: string; date_format: string; datetime_format: string };
  files: { orders: FileMapping; records?: FileMapping; events?: FileMapping; totals?: FileMapping };
  event_code_map: Record<string, EventType>;
  unit_factors_to_kg: Record<string, string>;
  tolerances: { imbalance_warn_pct: string; imbalance_error_pct: string };
}
export interface SourceFile { name: string; bytes: Uint8Array }
export interface SourceRef { file: string; line: number }
export interface CanonicalRecord extends SourceRef {
  rid: string; order: string; shift: string; date: string; machine: string; mold: string;
  input: Dec | null; good: Dec | null; scrap: Dec | null; unit: string;
}
export interface CanonicalEvent extends SourceRef {
  eid: string; order: string; code: string; start: Dec | null; end: Dec | null;
  duration: Dec | null; reason: string; machine: string; mold: string; shift: string;
}
export interface CanonicalTotal { record: CanonicalRecord; hours: Dec | null; downtime: Dec | null }
export interface CanonicalDataset {
  mapping: Mapping; orders: string[]; records: CanonicalRecord[]; events: CanonicalEvent[];
  totals: CanonicalTotal[]; formulaLikeCells: string[];
}
export interface SourceAdapter<T> { read(input: T, mapping: Mapping): CanonicalDataset }
export type WorkingRecord = CanonicalRecord & { state: State; suspected: boolean };
export type WorkingEvent = CanonicalEvent & { state: State; suspected: boolean; type: EventType | null };
export interface Lineage {
  source_lines: string[]; excluded_source_lines: string[]; quarantined_source_lines: string[];
}
export interface Volume extends Lineage {
  input_kg: string | null; good_kg: string | null; scrap_kg: string | null;
  scrap_rate_pct: string | null; good_rate_pct: string | null; material_balance_kg: string | null;
  record_ids: string[];
  alternatives: Record<string, Record<string, string | null>>;
}
export interface EventValues extends Lineage {
  minutes: string | null; event_ids: string[];
  alternatives: Record<string, string | null>;
}
export interface Overlap { stop_event_id: string; changeover_event_id: string; overlap_min: string | null }
export interface Run {
  volume: Volume & { status: Status };
  changeover: EventValues & { status: Status };
  downtime: EventValues & { status: Status; event_count: number | null };
  overlaps: Overlap[]; issues: string[]; overall: Status;
}
export interface EngineResult {
  capability_level: number; runs: Record<string, Run>;
  comparison: { pair: [string,string]; metrics: Record<string, { value: string | null; comparable: boolean }> };
  file_issues: string[]; formula_like_cells: string[]; event_reasons: Record<string,string>;
}
