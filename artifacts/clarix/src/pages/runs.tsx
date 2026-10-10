import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, ArrowLeftRight, Calendar, Inbox, RotateCcw, SearchX, X } from 'lucide-react';
import {
  getListProductionRunsQueryKey,
  useListProductionRuns,
  type ListProductionRunsParams,
  type ListProductionRunsSort,
  type ListProductionRunsStatus,
  type ProductionRun,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/empty-page';
import { PAGE_ICONS } from '@/components/app-shell';
import { StateScreen } from '@/components/state-screen';
import { NativeSelect, Pager, Raw } from '@/components/imports/shared';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { LIST_KEYS, MetricValue, SourceChip, metricOf } from '@/components/runs/shared';
import { RefPanel, SourceLink, useRefPanels, type RefPanels } from '@/components/runs/refs';
import { ForbiddenState } from '@/pages/tenant-page';
import { errorCode, errorStatus, localizeError } from '@/lib/session';
import { cn } from '@/lib/utils';
import '@/lib/runs-i18n';

type Filters = { search?: string; source?: string; status?: ListProductionRunsStatus; sort?: ListProductionRunsSort };
const STATUSES: ListProductionRunsStatus[] = ['green', 'yellow', 'red'];

function FilterBar({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState(value.search ?? '');
  const [source, setSource] = useState(value.source ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onChange({ ...value, search: search.trim() || undefined, source: source.trim() || undefined });
  };
  const active = !!(value.search || value.source || value.status || value.sort);
  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-4 sm:p-5" data-testid="form-runs-filters">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.3fr_1fr_1fr_auto] lg:items-end">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t('rc.runs.search')}
          <Input dir="auto" type="search" className="h-11 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('rc.runs.searchPlaceholder')} data-testid="input-runs-search" />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t('rc.runs.source')}
          <Input dir="auto" className="h-11 bg-card" value={source} onChange={(e) => setSource(e.target.value)} placeholder={t('rc.runs.sourcePlaceholder')} data-testid="input-runs-source" />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t('rc.runs.status')}
          <NativeSelect value={value.status ?? ''} onChange={(e) => onChange({ ...value, status: (e.target.value || undefined) as ListProductionRunsStatus | undefined })} data-testid="select-runs-status">
            <option value="">{t('rc.runs.any')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`q.status.${s}`)}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t('rc.runs.sort')}
          <NativeSelect value={value.sort ?? 'order'} onChange={(e) => onChange({ ...value, sort: e.target.value as ListProductionRunsSort })} data-testid="select-runs-sort">
            <option value="order">{t('rc.runs.sortOrder')}</option>
            <option value="status">{t('rc.runs.sortStatus')}</option>
          </NativeSelect>
        </label>
        <Button type="submit" className="min-h-11" data-testid="button-runs-apply">{t('rc.runs.apply')}</Button>
      </div>
      {active && (
        <div className="mt-3 flex justify-end border-t pt-3">
          <Button type="button" variant="ghost" className="min-h-11 gap-1.5" onClick={() => { setSearch(''); setSource(''); onChange({}); }} data-testid="button-runs-clear">
            <X className="size-4" aria-hidden="true" />{t('rc.runs.clear')}
          </Button>
        </div>
      )}
    </form>
  );
}

