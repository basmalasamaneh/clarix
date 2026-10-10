import type { TFunction } from 'i18next';
import i18n from '@/lib/i18n';
import { localizeError } from '@/lib/session';
import '@/lib/imports-i18n';

export const PAGE_SIZE = 20;
export const ROLES = ['orders', 'records', 'events', 'totals'] as const;
export type Role = (typeof ROLES)[number];
export const EVENT_TYPES = ['CHANGEOVER', 'UNPLANNED_DOWNTIME', 'PLANNED_STOP'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Canonical fields per file role (mirrors Phase 3 Mapping schema; engine is not imported). */
export const FIELDS: Record<Role, { key: string; required?: boolean }[]> = {
  orders: [{ key: 'order_id', required: true }, { key: 'product_code' }, { key: 'machine_id' }, { key: 'mold_id' }],
  records: [
    { key: 'record_id', required: true },
    { key: 'order_id', required: true },
    { key: 'shift' },
    { key: 'record_date' },
    { key: 'input' },
    { key: 'good' },
    { key: 'scrap' },
    { key: 'unit' },
  ],
  events: [
    { key: 'event_id', required: true },
    { key: 'order_id', required: true },
    { key: 'event_code', required: true },
    { key: 'start', required: true },
    { key: 'end', required: true },
    { key: 'duration_min' },
    { key: 'reason' },
  ],
  totals: [
    { key: 'order_id', required: true },
    { key: 'input' },
    { key: 'good' },
    { key: 'scrap' },
    { key: 'unit' },
    { key: 'changeover_hours' },
    { key: 'downtime_min' },
  ],
};
export const HAS_UNIT: Record<Role, boolean> = { orders: false, records: true, events: false, totals: true };

export type FileMap = { file: string; columns: Record<string, string>; fixed_unit?: string };
export type Format = { encoding: string; delimiter: string; decimal_separator: string; date_format: string; datetime_format: string };
export type CodeRow = { id: number; code: string; type: EventType };

export type Draft = {
  base: Record<string, unknown>;
  format: Format;
  files: Partial<Record<Role, FileMap>>;
  codes: CodeRow[];
};

let rowSeq = 1;
export const newRowId = () => rowSeq++;

const DEFAULT_FORMAT: Format = {
  encoding: 'auto',
  delimiter: 'auto',
  decimal_separator: '.',
  date_format: '%Y-%m-%d',
  datetime_format: '%Y-%m-%d %H:%M',
};

export function draftFromMapping(m: Record<string, unknown> | undefined | null): Draft {
  const src = (m ?? {}) as Record<string, unknown>;
  const fmt = { ...DEFAULT_FORMAT, ...((src.format as Partial<Format>) ?? {}) };
  const filesIn = (src.files ?? {}) as Record<string, FileMap | undefined>;
  const files: Partial<Record<Role, FileMap>> = {};
  for (const r of ROLES) {
    const f = filesIn[r];
    if (f && typeof f.file === 'string') files[r] = { file: f.file, columns: { ...(f.columns ?? {}) }, ...(f.fixed_unit ? { fixed_unit: f.fixed_unit } : {}) };
  }
  const ecm = (src.event_code_map ?? {}) as Record<string, string>;
  const codes: CodeRow[] = Object.entries(ecm).map(([code, type]) => ({
    id: newRowId(),
    code,
    type: (EVENT_TYPES as readonly string[]).includes(type) ? (type as EventType) : 'CHANGEOVER',
  }));
  return { base: src, format: fmt, files, codes };
}

export function levelOf(files: Partial<Record<Role, FileMap>>): 1 | 2 | 3 {
  if (files.records && files.events) return 3;
  if (files.records) return 2;
  return 1;
}

export function mappingFromDraft(d: Draft, sourceName: string): Record<string, unknown> {
  const files: Record<string, FileMap> = {};
  for (const r of ROLES) {
    const f = d.files[r];
    if (!f) continue;
    const columns: Record<string, string> = {};
    for (const [k, v] of Object.entries(f.columns)) if (v) columns[k] = v;
    const out: FileMap = { file: f.file, columns };
    if (HAS_UNIT[r] && !columns.unit && f.fixed_unit?.trim()) out.fixed_unit = f.fixed_unit.trim();
    files[r] = out;
  }
  return {
    ...d.base,
    schema_version: (d.base.schema_version as number) ?? 1,
    capability_level: levelOf(d.files),
    source_name: (d.base.source_name as string) || sourceName,
    format: d.format,
    files,
    event_code_map: Object.fromEntries(d.codes.filter((c) => c.code.trim()).map((c) => [c.code.trim(), c.type])),
  };
}

export type DraftErrors = { general: string[]; fields: Record<string, string>; codes: Record<number, string> };

export function validateDraft(t: TFunction, d: Draft): DraftErrors {
  const general: string[] = [];
  const fields: Record<string, string> = {};
  const codes: Record<number, string> = {};
  if (!d.files.orders) general.push(t('imp.map.errors.ordersRole'));
  if (!d.files.records && !d.files.totals) general.push(t('imp.map.errors.dataRole'));
  if (d.files.records && d.files.totals) general.push(t('imp.map.errors.recordsTotals'));
  if (d.files.events && !d.files.records) general.push(t('imp.map.errors.eventsNeedRecords'));
  for (const r of ROLES) {
    const f = d.files[r];
    if (!f) continue;
    for (const fd of FIELDS[r]) {
      if (fd.required && !f.columns[fd.key]) fields[`${r}.${fd.key}`] = t('imp.map.errors.fieldMissing', { field: t(`imp.map.fields.${fd.key}`) });
    }
  }
  if (!d.format.date_format.trim()) fields['format.date_format'] = t('imp.map.errors.dateFormat');
  const seen = new Set<string>();
  for (const c of d.codes) {
    const k = c.code.trim();
    if (!k) codes[c.id] = t('imp.map.codeRequired');
    else if (seen.has(k)) codes[c.id] = t('imp.map.codeDuplicate');
    seen.add(k);
  }
  return { general, fields, codes };
}

export const hasErrors = (e: DraftErrors) => e.general.length > 0 || Object.keys(e.fields).length > 0 || Object.keys(e.codes).length > 0;

type ErrData = { error?: unknown; details?: { file?: unknown; line?: unknown; column?: unknown; existingImportId?: unknown } };

export function errData(err: unknown): ErrData | undefined {
  const d = (err as { data?: unknown } | null)?.data;
  return d && typeof d === 'object' ? (d as ErrData) : undefined;
}

export function errCodeOf(err: unknown): string | undefined {
  const c = errData(err)?.error;
  return typeof c === 'string' ? c : undefined;
}

/** Localized message plus optional file/line/column location. */
export function importError(t: TFunction, err: unknown): { message: string; location?: string } {
  const d = errData(err);
  const code = errCodeOf(err);
  const message = code && i18n.exists(`imp.errors.codes.${code}`) ? t(`imp.errors.codes.${code}`) : localizeError(t, err);
  const det = d?.details;
  let location: string | undefined;
  if (det && det.file != null && det.line != null) {
    location =
      det.column != null
        ? t('imp.errors.location', { file: String(det.file), line: String(det.line), column: String(det.column) })
        : t('imp.errors.locationNoCol', { file: String(det.file), line: String(det.line) });
  }
  return { message, location };
}

export function issueText(t: TFunction, code: string): string {
  return i18n.exists(`imp.issues.${code}`) ? t(`imp.issues.${code}`) : t('imp.issues.unknown', { code });
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${nf.format(n / 1024)} KB`;
  return `${nf.format(n / (1024 * 1024))} MB`;
}

export function formatDate(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
