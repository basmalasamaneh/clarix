import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18n from '@/lib/i18n';
import { useCsrfRequest } from '@/lib/session';
import '@/lib/sources-i18n';

/** Local typed client for source endpoints not yet in the generated client. */
export type DataSource = { name: string; archived: boolean; orderCount: number; lastApprovedAt: string | null };
export type Paged<T> = { items: T[]; total: number; page: number };
export type SourceRun = { id: string; orderId: string; sourceName: string; ambiguous: boolean };
export type RunIdentity = { id: string; orderId: string; sourceName: string };
export type SourceComparison = { left: RunIdentity; right: RunIdentity };
export type OtherSourceOrder = { orderId: string; sourceName: string };
export type SettingsDifference = { path: string; here: unknown; there: unknown };
export type SourceDetailX = {
  sourceArchived?: boolean;
  otherSourceOrders?: OtherSourceOrder[];
  settingsDifferences?: SettingsDifference[];
  comparisonSource?: string | null;
};

export class SourceApiError extends Error {
  constructor(public status: number, public data: unknown) {
    super(`HTTP ${status}`);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new SourceApiError(res.status, data);
  return data as T;
}

const qs = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();

export const dataSourcesKey = (page: number, search: string) => ['/api/data-sources', page, search] as const;

export function useDataSources(page: number, search: string) {
  return useQuery({
    queryKey: dataSourcesKey(page, search),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => call<Paged<DataSource>>(`/api/data-sources?${qs({ page, search })}`, { signal }),
  });
}

export function useRecommendSource() {
  const req = useCsrfRequest();
  return useMutation({
    mutationFn: (files: { name: string; headers: string[] }[]) =>
      call<{ sourceName: string | null }>('/api/data-sources/recommend', {
        method: 'POST',
        headers: { ...req.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      }),
  });
}

export function useArchiveSource() {
  const req = useCsrfRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sourceName: string; archived: boolean }) =>
      call<unknown>('/api/data-sources/archive', {
        method: 'PATCH',
        headers: { ...req.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['/api/data-sources'] });
      void qc.invalidateQueries({ queryKey: ['/api/source-runs'] });
      void qc.invalidateQueries({ queryKey: ['/api/source-comparison'] });
      void qc.invalidateQueries({ predicate:q=>String(q.queryKey[0]).startsWith('/api/imports') });
    },
  });
}

export function useSourceRuns(page: number, search: string) {
  return useQuery({
    queryKey: ['/api/source-runs', page, search],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => call<Paged<SourceRun>>(`/api/source-runs?${qs({ page, search })}`, { signal }),
  });
}

export function useSourceComparison(left: string | null, right: string | null) {
  return useQuery({
    queryKey: ['/api/source-comparison', left, right],
    refetchInterval: 15000,
    enabled: !!left && !!right,
    retry: 1,
    queryFn: ({ signal }) => call<SourceComparison>(`/api/source-comparison?${qs({ left: left ?? '', right: right ?? '' })}`, { signal }),
  });
}

/** Read only the header row of a CSV locally. Values are never sent. */
export async function readCsvHeaders(file: File): Promise<string[]> {
  let text = await file.slice(0, 65536).text();
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const delims = [',', ';', '\t', '|'];
  const delim = delims.reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      out.push(cur.trim());
      cur = '';
    } else if (c === '\n' || c === '\r') break;
    else cur += c;
  }
  out.push(cur.trim());
  return out.filter((h) => h !== '');
}

const ROLES = ['orders', 'records', 'events', 'totals'];

function valueLabel(t: TFunction, v: unknown): string {
  if (v == null || v === '') return t('src.diff.none');
  if (typeof v === 'boolean') return v ? t('src.diff.yes') : t('src.diff.no');
  if (Array.isArray(v)) return v.map((x) => valueLabel(t, x)).join(', ');
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${valueLabel(t, x)}`).join(', ');
  const s = String(v);
  if (i18n.exists(`imp.map.types.${s}`)) return t(`imp.map.types.${s}`);
  if (s === 'IGNORE') return t('imp.map.codes.ignore');
  if (s === '.') return t('imp.map.decimalDot');
  if (s === ',') return t('imp.map.decimalComma');
  return s;
}

function fieldName(t: TFunction, k: string): string {
  return i18n.exists(`imp.map.fields.${k}`) ? t(`imp.map.fields.${k}`) : k;
}

/** Turns a settings path like files.records.columns.input into readable localized text. */
export function describeDifference(t: TFunction, d: SettingsDifference): { label: string; here: string; there: string } {
  const seg = d.path.split('.').filter(Boolean);
  const role = seg.find((s) => ROLES.includes(s));
  const roleTxt = role ? t(`imp.map.roles.${role}`) : '';
  const last = seg[seg.length - 1] ?? d.path;
  let label: string;
  if (seg.includes('codes') || seg.includes('event_codes') || seg.includes('eventCodes') || seg.includes('event_code_map')) {
    label = seg[seg.length - 1] === 'codes' ? t('src.diff.codesAll') : t('src.diff.code', { code: last });
  } else if (seg.includes('units') || seg.includes('unit_factors_to_kg') || last === 'unit') {
    label = last === 'unit' || last === 'units' ? t('src.diff.unit') : t('src.diff.unitOf', { field: fieldName(t, last) });
  } else if (last === 'decimal') label = t('imp.map.decimal');
  else if (last === 'date_format') label = t('imp.map.dateFormat');
  else if (last === 'datetime_format') label = t('imp.map.dateTimeFormat');
  else if (seg.includes('columns')) label = t('src.diff.column', { field: fieldName(t, last) });
  else if (seg[0] === 'files' && seg.length === 2) label = t('src.diff.fileRole', { file: last });
  else label = fieldName(t, last);
  return { label: roleTxt ? `${roleTxt} · ${label}` : label, here: valueLabel(t, d.here), there: valueLabel(t, d.there) };
}
