import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, Archive, ChevronDown, FileText, History, Info, OctagonX, RotateCcw, Rows3, SearchX, ShieldCheck, X } from 'lucide-react';
import {
  getGetQualityIssueQueryKey,
  getGetQualityQueryKey,
  useGetQuality,
  useGetQualityIssue,
  type GetQualityGroup,
  type GetQualityParams,
  type GetQualitySeverity,
  type QualityIssue,
  type QualityPage,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/empty-page';
import { PAGE_ICONS } from '@/components/app-shell';
import { StateScreen } from '@/components/state-screen';
import { ErrorNote, NativeSelect, Pager, Raw } from '@/components/imports/shared';
import { QualityStatusBadge, isQualityStatus } from '@/components/quality/status-badge';
import { ForbiddenState } from '@/pages/tenant-page';
import { errorCode, errorStatus, localizeError } from '@/lib/session';
import { formatDate, issueText } from '@/lib/import-model';
import { cn } from '@/lib/utils';
import '@/lib/quality-i18n';
import '@/lib/runs-i18n';
import { useLocation, useSearch } from 'wouter';
import { UUID_RE } from '@/components/runs/shared';
import { useSource } from '@/components/source/source-context';
import '@/lib/source-i18n';

const SEVERITIES: GetQualitySeverity[] = ['error', 'warning', 'info'];
const GROUPS: GetQualityGroup[] = ['volume', 'changeover', 'downtime', 'file', 'import', 'all'];

function meaning(t: TFunction, code: string) {
  return i18n.exists(`q.meaning.${code}`) ? t(`q.meaning.${code}`) : t('q.meaning.unknown', { code });
}
function why(t: TFunction, code: string) {
  return i18n.exists(`q.why.${code}`) ? t(`q.why.${code}`) : t('q.why.unknown');
}
function groupText(t: TFunction, g: string) {
  return g
    .split(',')
    .map((x) => t(`q.groups.${x.trim()}`, { defaultValue: x }))
    .join(' / ');
}
function sevText(t: TFunction, s: string) {
  return t(`imp.check.severity.${s}`, { defaultValue: s });
}

/* ---------------- Summary ---------------- */

function Stat({ label, value, status, testId }: { label: string; value: number; status: 'green' | 'yellow' | 'red'; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background px-3 py-3">
      <QualityStatusBadge status={status} label={label} size="sm" />
      <span className="num text-2xl font-semibold leading-none tracking-tight" data-testid={testId}>{value}</span>
    </div>
  );
}

function Summary({ summary }: { summary: QualityPage['summary'] }) {
  const { t } = useTranslation();
  return (
    <section className="fade-up grid gap-4 lg:grid-cols-2" aria-label={t('q.summary.issuesTitle')} data-testid="section-quality-summary">
      <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <h2 className="text-sm font-semibold">{t('q.summary.issuesTitle')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground" data-testid="text-summary-issues-scope">{t('q.summary.issuesScope')}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label={t('q.summary.errors')} value={summary.errors} status="red" testId="text-summary-errors" />
          <Stat label={t('q.summary.warnings')} value={summary.warnings} status="yellow" testId="text-summary-warnings" />
          <Stat label={t('q.summary.notes')} value={summary.notes} status="green" testId="text-summary-notes" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <h2 className="text-sm font-semibold">{t('q.summary.ordersTitle')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground" data-testid="text-summary-orders-scope">{t('q.summary.ordersScope')}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label={t('q.status.green')} value={summary.orders.green} status="green" testId="text-summary-orders-green" />
          <Stat label={t('q.status.yellow')} value={summary.orders.yellow} status="yellow" testId="text-summary-orders-yellow" />
          <Stat label={t('q.status.red')} value={summary.orders.red} status="red" testId="text-summary-orders-red" />
        </div>
      </div>
    </section>
  );
}

/* ---------------- Filters ---------------- */

type Filters = { severity?: GetQualitySeverity; group?: GetQualityGroup; order?: string; source?: string; includeArchived: boolean };

function FilterBar({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState(value.order ?? '');
  const [source, setSource] = useState(value.source ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onChange({ ...value, order: order.trim() || undefined, source: source.trim() || undefined });
  };
  const active = !!(value.severity || value.group || value.order || value.source || value.includeArchived);
  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-4 sm:p-5" aria-label={t('q.filters.title')} data-testid="form-quality-filters">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto] lg:items-end">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t('q.filters.severity')}
          <NativeSelect
            value={value.severity ?? ''}
            onChange={(e) => onChange({ ...value, severity: (e.target.value || undefined) as GetQualitySeverity | undefined })}
            data-testid="select-filter-severity"
          >
            <option value="">{t('q.filters.any')}</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{sevText(t, s)}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t('q.filters.group')}
          <NativeSelect
            value={value.group ?? ''}
            onChange={(e) => onChange({ ...value, group: (e.target.value || undefined) as GetQualityGroup | undefined })}
            data-testid="select-filter-group"
          >
            <option value="">{t('q.filters.any')}</option>
            {GROUPS.map((g) => <option key={g} value={g}>{t(`q.groups.${g}`)}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t('q.filters.order')}
          <Input dir="auto" className="h-11 bg-card" value={order} onChange={(e) => setOrder(e.target.value)} placeholder={t('q.filters.orderPlaceholder')} data-testid="input-filter-order" />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t('q.filters.source')}
          <Input dir="auto" className="h-11 bg-card" value={source} onChange={(e) => setSource(e.target.value)} placeholder={t('q.filters.sourcePlaceholder')} data-testid="input-filter-source" />
        </label>
        <Button type="submit" className="min-h-11" data-testid="button-apply-filters">{t('q.filters.apply')}</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={value.includeArchived}
            onChange={(e) => onChange({ ...value, includeArchived: e.target.checked })}
            data-testid="checkbox-include-archived"
          />
          <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>{t('q.filters.archived')}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">· {t('q.filters.archivedHint')}</span>
        </label>
        {active && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 gap-1.5"
            onClick={() => {
              setOrder('');
              setSource('');
              onChange({ includeArchived: false });
            }}
            data-testid="button-clear-filters"
          >
            <X className="size-4" aria-hidden="true" />
            {t('q.filters.clear')}
          </Button>
        )}
      </div>
    </form>
  );
}

