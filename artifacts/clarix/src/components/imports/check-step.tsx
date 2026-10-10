import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, CircleAlert, Info, Lightbulb, Loader2, PlayCircle, ShieldCheck, XCircle } from 'lucide-react';
import {
  getGetImportQueryKey,
  getListImportIssuesQueryKey,
  getListImportsQueryKey,
  useApproveImport,
  useCheckImport,
  useListImportIssues,
  useRejectImport,
  type ImportDetail,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useCsrfRequest } from '@/lib/session';
import { QualityAssistant } from '@/components/ai/assist-panels';
import { cn } from '@/lib/utils';
import i18n from '@/lib/i18n';
import { FIELDS, PAGE_SIZE, errCodeOf, errData, formatDate, issueText, nextStepText } from '@/lib/import-model';
import { rowCells, useImportErrors, type ApprovalInputX, type ImportDetailX, type ImportIssueX, type ImportReviewCountsX, type IssueDetails, type IssueEventCode, type SampleRow } from '@/lib/import-api';
import { ServerPaged } from './review-paging';
import { ErrorNote, Pager, Raw, Section } from './shared';
import { PagedOrders, SourceInfo } from '@/components/sources/source-info';
import type { SourceDetailX } from '@/lib/sources-api';

const SEV_STYLE: Record<string, { icon: typeof Info; cls: string }> = {
  error: { icon: XCircle, cls: 'text-status-red' },
  warning: { icon: AlertTriangle, cls: 'text-status-amber' },
  info: { icon: Info, cls: 'text-[var(--series-good)]' },
};

function detectedLevel(d: ImportDetail): string | undefined {
  const r = d.result as Record<string, unknown> | undefined;
  const m = d.mapping as Record<string, unknown> | undefined;
  const v = r?.capability_level ?? r?.level ?? m?.capability_level;
  return v == null ? undefined : String(v);
}

type JumpFn = (target: string) => void;

function resolveTarget(code: string, det: IssueDetails | undefined, mapping: Record<string, unknown> | undefined): string | null {
  if (['UNMAPPED_EVENT_CODE', 'MULTIPLE_CHANGEOVER_EVENTS', 'PLANNED_EVENT_IGNORED'].includes(code)) return 'codes';
  if (code === 'NO_CHANGEOVER_EVENT') return 'codes';
  if (code === 'UNREADABLE_NUMBER') return 'format.decimal';
  if (code === 'UNREADABLE_DATE') return 'format.date_format';
  if (code === 'DURATION_MISMATCH' || code === 'INVALID_TIME_RANGE' || code === 'POSSIBLE_OVERLAP') return 'events.start';
  const files = ((mapping?.files ?? {}) as Record<string, { columns?: Record<string, string> } | undefined>);
  const field = det?.field ?? (code === 'INCOMPATIBLE_UNIT' || code === 'UNIT_CONVERTED' ? 'unit' : code === 'ZERO_INPUT' || code === 'MATERIAL_IMBALANCE' ? 'input' : undefined);
  if (!field) return null;
  if (field.includes('.')) return field;
  const role = (['records', 'totals', 'events', 'orders'] as const).find((r) => files[r] && FIELDS[r].some((f) => f.key === field));
  return role ? `${role}.${field}` : null;
}

function fieldLabel(t: TFunction, field: string): string {
  const key = field.includes('.') ? field.split('.').pop()! : field;
  return i18n.exists(`imp.map.fields.${key}`) ? t(`imp.map.fields.${key}`) : field;
}