function SelectBox({ run, checked, disabled, onToggle }: { run: ProductionRun; checked: boolean; disabled: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <label className={cn('flex size-11 shrink-0 items-center justify-center rounded-md', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover-elevate')}>
      <input
        type="checkbox"
        className="size-[18px] accent-[var(--primary)]"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        aria-label={t('rc.runs.select', { order: run.orderId, source: run.sourceName })}
        title={disabled ? t('rc.runs.maxTwo') : undefined}
        data-testid={`checkbox-run-${run.id}`}
      />
    </label>
  );
}

function OrderId({ run, dup }: { run: ProductionRun; dup: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <Raw className="text-sm font-semibold" >{run.orderId}</Raw>
      {dup && (
        <span className="rounded border border-dashed border-[color-mix(in_srgb,var(--status-amber)_50%,transparent)] px-1.5 text-[10px] font-medium text-status-amber" data-testid={`tag-same-order-${run.id}`}>
          {t('rc.runs.sameOrder')}
        </span>
      )}
    </span>
  );
}

const runAnchor = (runId: string, key: string) => `src-run-${runId}-${key}`;

function DateText({ run, panels, testId }: { run: ProductionRun; panels: RefPanels; testId: string }) {
  const { t } = useTranslation();
  return (
    <SourceLink target={runAnchor(run.id, 'date')} panels={panels} label={`${run.orderId} · ${t('rc.runs.colDate')}`} testId={`link-${testId}`}>
      {run.date ? <span className="num text-sm" data-testid={testId}>{run.date}</span> : <span className="text-xs italic text-muted-foreground" data-testid={testId}>{t('rc.runs.noDate')}</span>}
    </SourceLink>
  );
}

function ValueCell({ run, k, panels, testId, className }: { run: ProductionRun; k: string; panels: RefPanels; testId: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <SourceLink target={runAnchor(run.id, k)} panels={panels} label={`${run.orderId} · ${run.sourceName} · ${t(`rc.metric.${k}`)}`} testId={`link-${testId}`} className={className}>
      <MetricValue m={metricOf(run.metrics, k)} showHours={false} className={className} testId={testId} />
    </SourceLink>
  );
}

function RunSources({ runs, panels, onClose }: { runs: ProductionRun[]; panels: RefPanels; onClose: (id: string) => void }) {
  const { t } = useTranslation();
  if (runs.length === 0) return null;
  return (
    <section aria-labelledby="runs-sources" className="space-y-3 rounded-xl border bg-card p-4" data-testid="section-runs-sources">
      <div>
        <h2 id="runs-sources" className="text-sm font-semibold">{t('rc.runs.sourcesTitle')}</h2>
        <p className="text-xs text-muted-foreground">{t('rc.runs.sourcesLead')}</p>
      </div>
      {runs.map((r) => (
        <div key={r.id} className="rounded-lg border bg-background p-3" data-testid={`sources-run-${r.id}`}>
          <div className="mb-2 flex items-center gap-2">
            <Raw className="text-sm font-semibold">{r.orderId}</Raw>
            <SourceChip run={r} />
            <span className="flex-1" />
            <Button variant="ghost" size="icon" className="size-11" onClick={() => onClose(r.id)} aria-label={t('rc.runs.remove', { order: r.orderId, source: r.sourceName })} data-testid={`button-close-sources-${r.id}`}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <RefPanel id={runAnchor(r.id, 'date')} panels={panels} refs={r.dateRefs} title={t('rc.cmp.sourceFor', { metric: t('rc.cmp.dateRefs'), side: `${r.orderId} · ${r.sourceName}` })} />
            {LIST_KEYS.map((k) => (
              <RefPanel key={k} id={runAnchor(r.id, k)} panels={panels} refs={metricOf(r.metrics, k)?.refs ?? []} title={t('rc.cmp.sourceFor', { metric: t(`rc.metric.${k}`), side: `${r.orderId} · ${r.sourceName}` })} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function Tray({ selected, onRemove, onClear, onCompare }: { selected: ProductionRun[]; onRemove: (id: string) => void; onClear: () => void; onCompare: () => void }) {
  const { t } = useTranslation();
  const hint = selected.length === 0 ? 'zero' : selected.length === 1 ? 'one' : 'two';
  return (
    <section aria-label={t('rc.runs.tray')} className="sticky bottom-3 z-20 rounded-xl border bg-card/95 p-3 shadow-[var(--shadow-lg)] backdrop-blur sm:p-4" data-testid="tray-selection">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{t('rc.runs.tray')} <span className="num font-normal text-muted-foreground">· {selected.length}/2</span></p>
          <p className="text-xs text-muted-foreground" aria-live="polite" data-testid="text-tray-hint">{t(`rc.runs.trayHint_${hint}`)}</p>
        </div>
        <ol className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-[34rem]">
          {[0, 1].map((i) => {
            const r = selected[i];
            return (
              <li key={i} className={cn('flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-2 py-1', r ? 'bg-secondary' : 'border-dashed')} data-testid={`slot-${i === 0 ? 'a' : 'b'}`}>
                <span className="grid size-6 shrink-0 place-items-center rounded bg-primary text-[11px] font-bold text-primary-foreground">{i === 0 ? t('rc.cmp.sideA') : t('rc.cmp.sideB')}</span>
                {r ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <Raw className="block truncate text-xs font-semibold">{r.orderId}</Raw>
                      <SourceChip run={r} testId={`text-slot-source-${i === 0 ? 'a' : 'b'}`} />
                    </span>
                    <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={() => onRemove(r.id)} aria-label={t('rc.runs.remove', { order: r.orderId, source: r.sourceName })} data-testid={`button-remove-${r.id}`}>
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('rc.runs.slotEmpty')}</span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <Button variant="outline" className="min-h-11" onClick={onClear} data-testid="button-clear-selection">{t('rc.runs.clearSelection')}</Button>
          )}
          <Button className="min-h-11 flex-1 gap-2 lg:flex-none" disabled={selected.length !== 2} onClick={onCompare} data-testid="button-compare">
            <ArrowLeftRight className="size-4" aria-hidden="true" />{t('rc.runs.compare')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="rounded-xl border bg-card" data-testid="state-runs-loading">
      <span className="sr-only">{t('rc.runs.loading')}</span>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0" style={{ opacity: 1 - i * 0.13 }}>
          <div className="size-5 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function RunsPage({ session }: { session: Session }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ProductionRun[]>([]);
  const factory = session.memberships.find((m) => m.factoryId === session.activeFactoryId);
  const basePanels = useRefPanels();
  const [refRuns, setRefRuns] = useState<ProductionRun[]>([]);
  const panelsFor = (r: ProductionRun): RefPanels => ({
    ...basePanels,
    open: (id: string) => {
      setRefRuns((c) => (c.some((x) => x.id === r.id) ? c : [...c, r]));
      basePanels.open(id);
    },
  });

  const params: ListProductionRunsParams = { page, search: filters.search, source: filters.source, status: filters.status, sort: filters.sort };
  const q = useListProductionRuns(params, { query: {
    queryKey: [...getListProductionRunsQueryKey(params), session.activeFactoryId, session.user?.id],
    staleTime: 0,
    refetchOnMount: 'always',
  } });

  const items = q.data?.items;
  const dupOrders = useMemo(() => {
    const seen = new Map<string, Set<string>>();
    for (const r of items ?? []) seen.set(r.orderId, (seen.get(r.orderId) ?? new Set()).add(r.sourceName));
    return new Set([...seen].filter(([, s]) => s.size > 1).map(([o]) => o));
  }, [items]);

  const isSel = (id: string) => selected.some((s) => s.id === id);
  const toggle = (r: ProductionRun) =>
    setSelected((cur) => (cur.some((s) => s.id === r.id) ? cur.filter((s) => s.id !== r.id) : cur.length >= 2 ? cur : [...cur, r]));
  const compare = () => {
    if (selected.length !== 2) return;
    navigate(`/comparison?${new URLSearchParams({ a: selected[0].id, b: selected[1].id }).toString()}`);
  };
  const filtered = !!(filters.search || filters.source || filters.status);

  let body: ReactNode;
  if (q.isLoading) body = <Skeleton />;
  else if (q.isError) {
    if (errorStatus(q.error) === 403) return <ForbiddenState session={session} />;
    body = (
      <div className="rounded-xl border bg-card">
        <StateScreen icon={AlertTriangle} tone="red" title={t('rc.runs.errorTitle')} body={localizeError(t, q.error)}
          code={errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined} testId="state-runs-error"
          actions={<Button onClick={() => q.refetch()} disabled={q.isFetching} className="min-h-11 gap-2" data-testid="button-retry-runs"><RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}</Button>} />
      </div>
    );
  } else if (q.data && q.data.items.length === 0) {
    body = (
      <div className="rounded-xl border bg-card">
        {filtered ? (
          <StateScreen icon={SearchX} title={t('rc.runs.noMatchTitle')} body={t('rc.runs.noMatchBody')} testId="state-runs-no-match" />
        ) : (
          <StateScreen icon={Inbox} title={t('rc.runs.emptyTitle')} body={t('rc.runs.emptyBody')} testId="state-runs-empty"
            actions={session.allowedPages.includes('imports') ? <Link href="/imports" className="inline-flex min-h-11 items-center rounded-md border bg-card px-4 text-sm font-medium hover-elevate" data-testid="link-runs-imports">{t('rc.runs.goImports')}</Link> : undefined} />
        )}
      </div>
    );
  } else if (q.data) {
    const d = q.data;
    const lockOthers = selected.length >= 2;
    body = (
      <>
        {/* Desktop / tablet table */}
        <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-sm)] md:block">
          <table className="w-full min-w-[920px] text-sm" data-testid="table-runs">
            <thead>
              <tr className="border-b bg-muted text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-14 px-2 py-2.5"><span className="sr-only">{t('rc.runs.colSelect')}</span></th>
                <th className="px-3 py-2.5 text-start">{t('rc.runs.colOrder')}</th>
                <th className="px-3 py-2.5 text-start">{t('rc.runs.colSource')}</th>
                <th className="px-3 py-2.5 text-start">{t('rc.runs.colDate')}</th>
                {LIST_KEYS.map((k) => <th key={k} className="px-3 py-2.5 text-end">{t(`rc.metric.${k}`)}</th>)}
                <th className="px-3 py-2.5 text-start">{t('rc.runs.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((r) => {
                const sel = isSel(r.id);
                return (
                  <tr key={r.id} className={cn('border-b last:border-0', sel && 'bg-accent')} data-testid={`row-run-${r.id}`} aria-selected={sel}>
                    <td className="px-1.5 py-1"><SelectBox run={r} checked={sel} disabled={!sel && lockOthers} onToggle={() => toggle(r)} /></td>
                    <td className="px-3 py-2.5 align-middle" data-testid={`text-run-order-${r.id}`}><OrderId run={r} dup={dupOrders.has(r.orderId)} /></td>
                    <td className="max-w-[12rem] px-3 py-2.5"><SourceChip run={r} testId={`text-run-source-${r.id}`} /></td>
                    <td className="px-2 py-1"><DateText run={r} panels={panelsFor(r)} testId={`text-run-date-${r.id}`} /></td>
                    {LIST_KEYS.map((k) => (
                      <td key={k} className="px-1.5 py-1 text-end">
                        <ValueCell run={r} k={k} panels={panelsFor(r)} className="items-end" testId={`text-run-${k}-${r.id}`} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5"><QualityStatusBadge status={r.overall} testId={`status-run-${r.id}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="space-y-3 md:hidden" data-testid="list-runs-cards">
          {d.items.map((r) => {
            const sel = isSel(r.id);
            return (
              <li key={r.id} className={cn('rounded-xl border bg-card p-3 shadow-[var(--shadow-sm)]', sel && 'border-primary bg-accent')} data-testid={`card-run-${r.id}`}>
                <div className="flex items-start gap-2">
                  <SelectBox run={r} checked={sel} disabled={!sel && lockOthers} onToggle={() => toggle(r)} />
                  <div className="min-w-0 flex-1 space-y-1.5 pt-1">
                    <div className="flex items-start justify-between gap-2">
                      <OrderId run={r} dup={dupOrders.has(r.orderId)} />
                      <QualityStatusBadge status={r.overall} size="sm" testId={`status-run-card-${r.id}`} />
                    </div>
                    <SourceChip run={r} testId={`text-run-card-source-${r.id}`} />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="size-3" aria-hidden="true" /><DateText run={r} panels={panelsFor(r)} testId={`text-run-card-date-${r.id}`} /></div>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3">
                  {LIST_KEYS.map((k) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[11px] text-muted-foreground">{t(`rc.metric.${k}`)}</dt>
                      <dd><ValueCell run={r} k={k} panels={panelsFor(r)} testId={`text-run-card-${k}-${r.id}`} /></dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
        <Pager page={d.page} total={d.total} onPage={setPage} testId="pager-runs" />
      </>
    );
  }

  return (
    <div data-testid="page-runs">
      <PageHeader icon={PAGE_ICONS.runs} title={t('rc.runs.title')} lead={t('rc.runs.lead')} meta={factory ? `${factory.factoryName} · ${t('rc.runs.meta')}` : t('rc.runs.meta')} />
      <div className="space-y-4">
        <FilterBar value={filters} onChange={(f) => { setFilters(f); setPage(1); }} />
        <section aria-busy={q.isFetching} className={cn('space-y-3 transition-opacity', q.isFetching && !q.isLoading && 'opacity-70')}>
          {q.data && (
            <div className="flex justify-end px-1">
              <span className="num text-xs text-muted-foreground" data-testid="text-runs-total">{t('rc.runs.count', { count: q.data.total })}</span>
            </div>
          )}
          {body}
        </section>
        <RunSources runs={refRuns} panels={basePanels} onClose={(id) => setRefRuns((c) => c.filter((x) => x.id !== id))} />
        <Tray selected={selected} onRemove={(id) => setSelected((c) => c.filter((s) => s.id !== id))} onClear={() => setSelected([])} onCompare={compare} />
      </div>
    </div>
  );
}