/* ---------------- Issue pieces ---------------- */

function Tags({ issue }: { issue: QualityIssue }) {
  const { t } = useTranslation();
  if (!issue.superseded && !issue.archived) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {issue.superseded && (
        <span className="inline-flex items-center gap-1 rounded-md border border-dashed bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid={`tag-superseded-${issue.id}`}>
          <History className="size-3" aria-hidden="true" />
          {t('q.tags.superseded')}
        </span>
      )}
      {issue.archived && (
        <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid={`tag-archived-${issue.id}`}>
          <Archive className="size-3" aria-hidden="true" />
          {t('q.tags.archived')}
        </span>
      )}
    </span>
  );
}

function Refs({ issue, max = 2 }: { issue: QualityIssue; max?: number }) {
  const { t } = useTranslation();
  if (issue.refs.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = issue.refs.slice(0, max);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" data-testid={`text-refs-${issue.id}`}>
      {shown.map((r, i) => (
        <span key={`${r.file}-${r.line}-${i}`} className="inline-flex min-w-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
          <FileText className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Raw className="truncate text-xs">{r.file}</Raw>
          <span className="num text-muted-foreground">:{r.line}</span>
        </span>
      ))}
      {issue.refs.length > max && <span className="text-xs text-muted-foreground">{t('q.list.more', { n: issue.refs.length - max })}</span>}
    </span>
  );
}