function valueText(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function RowsList({ rows }: { rows: SampleRow[] }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={`${r.file}-${r.line}-${i}`} className="flex min-w-0 flex-wrap items-baseline gap-1 rounded border bg-background px-2 py-1 text-xs">
          <Raw className="text-xs text-muted-foreground">{r.file}</Raw>
          <span className="num text-muted-foreground">· {t('imp.issueX.line')} {r.line}</span>
          {rowCells(r).map(([k, v]) => (
            <span key={k} className="min-w-0 break-all rounded bg-muted px-1">
              <Raw className="text-[11px] text-muted-foreground">{k}</Raw>=<Raw className="text-xs">{v || '—'}</Raw>
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

function RefChips({ refs, testId }: { refs: string[]; testId: string }) {
  return (
    <div className="flex flex-wrap gap-1" data-testid={testId}>
      {refs.map((r, i) => (
        <span key={`${r}-${i}`} className="rounded border bg-muted px-1.5 py-0.5">
          <Raw className="text-xs">{r}</Raw>
        </span>
      ))}
    </div>
  );
}

function IssueCodes({ importId, issueId, codes, total, idx }: { importId: string; issueId: string; codes: IssueEventCode[]; total: number; idx: number }) {
  const { t, i18n: inst } = useTranslation();
  return (
    <ServerPaged importId={importId} kind="issueCodes" extra={{ issueId }} scope={issueId} preview={codes} total={total} testId={`issue-codes-${idx}`}>
      {(shown) => (
        <ul className="space-y-2 text-xs" data-testid={`list-issue-codes-${idx}`}>
          {shown.map((c) => (
            <li key={c.code} className="space-y-1 rounded border bg-background px-2 py-1.5">
              <p>{t(c.ignored ? 'imp.issueX.ignored' : 'imp.issueX.unmapped', { code: c.code, count: c.count })}</p>
              {c.ignored && c.chosenBy && (
                <p className="text-muted-foreground">
                  <Raw className="text-xs">{c.code}</Raw>: {t('imp.map.codes.chosenBy', { by: c.chosenBy, at: c.chosenAt ? formatDate(c.chosenAt, inst.language) : '—' })}
                </p>
              )}
              {(c.refs?.length ?? 0) > 0 && (
                <ServerPaged importId={importId} kind="issueCodeRefs" extra={{ issueId, code: c.code }} scope={`${issueId}:${c.code}`} preview={c.refs} total={c.count} testId={`issue-code-refs-${idx}-${c.code}`}>
                  {(refs) => <RefChips refs={refs} testId={`list-issue-code-refs-${idx}-${c.code}`} />}
                </ServerPaged>
              )}
            </li>
          ))}
        </ul>
      )}
    </ServerPaged>
  );
}

export function IssueCard({ it, idx, importId, mapping, onJump, compact }: { it: ImportIssueX; idx: number; importId: string; mapping?: Record<string, unknown>; onJump?: JumpFn; compact?: boolean }) {
  const { t } = useTranslation();
  const s = SEV_STYLE[it.severity] ?? SEV_STYLE.info;
  const Icon = s.icon;
  const det = it.details;
  const codes = det?.eventCodes ?? [];
  const target = onJump ? resolveTarget(it.code, det, mapping) : null;
  const showHint = it.code === 'NO_CHANGEOVER_EVENT' && det?.hasUnmappedEvents;
  const values = det?.values ? Object.entries(det.values) : [];
  const codeTotal = det?.eventCodeCount ?? codes.length;
  const rowTotal = det?.rowCount ?? det?.rows?.length ?? 0;
  const pagedCodes = !!it.id && codes.length > 0 && (codeTotal > codes.length || codes.some((c) => (c.refs?.length ?? 0) > 0));
  const headline =
    it.code === 'UNMAPPED_EVENT_CODE' && codes.length > 0 && !pagedCodes
      ? codes.map((c) => t(c.ignored ? 'imp.issueX.ignored' : 'imp.issueX.unmapped', { code: c.code, count: c.count })).join(' ')
      : issueText(t, it.code);
  return (
    <li className="grid gap-2 p-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4" data-testid={`row-issue-${idx}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-start">
        <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', s.cls)}>
          <Icon className="size-4" aria-hidden="true" />
          {t(`imp.check.severity.${it.severity}`, { defaultValue: it.severity })}
        </span>
        <span className="text-xs text-muted-foreground">{it.group.split(',').map((g) => t(`imp.check.groups.${g}`, { defaultValue: g })).join(' / ')}</span>
        {it.order && (
          <span className="text-xs">
            <span className="text-muted-foreground">{t('imp.check.colOrder')}: </span>
            <Raw className="text-xs font-semibold">{it.order}</Raw>
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <div>
          <p className="text-sm font-medium" data-testid={`text-issue-${idx}`}>{headline}</p>
          {showHint && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-status-amber" data-testid={`text-issue-hint-${idx}`}>
              <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('imp.issueX.unmappedHint')}
            </p>
          )}
          <p className="num mt-0.5 font-mono text-[11px] text-muted-foreground">{it.code}</p>
        </div>
        {(det?.field || values.length > 0) && (
          <dl className="flex flex-wrap gap-1.5 text-xs">
            {det?.field && (
              <div className="rounded border bg-muted px-1.5 py-0.5">
                <dt className="inline text-muted-foreground">{t('imp.issueX.field')}: </dt>
                <dd className="inline font-medium">{fieldLabel(t, det.field)}</dd>
              </div>
            )}
            {values.map(([k, v]) => (
              <div key={k} className="min-w-0 break-all rounded border bg-muted px-1.5 py-0.5">
                <dt className="inline text-muted-foreground">{fieldLabel(t, k)}: </dt>
                <dd className="inline">
                  <Raw className="text-xs">{valueText(v)}</Raw>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {pagedCodes ? (
          <IssueCodes importId={importId} issueId={it.id!} codes={codes} total={codeTotal} idx={idx} />
        ) : codes.some((c) => c.ignored && c.chosenBy) ? (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {codes.filter((c) => c.ignored && c.chosenBy).map((c) => (
              <li key={c.code}>
                <Raw className="text-xs">{c.code}</Raw>: {t('imp.map.codes.chosenBy', { by: c.chosenBy, at: c.chosenAt ? formatDate(c.chosenAt, i18n.language) : '—' })}
              </li>
            ))}
          </ul>
        ) : null}
        {det?.rows && det.rows.length > 0 ? (
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{codes.some((c) => c.ignored) ? t('imp.issueX.excludedRows') : t('imp.issueX.rows')}</p>
            {it.id ? (
              <ServerPaged importId={importId} kind="issueRows" extra={{ issueId: it.id }} scope={it.id} preview={det.rows} total={rowTotal} testId={`issue-rows-${idx}`}>
                {(rows) => <RowsList rows={rows} />}
              </ServerPaged>
            ) : (
              <RowsList rows={det.rows} />
            )}
          </div>
        ) : null}
        {it.refs.length > 0 && !(det?.rows && det.rows.length > 0) && (
          <div className="min-w-0">
            <p className="mb-1 text-xs text-muted-foreground" data-testid={`text-issue-refs-preview-${idx}`}>
              {t('imp.issueX.refsPreviewOnly', { shown: Math.min(20, it.refs.length), total: Math.max(rowTotal, it.refs.length) })}
            </p>
            <RefChips refs={it.refs.slice(0, 20)} testId={`list-issue-refs-${idx}`} />
          </div>
        )}
        {!compact && (
          <div className="flex flex-col gap-2 rounded-md bg-accent px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="font-medium">{t('imp.issueX.nextStep')}: </span>
              {nextStepText(t, it.code)}
            </p>
            {target && onJump && (
              <Button variant="outline" className="min-h-11 shrink-0 gap-1.5 bg-card" onClick={() => onJump(target)} data-testid={`button-jump-${idx}`}>
                {target === 'codes' ? t('imp.issueX.jumpCodes') : t('imp.issueX.jump')}
                <ArrowRight className="size-4 rtl-flip" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Issues({ id, mapping, onJump }: { id: string; mapping?: Record<string, unknown>; onJump?: JumpFn }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const q = useListImportIssues(id, page, { query: { queryKey: getListImportIssuesQueryKey(id, page) }, request: { credentials: 'include' } });

  if (q.isLoading)
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  if (q.isError)
    return (
      <ErrorNote
        error={q.error}
        action={
          <Button variant="outline" className="min-h-11" onClick={() => q.refetch()} data-testid="button-retry-issues">
            {t('imp.errors.retry')}
          </Button>
        }
      />
    );
  const items = (q.data?.items ?? []) as ImportIssueX[];
  if (items.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center" data-testid="text-issues-empty">
        <CheckCircle2 className="size-6 text-status-green" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('imp.check.issuesEmpty')}</p>
      </div>
    );
  return (
    <>
      <ul className={cn('divide-y rounded-lg border', q.isFetching && 'opacity-70')} data-testid="table-issues">
        {items.map((it, i) => (
          <IssueCard key={`${it.code}-${(page - 1) * PAGE_SIZE + i}`} it={it} idx={(page - 1) * PAGE_SIZE + i} importId={id} mapping={mapping} onJump={onJump} />
        ))}
      </ul>
      <Pager page={page} total={q.data?.total ?? 0} onPage={setPage} testId="pager-issues" />
    </>
  );
}

function ErrorList({ id }: { id: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const q = useImportErrors(id, true, page);
  if (q.isLoading)
    return (
      <div className="space-y-2" aria-busy="true">
        <span className="sr-only">{t('imp.check.errorsLoading')}</span>
        {[0, 1].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  if (q.isError)
    return (
      <ErrorNote
        error={q.error}
        action={
          <Button variant="outline" className="min-h-11" onClick={() => q.refetch()} data-testid="button-retry-errors">
            {t('imp.errors.retry')}
          </Button>
        }
      />
    );
  const items = q.data?.items ?? [];
  return (
    <>
      <ul className="max-h-[40dvh] divide-y overflow-y-auto rounded-lg border" data-testid="list-approve-errors">
        {items.map((it, i) => (
          <IssueCard key={`${it.code}-${i}`} it={it} idx={(page - 1) * PAGE_SIZE + i} importId={id} compact />
        ))}
      </ul>
      <Pager page={page} total={q.data?.total ?? 0} onPage={setPage} testId="pager-approve-errors" />
    </>
  );
}

export function CheckStep({ detail: d0, canEdit, onEditMapping }: { detail: ImportDetail; canEdit: boolean; onEditMapping: (focus?: string) => void }) {
  const detail = d0 as ImportDetailX & SourceDetailX & ImportReviewCountsX;
  const counts = detail.reviewCounts ?? {};
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const req = useCsrfRequest();
  const check = useCheckImport({ request: req });
  const approve = useApproveImport({ request: req });
  const reject = useRejectImport({ request: req });
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedErrors, setConfirmedErrors] = useState(false);

  const status = detail.status;
  const readOnly = status === 'approved' || status === 'rejected' || !canEdit;
  const checked = status !== 'draft';
  const level = detectedLevel(detail);
  const rc = detail.replacementCount;
  const errCount = detail.counts?.error ?? 0;
  const dupBlocked = detail.duplicateReason === 'CURRENT_SAME_MAPPING' || (detail.duplicateReason === undefined && !!detail.duplicateOf);
  const toReplace = detail.replacementOrders ?? [];
  const replaced = detail.replacedOrders ?? [];
  const srcArchived = !!detail.sourceArchived;
  const diffs = detail.settingsDifferences ?? [];

  const apply = (d: ImportDetail) => {
    qc.setQueryData(getGetImportQueryKey(d.id), d);
    void qc.invalidateQueries({ queryKey: getListImportsQueryKey() });
    void qc.resetQueries({
      predicate: (q) => {
        const k = String(q.queryKey[0]);
        return k.startsWith(`/api/imports/${d.id}/issues`) || k === `/api/imports/${d.id}/errors`;
      },
    });
  };

  const approveErr = approve.error;
  const raceExisting =
    errCodeOf(approveErr) === 'DUPLICATE_FILE' ? (errData(approveErr)?.details?.existingImportId as string | undefined) : undefined;

  return (
    <div className="space-y-5">
      {status === 'approved' && (
        <div className="fade-up flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--status-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-green)_7%,var(--card))] p-4" data-testid="banner-approved">
          <ShieldCheck className="size-5 shrink-0 text-status-green" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">{t('imp.check.approvedTitle')}</p>
            <p className="text-sm" data-testid="text-replaced-past">{rc > 0 ? t('imp.check.replacedPast', { count: rc }) : t('imp.check.noReplacedPast')}</p>
            <p className="text-sm text-muted-foreground">{t('imp.check.approvedBody')}</p>
            {replaced.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t('imp.check.ordersReplaced')}</p>
                <PagedOrders importId={detail.id} kind="replacedOrders" orders={replaced} total={counts.replacedOrders} source={detail.sourceName} testId="list-replaced-orders" />
              </div>
            )}
          </div>
        </div>
      )}
      {status === 'rejected' && (
        <div className="fade-up flex items-start gap-3 rounded-xl border bg-muted p-4" data-testid="banner-rejected">
          <Ban className="size-5 shrink-0 text-status-red" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('imp.check.rejectedTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('imp.check.rejectedBody')}</p>
          </div>
        </div>
      )}

      {!checked ? (
        <Section title={t('imp.check.title')} body={t('imp.check.notChecked')} testId="section-not-checked">
          {check.error != null && (
            <div className="mb-4">
              <ErrorNote error={check.error} />
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            {!readOnly && (
              <Button className="min-h-11 gap-2" disabled={check.isPending} onClick={() => check.mutate({ id: detail.id }, { onSuccess: apply })} data-testid="button-run-check">
                {check.isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PlayCircle className="size-4" aria-hidden="true" />}
                {check.isPending ? t('imp.map.checking') : t('imp.check.run')}
              </Button>
            )}
            {!readOnly && (
              <Button variant="outline" className="min-h-11" onClick={() => onEditMapping()} data-testid="button-edit-mapping">
                {t('imp.check.changeSettings')}
              </Button>
            )}
          </div>
        </Section>
      ) : (
        <Section title={t('imp.check.title')} body={t('imp.check.body')} testId="section-check">
          <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="counts">
            {(['error', 'warning', 'info'] as const).map((k) => {
              const s = SEV_STYLE[k];
              const Icon = s.icon;
              return (
                <div key={k} className="min-w-0 rounded-lg border bg-background p-3 sm:p-4">
                  <p className={cn('flex items-center gap-1.5 text-xs font-medium sm:text-sm', s.cls)}>
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="break-words">{t(`imp.check.counts.${k}`)}</span>
                  </p>
                  <p className="num mt-1 text-2xl font-semibold sm:text-3xl" data-testid={`count-${k}`}>
                    {detail.counts?.[k] ?? '—'}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {level && (
              <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2" data-testid="text-detected-level">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="font-medium">{t('imp.map.level', { level })}</span> — {t(`imp.map.levels.${level}`, { defaultValue: '' })}
                </span>
              </p>
            )}
            {status !== 'approved' && (
            <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2" data-testid="text-replacement">
              <CircleAlert className={cn('mt-0.5 size-4 shrink-0', rc > 0 ? 'text-status-amber' : 'text-muted-foreground')} aria-hidden="true" />
              {rc > 0 ? t('imp.check.replacement', { count: rc }) : t('imp.check.noReplacement')}
            </p>
            )}
            {status !== 'approved' && status !== 'rejected' && errCount > 0 && (
              <p className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--status-red)_7%,var(--card))] px-3 py-2 sm:col-span-2" data-testid="text-errors-hint">
                <XCircle className="mt-0.5 size-4 shrink-0 text-status-red" aria-hidden="true" />
                {t('imp.check.errorsHint', { count: errCount })}
              </p>
            )}
          </div>
        </Section>
      )}

      {checked && (
        <SourceInfo
          importId={detail.id}
          counts={counts}
          sourceName={detail.sourceName}
          archived={srcArchived}
          replacementOrders={toReplace}
          otherSourceOrders={detail.otherSourceOrders ?? []}
          diffs={diffs}
          comparisonSource={detail.comparisonSource}
          approved={status === 'approved'}
        />
      )}

      {checked && (
        <Section title={t('imp.check.issuesTitle')} testId="section-issues">
          <Issues id={detail.id} mapping={detail.mapping as Record<string, unknown> | undefined} onJump={readOnly ? undefined : (f) => onEditMapping(f)} />
          <div className="mt-4"><QualityAssistant importId={detail.id} testId="panel-import-assistant" /></div>
        </Section>
      )}

      {(reject.error != null || (approveErr != null && !approveOpen)) && <ErrorNote error={reject.error ?? approveErr} />}

      {!readOnly && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {checked && (
            <Button variant="outline" className="min-h-11" onClick={() => onEditMapping()} data-testid="button-change-settings">
              {t('imp.check.changeSettings')}
            </Button>
          )}
          <Button variant="outline" className="min-h-11 gap-2 text-status-red" onClick={() => setRejectOpen(true)} data-testid="button-reject">
            <Ban className="size-4" aria-hidden="true" />
            {t('imp.check.reject')}
          </Button>
          {checked && (
            <Button
              className="min-h-11 gap-2"
              disabled={dupBlocked || srcArchived}
              title={dupBlocked ? t('imp.check.duplicateBlocked') : srcArchived ? t('src.info.archived') : undefined}
              onClick={() => {
                approve.reset();
                setConfirmed(false);
                setConfirmedErrors(false);
                setApproveOpen(true);
              }}
              data-testid="button-approve"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t('imp.check.approve')}
            </Button>
          )}
        </div>
      )}

      <Dialog open={approveOpen} onOpenChange={(o) => !approve.isPending && setApproveOpen(o)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('imp.check.approveTitle')}</DialogTitle>
            <DialogDescription>{t('imp.check.approveBody')}</DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="text-approve-replacement">
            {rc > 0 ? t('imp.check.replacement', { count: rc }) : t('imp.check.noReplacement')}
          </p>
          {toReplace.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('imp.check.ordersToReplace')}</p>
              <PagedOrders importId={detail.id} kind="replacementOrders" orders={toReplace} total={counts.replacementOrders} source={detail.sourceName} testId="list-orders-to-replace" />
            </div>
          )}
          {errCount > 0 && approveOpen && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-status-red">{t('imp.check.errorsTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('imp.check.errorsBody')}</p>
              <ErrorList id={detail.id} />
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                <Checkbox checked={confirmedErrors} onCheckedChange={(v) => setConfirmedErrors(v === true)} className="mt-0.5" data-testid="checkbox-confirm-errors" />
                <span>{t('imp.check.confirmErrors', { count: errCount })}</span>
              </label>
            </div>
          )}
          {rc > 0 && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" data-testid="checkbox-confirm-replacement" />
              <span>{t('imp.check.replaceConfirm', { count: rc })}</span>
            </label>
          )}
          {approveErr != null && (
            <ErrorNote
              error={approveErr}
              action={
                raceExisting ? (
                  <Link href={`/imports?id=${raceExisting}`} onClick={() => setApproveOpen(false)} className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium hover-elevate" data-testid="link-existing-import">
                    {t('imp.duplicate.open')}
                  </Link>
                ) : undefined
              }
            />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" disabled={approve.isPending} onClick={() => setApproveOpen(false)} data-testid="button-cancel-approve">
              {t('imp.check.cancel')}
            </Button>
            <Button
              className="min-h-11 gap-2"
              disabled={approve.isPending || srcArchived || dupBlocked || (rc > 0 && !confirmed) || (errCount > 0 && !confirmedErrors)}
              onClick={() =>
                approve.mutate(
                  {
                    id: detail.id,
                    data: {
                      confirmReplacement: rc > 0 ? confirmed : false,
                      replacementCount: rc,
                      ...(errCount > 0 ? { confirmErrors: confirmedErrors } : {}),
                    } satisfies ApprovalInputX,
                  },
                  {
                    onSuccess: (d) => {
                      apply(d);
                      setApproveOpen(false);
                      if (d.status === 'approved') toast({ title: t('imp.check.approvedToast') });
                    },
                  },
                )
              }
              data-testid="button-confirm-approve"
            >
              {approve.isPending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {approve.isPending ? t('imp.check.approving') : t('imp.check.approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={(o) => !reject.isPending && setRejectOpen(o)}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{t('imp.check.rejectTitle')}</DialogTitle>
            <DialogDescription>{t('imp.check.rejectBody')}</DialogDescription>
          </DialogHeader>
          {reject.error != null && <ErrorNote error={reject.error} />}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" disabled={reject.isPending} onClick={() => setRejectOpen(false)} data-testid="button-cancel-reject">
              {t('imp.check.cancel')}
            </Button>
            <Button
              variant="destructive"
              className="min-h-11 gap-2"
              disabled={reject.isPending}
              onClick={() =>
                reject.mutate(
                  { id: detail.id },
                  {
                    onSuccess: (d) => {
                      apply(d);
                      setRejectOpen(false);
                      if (d.status === 'rejected') toast({ title: t('imp.check.rejectedToast') });
                    },
                  },
                )
              }
              data-testid="button-confirm-reject"
            >
              {reject.isPending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {reject.isPending ? t('imp.check.rejecting') : t('imp.check.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
