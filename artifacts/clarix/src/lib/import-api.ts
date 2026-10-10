import { useQuery } from '@tanstack/react-query';
import type { ApprovalInput, ImportDetail, ImportIssue, JsonObject } from '@workspace/api-client-react';
import type { EventType } from '@/lib/import-model';

/**
 * Local types for Phase-4 fix endpoints that the generated client does not cover yet.
 * Replace with generated hooks once the OpenAPI contract is regenerated.
 */
export type CodeChoice = EventType | 'IGNORE';
export type SampleRow = { file: string; line: number; cells: Record<string, string> | string[] };
export type EventCodeItem = {
  code: string;
  count: number;
  sample: SampleRow;
  refs: string[];
  suggestion: EventType | null;
  choice: CodeChoice | null;
  chosenBy?: string;
  chosenAt?: string;
};
export type EventCodePage = { items: EventCodeItem[]; total: number; page?: number; pageSize?: number };

export type DuplicateReason = 'CURRENT_SAME_MAPPING' | 'MAPPING_DIFFERS' | 'FULLY_SUPERSEDED';
export type ImportDetailX = ImportDetail & {
  replacementOrders?: string[];
  replacedOrders?: string[];
  duplicateReason?: DuplicateReason | null;
};

export type IssueEventCode = { code: string; count: number; ignored: boolean; chosenBy?: string | null; chosenAt?: string | null; refs: string[] };
export type IssueDetails = {
  rows?: SampleRow[];
  eventCodes?: IssueEventCode[];
  hasUnmappedEvents?: boolean;
  field?: string;
  values?: JsonObject;
  rowCount?: number;
  eventCodeCount?: number;
};
export type ImportIssueX = ImportIssue & { id?: string; details?: IssueDetails };
export type ErrorPage = { items: ImportIssueX[]; total: number; page: number };
export type ApprovalInputX = ApprovalInput & { confirmErrors?: boolean };

type Req = { credentials: 'include'; headers: Record<string, string> };

class LocalApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new LocalApiError(res.status, data);
  return data as T;
}

export const eventCodesKey = (id: string, file: string, column: string) => ['/api/imports', id, 'event-codes', file, column] as const;

export function useEventCodes(id: string, file: string | undefined, column: string | undefined, mapping: Record<string, unknown>, req: Req) {
  return useQuery({
    queryKey: eventCodesKey(id, file ?? '', column ?? ''),
    enabled: !!file && !!column,
    staleTime: 60_000,
    retry: 1,
    queryFn: ({ signal }) =>
      apiJson<EventCodePage>(`/api/imports/${encodeURIComponent(id)}/event-codes`, {
        method: 'POST',
        signal,
        credentials: req.credentials,
        headers: { ...req.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping }),
      }),
  });
}

export const errorsKey = (id: string) => [`/api/imports/${id}/errors`] as const;

export function useImportErrors(id: string, enabled: boolean, page=1) {
  return useQuery({
    queryKey: [...errorsKey(id),page],
    enabled,
    queryFn: ({ signal }) => apiJson<ErrorPage>(`/api/imports/${encodeURIComponent(id)}/errors?page=${page}`, { signal, credentials: 'include' }),
  });
}

export function rowCells(r: SampleRow): [string, string][] {
  if (Array.isArray(r.cells)) return r.cells.map((v, i) => [String(i + 1), String(v)]);
  return Object.entries(r.cells ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]);
}

/* ---------- Server review paging (POST /api/imports/:id/review-page) ---------- */
export type ReviewKind =
  | 'replacementOrders'
  | 'replacedOrders'
  | 'otherSourceOrders'
  | 'settingsDifferences'
  | 'issueRows'
  | 'issueCodes'
  | 'issueCodeRefs'
  | 'eventCodes'
  | 'eventCodeRefs';
export type ReviewExtra = { issueId?: string; code?: string; mapping?: Record<string, unknown>; path?: string };
export type ReviewPage<T> = { items: T[]; total: number; page: number; pageSize: number };
export type ReviewCounts = Partial<Record<'replacementOrders' | 'replacedOrders' | 'otherSourceOrders' | 'settingsDifferences' | 'resultRuns', number>>;
export type ImportReviewCountsX = { reviewCounts?: ReviewCounts };

export const reviewPageKey = (id: string, kind: ReviewKind, page: number, scope: string) => ['/api/imports', id, 'review-page', kind, scope, page] as const;

export function fetchReviewPage<T>(id: string, kind: ReviewKind, page: number, extra: ReviewExtra, req: Req, signal?: AbortSignal) {
  return apiJson<ReviewPage<T>>(`/api/imports/${encodeURIComponent(id)}/review-page`, {
    method: 'POST',
    signal,
    credentials: req.credentials,
    headers: { ...req.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, page, ...extra }),
  });
}

/** `scope` identifies the extra params for caching (mapping excluded on purpose, like event-codes). */
export function useReviewPage<T>(id: string, kind: ReviewKind, page: number, extra: ReviewExtra, scope: string, req: Req, enabled: boolean) {
  return useQuery({
    queryKey: reviewPageKey(id, kind, page, scope),
    enabled,
    staleTime: 60_000,
    retry: 1,
    queryFn: ({ signal }) => fetchReviewPage<T>(id, kind, page, extra, req, signal),
  });
}

/** One event-code page on demand: page 1 via /event-codes, later pages via review-page kind=eventCodes. */
export function useEventCodesPage(id: string, file: string | undefined, column: string | undefined, mapping: Record<string, unknown>, req: Req, page: number) {
  const first = useEventCodes(id, file, column, mapping, req);
  const later = useReviewPage<EventCodeItem>(id, 'eventCodes', page, { mapping }, `${file ?? ''}:${column ?? ''}`, req, !!file && !!column && page > 1 && !!first.data);
  const cur = page > 1 ? later : first;
  return {
    first,
    items: cur.data?.items,
    sig: `${page}|${cur.dataUpdatedAt}`,
    total: first.data?.total ?? 0,
    isLoading: first.isLoading,
    isError: first.isError,
    error: first.error,
    pageLoading: page > 1 && later.isLoading,
    pageError: page > 1 && later.isError ? later.error : null,
    refetch: async () => {
      await first.refetch();
      if (page > 1) await later.refetch();
    },
  };
}