function OrderCell({ issue }: { issue: QualityIssue }) {
  const { t } = useTranslation();
  return issue.orderId ? (
    <Raw className="text-sm font-semibold">{issue.orderId}</Raw>
  ) : (
    <span className="text-xs text-muted-foreground">{t('q.list.noOrder')}</span>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

function IssueDetail({ issue, lang }: { issue: QualityIssue; lang: string }) {
  const { t } = useTranslation();
  const { openSource } = useSource();
  const groupEntries = Object.entries(issue.groupStatuses ?? {});
  return (
    <div className="grid gap-5 border-t bg-[color-mix(in_srgb,var(--primary)_3%,var(--card))] p-4 sm:p-5 lg:grid-cols-[1fr_1.1fr]" data-testid={`detail-issue-${issue.id}`}>
      <div className="min-w-0 space-y-4">
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Info className="size-3.5 text-primary" aria-hidden="true" />{t('q.detail.meaning')}</h4>
          <p className="mt-1 text-sm leading-relaxed" data-testid={`text-meaning-${issue.id}`}>{meaning(t, issue.code)}</p>
        </div>
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><AlertTriangle className="size-3.5 text-primary" aria-hidden="true" />{t('q.detail.why')}</h4>
          <p className="mt-1 text-sm leading-relaxed" data-testid={`text-why-${issue.id}`}>{why(t, issue.code)}</p>
        </div>

        {issue.comparable === false && (
          <div role="note" className="rounded-lg border border-[color-mix(in_srgb,var(--status-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-red)_6%,var(--card))] p-3" data-testid={`status-not-comparable-${issue.id}`}>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-status-red"><OctagonX className="size-4" aria-hidden="true" />{t('q.detail.notComparable')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('q.detail.notComparableBody')}</p>
            <ul className="mt-2 space-y-1">
              {issue.blockedReasons.map((r) => (
                <li key={r} className="text-sm" data-testid={`text-blocked-reason-${issue.id}-${r}`}>
                  <Raw className="text-xs font-semibold">{r}</Raw> — {issueText(t, r)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold">{t('q.detail.context')}</h4>
          <dl className="mt-2 grid grid-cols-2 gap-3 rounded-lg border bg-card p-3">
            <DetailField label={t('q.detail.source')}><Raw className="text-sm">{issue.sourceName}</Raw></DetailField>
            <DetailField label={t('q.detail.order')}><OrderCell issue={issue} /></DetailField>
            <DetailField label={t('q.detail.importId')}><Raw className="break-all text-xs">{issue.importId}</Raw></DetailField>
            <DetailField label={t('q.detail.approvedAt')}>
              <span className="num">{issue.approvedAt ? formatDate(issue.approvedAt, lang) : '—'}</span>
            </DetailField>
          </dl>
          <div className="mt-2"><Tags issue={issue} /></div>
        </div>

        <div>
          <h4 className="text-xs font-semibold">{t('q.detail.overall')}</h4>
          {isQualityStatus(issue.overallStatus) ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <QualityStatusBadge status={issue.overallStatus} testId={`status-overall-${issue.id}`} />
              {issue.comparable === true && <span className="text-xs text-muted-foreground">{t('q.detail.comparable')}</span>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t('q.detail.noRun')}</p>
          )}
          {groupEntries.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-3" aria-label={t('q.detail.groups')}>
              {groupEntries.map(([g, s]) => (
                <li key={g} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2">
                  <span className="text-xs font-medium">{t(`q.groups.${g}`, { defaultValue: g })}</span>
                  {isQualityStatus(s) ? (
                    <QualityStatusBadge status={s} size="sm" testId={`status-group-${issue.id}-${g}`} />
                  ) : (
                    <Raw className="text-xs">{s}</Raw>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <h4 className="text-xs font-semibold">{t('q.detail.rows')}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{t('src.rowsLead')}</p>
        <div className="mt-2"><Refs issue={issue} max={6} /></div>
        <Button variant="outline" className="mt-3 min-h-11 gap-2" aria-haspopup="dialog" onClick={(e) => openSource({ kind: 'issue', id: issue.id }, e.currentTarget)} data-testid={`button-open-source-detail-${issue.id}`}>
          <Rows3 className="size-4" aria-hidden="true" />{t('src.openSource')}
        </Button>
      </div>
    </div>
  );
}

function IssueItem({ issue, open, onToggle, lang }: { issue: QualityIssue; open: boolean; onToggle: () => void; lang: string }) {
  const { t } = useTranslation();
  const { openSource } = useSource();
  const panelId = `quality-detail-${issue.id}`;
  return (
    <li className={cn('border-b last:border-b-0', issue.superseded && 'bg-[color-mix(in_srgb,var(--muted)_70%,transparent)]')} data-testid={`card-issue-${issue.id}`}>
      <button
        type="button"
        onClick={(e) => openSource({ kind: 'issue', id: issue.id }, e.currentTarget)}
        aria-haspopup="dialog"
        aria-label={`${issue.code} · ${issueText(t, issue.code)} · ${t('src.openSource')}`}
        className="hover-elevate grid min-h-11 w-full gap-3 px-4 py-3.5 text-start focus-visible:outline-offset-[-2px] md:grid-cols-[7.5rem_minmax(0,1fr)_8rem_8rem_minmax(0,12rem)_1.5rem] md:items-center md:gap-4"
        data-testid={`button-open-issue-${issue.id}`}
      >
        <span className="flex items-center justify-between gap-2 md:block">
          <QualityStatusBadge status={issue.severityStatus} label={sevText(t, issue.severity)} testId={`status-severity-${issue.id}`} />
        </span>
        <span className="min-w-0 space-y-1">
          <Raw className="block text-[11px] font-semibold text-muted-foreground">{issue.code}</Raw>
          <span className="block text-sm font-medium leading-snug" data-testid={`text-issue-message-${issue.id}`}>{issueText(t, issue.code)}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t('q.detail.source')}:</span><Raw className="text-xs text-foreground">{issue.sourceName}</Raw>
          </span>
          <Tags issue={issue} />
        </span>
        <span className="grid grid-cols-[6rem_1fr] items-baseline gap-2 md:block">
          <span className="text-xs text-muted-foreground md:hidden">{t('q.list.colOrder')}</span>
          <span data-testid={`text-issue-order-${issue.id}`}><OrderCell issue={issue} /></span>
        </span>
        <span className="grid grid-cols-[6rem_1fr] items-baseline gap-2 md:block">
          <span className="text-xs text-muted-foreground md:hidden">{t('q.list.colGroup')}</span>
          <span className="text-sm" data-testid={`text-issue-group-${issue.id}`}>{groupText(t, issue.group)}</span>
        </span>
        <span className="grid grid-cols-[6rem_1fr] items-baseline gap-2 md:block">
          <span className="text-xs text-muted-foreground md:hidden">{t('q.list.colSource')}</span>
          <Refs issue={issue} />
        </span>
        <Rows3 className="hidden size-4 text-primary md:block" aria-hidden="true" />
      </button>
      <div className="flex justify-end px-2 pb-1.5 md:-mt-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 gap-1.5 text-xs"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t(open ? 'q.list.collapse' : 'q.list.expand', { code: issue.code })}
          data-testid={`button-toggle-issue-${issue.id}`}
        >
          {open ? t('src.hideDetails') : t('src.details')}
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </Button>
      </div>
      <div id={panelId} role="region" aria-label={t('q.list.details')} hidden={!open}>
        {open && <IssueDetail issue={issue} lang={lang} />}
      </div>
    </li>
  );
}

/* ---------------- Focused (deep-linked) issue ---------------- */

function FocusedIssue({ id, session, lang, onDismiss }: { id: string; session: Session; lang: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  const valid = UUID_RE.test(id);
  const q = useGetQualityIssue(id, { query: {
    queryKey: [...getGetQualityIssueQueryKey(id), session.activeFactoryId, session.user?.id],
    enabled: valid,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  } });
  const notFound = !valid || (q.isError && [400, 403, 404].includes(errorStatus(q.error) ?? 0));
  return (
    <section className="fade-up rounded-xl border-2 border-primary/40 bg-card shadow-[var(--shadow-md)]" aria-labelledby="focused-issue-title" data-testid="section-focused-issue">
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id="focused-issue-title" className="text-sm font-semibold">{t('rc.focus.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('rc.focus.lead')}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={onDismiss} aria-label={t('rc.focus.dismiss')} data-testid="button-dismiss-focused">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>
      {notFound ? (
        <StateScreen icon={SearchX} tone="amber" title={t('rc.focus.notFoundTitle')} body={t('rc.focus.notFoundBody')} testId="state-focused-not-found" />
      ) : q.isLoading ? (
        <div role="status" aria-busy="true" className="space-y-2 p-4" data-testid="state-focused-loading">
          <span className="sr-only">{t('rc.focus.loading')}</span>
          <div className="h-6 w-40 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : q.isError ? (
        <div className="p-4">
          <ErrorNote error={q.error} testId="state-focused-error" action={
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => q.refetch()} data-testid="button-retry-focused"><RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}</Button>
          } />
        </div>
      ) : q.data ? (
        <ul data-testid="focused-issue">
          <IssueItem issue={q.data} lang={lang} open onToggle={onDismiss} />
        </ul>
      ) : null}
    </section>
  );
}

/* ---------------- Page ---------------- */

function ListSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-4" data-testid="state-quality-loading">
      <span className="sr-only">{t('q.states.loading')}</span>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
      </div>
      <div className="rounded-xl border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0" style={{ opacity: 1 - i * 0.15 }}>
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            <div className="hidden h-4 w-24 animate-pulse rounded bg-muted md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QualityPageView({ session }: { session: Session }) {
  const { t, i18n: inst } = useTranslation();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [initial] = useState(() => {
    const sp = new URLSearchParams(search);
    return { issue: sp.get('issue') ?? '', source: sp.get('source') || undefined, order: sp.get('order') || undefined };
  });
  const [focusId, setFocusId] = useState(initial.issue);
  const [filters, setFilters] = useState<Filters>({ includeArchived: false, source: initial.source, order: initial.order });
  const dismissFocus = () => { setFocusId(''); navigate('/quality', { replace: true }); };
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const factory = session.memberships.find((m) => m.factoryId === session.activeFactoryId);

  const params: GetQualityParams = {
    page,
    severity: filters.severity,
    group: filters.group,
    order: filters.order,
    source: filters.source,
    includeArchived: filters.includeArchived || undefined,
  };
  const q = useGetQuality(params, { query: {
    queryKey: [...getGetQualityQueryKey(params), session.activeFactoryId, session.user?.id],
    staleTime: 0,
    refetchOnMount: 'always',
  } });

  const changeFilters = (f: Filters) => {
    setFilters(f);
    setPage(1);
    setOpenId(null);
  };
  const filtered = !!(filters.severity || filters.group || filters.order || filters.source);

  let body: ReactNode;
  if (q.isLoading) body = <ListSkeleton />;
  else if (q.isError) {
    if (errorStatus(q.error) === 403) return <ForbiddenState session={session} />;
    body = (
      <StateScreen
        icon={AlertTriangle}
        tone="red"
        title={t('q.states.errorTitle')}
        body={localizeError(t, q.error)}
        code={errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined}
        testId="state-quality-error"
        actions={
          <Button onClick={() => q.refetch()} disabled={q.isFetching} className="gap-2" data-testid="button-retry-quality">
            <RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}
          </Button>
        }
      />
    );
  } else if (q.data) {
    const d = q.data;
    body = (
      <div className="space-y-5">
        {focusId && <FocusedIssue id={focusId} session={session} lang={inst.language} onDismiss={dismissFocus} />}
        <Summary summary={d.summary} />
        <FilterBar value={filters} onChange={changeFilters} />
        <section aria-labelledby="quality-list-title" aria-busy={q.isFetching} className={cn('transition-opacity', q.isFetching && !q.isLoading && 'opacity-70')}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 id="quality-list-title" className="text-sm font-semibold">{t('q.list.title')}</h2>
            <span className="num text-xs text-muted-foreground" data-testid="text-quality-total">{t('q.list.count', { total: d.total })}</span>
          </div>
          {d.items.length === 0 ? (
            <div className="rounded-xl border bg-card">
              {filtered ? (
                <StateScreen icon={SearchX} title={t('q.states.noMatchTitle')} body={t('q.states.noMatchBody')} testId="state-quality-no-match" />
              ) : (
                <StateScreen icon={ShieldCheck} title={t('q.states.emptyTitle')} body={t('q.states.emptyBody')} testId="state-quality-empty" />
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-sm)]">
              <div className="hidden grid-cols-[7.5rem_minmax(0,1fr)_8rem_8rem_minmax(0,12rem)_1.5rem] gap-4 border-b bg-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid" aria-hidden="true">
                <span>{t('q.list.colSeverity')}</span>
                <span>{t('q.list.colIssue')}</span>
                <span>{t('q.list.colOrder')}</span>
                <span>{t('q.list.colGroup')}</span>
                <span>{t('q.list.colSource')}</span>
                <span />
              </div>
              <ul data-testid="list-quality-issues">
                {d.items.map((it) => (
                  <IssueItem key={it.id} issue={it} lang={inst.language} open={openId === it.id} onToggle={() => setOpenId((cur) => (cur === it.id ? null : it.id))} />
                ))}
              </ul>
            </div>
          )}
          <Pager page={d.page} total={d.total} onPage={(p) => { setPage(p); setOpenId(null); }} testId="pager-quality" />
        </section>
      </div>
    );
  }

  return (
    <div data-testid="page-quality">
      <PageHeader
        icon={PAGE_ICONS.quality}
        title={t('q.page.title')}
        lead={t('q.page.lead')}
        meta={factory ? `${factory.factoryName} · ${t('q.page.readOnly')}` : t('q.page.readOnly')}
      />
      {body}
    </div>
  );
}
