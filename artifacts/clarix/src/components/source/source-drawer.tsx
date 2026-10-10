import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { keepPreviousData } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Copy, FileText, Link2Off, Rows3, RotateCcw, SearchX, Sigma, TriangleAlert, X } from 'lucide-react';
import {
  getGetSourceDetailQueryKey,
  useGetSourceDetail,
  type GetSourceDetailParams,
  type Session,
  type SourceDetail,
  type SourceRow,
  type SourceText,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Raw } from '@/components/imports/shared';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { UUID_RE } from '@/components/runs/shared';
import { errorCode, errorStatus, localizeError } from '@/lib/session';
import { formatDate, issueText } from '@/lib/import-model';
import { cn } from '@/lib/utils';
import type { SourceTarget } from '@/components/source/source-context';
import '@/lib/runs-i18n';
import '@/lib/quality-i18n';
import { MetricTerm } from '@/components/charts/glossary';
import '@/lib/source-i18n';

const ROWS_PAGE = 20;
const LIST_PAGE = 8;
const PAIRS_PAGE = 3;

const KIND_CLS: Record<string, string> = {
  included: 'border-[color-mix(in_srgb,var(--status-green)_40%,transparent)] text-status-green',
  excluded: 'border-dashed border-[color-mix(in_srgb,var(--status-amber)_50%,transparent)] text-status-amber',
  quarantined: 'border-[color-mix(in_srgb,var(--status-red)_40%,transparent)] text-status-red bg-[color-mix(in_srgb,var(--status-red)_6%,var(--card))]',
  related: 'border-[color-mix(in_srgb,var(--primary)_40%,transparent)] text-primary',
};

function useLang() {
  const { i18n: inst } = useTranslation();
  return inst.language.startsWith('ar') ? 'ar' : 'en';
}
const pick = (s: SourceText | undefined, lang: 'ar' | 'en') => (s ? s[lang] || s.en : '');
const unitText = (t: (k: string, o?: Record<string, unknown>) => string, u: string) => (u ? t(`rc.unit.${u}`, { defaultValue: u }) : '');
const metricName = (t: (k: string, o?: Record<string, unknown>) => string, k: string) => t(`rc.metric.${k}`, { defaultValue: k });
const rowAnchor = (scope: string, id: string) => `source-row-${scope}-${id}`;

function focusRow(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  el.focus({ preventScroll: true });
}

/* ---------------- small building blocks ---------------- */

function Block({ title, icon: Icon, lead, children, testId, aside }: { title: string; icon?: typeof Sigma; lead?: string; children: ReactNode; testId: string; aside?: ReactNode }) {
  return (
    <section className="border-t px-4 py-5 sm:px-6" data-testid={testId} aria-label={title}>
      <div className="mb-3 flex items-start gap-2">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {lead && <p className="text-xs text-muted-foreground">{lead}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function NA({ testId }: { testId?: string }) {
  const { t } = useTranslation();
  return <span className="text-sm italic text-muted-foreground" data-na="true" data-testid={testId}>{t('src.na')}</span>;
}

function Val({ value, unit, testId, className }: { value: string | null; unit: string; testId?: string; className?: string }) {
  const { t } = useTranslation();
  if (value == null) return <NA testId={testId} />;
  return (
    <span className={cn('whitespace-nowrap', className)} data-testid={testId}>
      <span className="num font-semibold">{value}</span>
      {unit && <span className="ms-1 text-xs text-muted-foreground">{unitText(t, unit)}</span>}
    </span>
  );
}

function MiniPager({ page, pages, from, to, total, onPage, testId, label }: { page: number; pages: number; from: number; to: number; total: number; onPage: (p: number) => void; testId: string; label: string }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-card px-1 py-1" aria-label={label}>
      <Button variant="ghost" className="min-h-11 min-w-11" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('src.prev')} data-testid={`${testId}-prev`}>
        <ChevronLeft className="size-4 rtl-flip" aria-hidden="true" />
      </Button>
      <span className="num text-xs text-muted-foreground" aria-live="polite" data-testid={`${testId}-range`}>{t('src.listRange', { from, to, total })}</span>
      <Button variant="ghost" className="min-h-11 min-w-11" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('src.next')} data-testid={`${testId}-next`}>
        <ChevronRight className="size-4 rtl-flip" aria-hidden="true" />
      </Button>
    </nav>
  );
}

/** Client-side slicing of an already-delivered list (pagination metadata only, no arithmetic on values). */
function usePaged<T>(items: T[], size: number) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(page, pages);
  const start = (p - 1) * size;
  const shown = items.slice(start, start + size);
  return { shown, page: p, pages, setPage, from: start + 1, to: start + shown.length, total: items.length };
}

/* ---------------- source row ---------------- */

function RowCard({ row, scope, label }: { row: SourceRow; scope: string; label?: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const id = rowAnchor(scope, row.id);
  return (
    <article
      id={id}
      tabIndex={-1}
      className="min-w-0 scroll-mt-4 rounded-lg border bg-card focus-visible:outline-offset-2"
      aria-label={`${label ? `${label} · ` : ''}${row.file} · ${t('src.line', { n: row.line })}`}
      data-testid={`card-source-row-${scope}-${row.id}`}
      data-kind={row.kind}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2 text-xs">
        {label && <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>}
        <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', KIND_CLS[row.kind])} data-testid={`text-row-kind-${scope}-${row.id}`}>
          {t(`src.kind.${row.kind}`, { defaultValue: row.kind })}
        </span>
        <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <Raw className={cn('min-w-0 break-all text-xs font-semibold', row.kind !== 'included' && row.kind !== 'related' && 'line-through decoration-1 opacity-80')}>{row.file}</Raw>
        <span className="num font-medium" data-testid={`text-row-line-${scope}-${row.id}`}>{t('src.line', { n: row.line })}</span>
        <span className="flex w-full flex-wrap items-center gap-x-1.5 text-muted-foreground">
          <Raw className="text-[11px] [overflow-wrap:anywhere]">{row.sourceName}</Raw>
          <span aria-hidden="true">·</span>
          <span>{t('src.order')}:</span>
          {row.orderId ? <Raw className="text-[11px]">{row.orderId}</Raw> : <span>{t('src.noOrder')}</span>}
        </span>
      </header>

      {row.cells.length > 0 && (
        <table className="w-full text-xs">
          <caption className="sr-only">{t('src.rows')}</caption>
          <thead className="sr-only">
            <tr><th scope="col">{t('src.column')}</th><th scope="col">{t('src.cellValue')}</th></tr>
          </thead>
          <tbody>
            {row.cells.map((c) => {
              const reason = pick(c.reason, lang);
              return (
                <tr
                  key={c.column}
                  className={cn('border-b border-dashed align-top last:border-0', c.highlighted && 'bg-[color-mix(in_srgb,var(--status-amber)_9%,var(--card))]')}
                  data-highlighted={c.highlighted || undefined}
                  data-testid={`cell-${scope}-${row.id}-${c.column}`}
                >
                  <th scope="row" className={cn('w-2/5 px-3 py-1.5 text-start font-normal', c.highlighted && 'border-s-[3px] border-s-[var(--status-amber)]')}>
                    <Raw className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{c.column}</Raw>
                  </th>
                  <td className="px-3 py-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {c.value === '' ? <span className="italic text-muted-foreground">{t('src.emptyCell')}</span> : <Raw className="text-xs [overflow-wrap:anywhere]">{c.value}</Raw>}
                      {c.highlighted && (
                        <span className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--status-amber)_45%,transparent)] px-1 text-[10px] font-semibold text-status-amber">
                          <TriangleAlert className="size-3" aria-hidden="true" />{t('src.flagged')}
                        </span>
                      )}
                    </span>
                    {c.highlighted && reason && <span className="mt-0.5 block text-[11px] text-foreground" data-testid={`text-cell-reason-${scope}-${row.id}-${c.column}`}>{reason}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {row.event && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t px-3 py-2 text-xs sm:grid-cols-4" data-testid={`event-${scope}-${row.id}`}>
          <div><dt className="text-[10px] text-muted-foreground">{t('src.event')}</dt><dd><Raw className="text-xs">{row.event.type}</Raw></dd></div>
          <div><dt className="text-[10px] text-muted-foreground">{t('src.start')}</dt><dd className="num">{row.event.start}</dd></div>
          <div><dt className="text-[10px] text-muted-foreground">{t('src.end')}</dt><dd className="num">{row.event.end}</dd></div>
          <div><dt className="text-[10px] text-muted-foreground">{t('src.minutes')}</dt><dd><Val value={row.event.minutes} unit="min" /></dd></div>
        </dl>
      )}

      {row.contributions.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t bg-muted px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">{t('src.contributes')}</span>
          {row.contributions.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1">
              <span className="inline-flex items-center text-muted-foreground"><MetricTerm metric={c.key}>{metricName(t, c.key)}</MetricTerm></span>
              <Val value={c.value} unit={c.unit} />
            </span>
          ))}
        </p>
      )}
    </article>
  );
}

/* ---------------- sections ---------------- */

function Breakdown({ d }: { d: SourceDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const text = pick(d.breakdown, lang);
  const long = text.length > 240;
  const [expanded, setExpanded] = useState(false);
  const keys = new Set([d.key, ...d.inputs.map(i => i.key)]);
  const parts = d.rows.filter(r => r.kind === 'included').flatMap((r) =>
    r.contributions.filter(c => keys.has(c.key)).map((c) => ({ r, c })));
  if (!text && parts.length === 0) return null;
  return (
    <Block title={t('src.breakdown')} icon={Sigma} testId="section-source-breakdown">
      {text && (
        <div>
          <p
            id="source-breakdown-text"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className={cn('whitespace-pre-wrap break-words rounded-lg border bg-background px-3 py-2.5 font-mono text-[13px] leading-relaxed [overflow-wrap:anywhere]', long && !expanded && 'line-clamp-4')}
            data-testid="text-source-breakdown"
          >
            {text}
          </p>
          {long && (
            <Button variant="ghost" className="mt-1 min-h-11 px-2 text-xs text-primary" aria-expanded={expanded} aria-controls="source-breakdown-text" onClick={() => setExpanded((e) => !e)} data-testid="button-toggle-breakdown">
              {expanded ? t('src.breakdownShowLess') : t('src.breakdownShowAll')}
            </Button>
          )}
        </div>
      )}
      {parts.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t('src.parts')}</p>
          <ul className="flex flex-wrap gap-1.5" data-testid="list-breakdown-parts">
            {parts.map(({ r, c }, i) => (
              <li key={`${r.id}-${c.key}-${i}`}>
                <button
                  type="button"
                  onClick={() => focusRow(rowAnchor('main', r.id))}
                  className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs hover-elevate"
                  aria-label={`${metricName(t, c.key)} ${c.value ?? t('src.na')} ${unitText(t, c.unit)} · ${t('src.partOpen', { file: r.file, line: r.line })}`}
                  data-testid={`link-part-${r.id}-${c.key}`}
                >
                  <span className="break-words text-muted-foreground">{d.imports.length > 1 ? `${r.orderId} · ` : ''}{metricName(t, c.key)}</span>
                  <Val value={c.value} unit={c.unit} />
                  <span className="num text-[10px] text-muted-foreground">L{r.line}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Block>
  );
}

function Events({ rows }: { rows: SourceRow[] }) {
  const { t } = useTranslation();
  const withEvent = rows.filter((r) => r.event);
  if (withEvent.length === 0) return null;
  const isDown = (s: string) => /down/i.test(s);
  const isChange = (s: string) => /change/i.test(s);
  const groups = [
    { key: 'changeover', title: t('src.changeoverEvents'), rows: withEvent.filter((r) => isChange(r.event!.type)), note: false },
    { key: 'downtime', title: t('src.downtimeEvents'), rows: withEvent.filter((r) => isDown(r.event!.type)), note: true },
    { key: 'other', title: t('src.otherEvents'), rows: withEvent.filter((r) => !isChange(r.event!.type) && !isDown(r.event!.type)), note: false },
  ].filter((g) => g.rows.length > 0);
  return (
    <>
      {groups.map((g) => (
        <Block key={g.key} title={g.title} icon={Clock} testId={`section-source-events-${g.key}`}>
          {g.note && <p className="mb-2 border-s-2 border-[var(--series-stop)] ps-3 text-xs text-muted-foreground" data-testid="text-source-downtime-note">{t('src.downtimeNote')}</p>}
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[22rem] text-xs">
              <thead>
                <tr className="border-b bg-muted text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-start">{t('src.start')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('src.end')}</th>
                  <th scope="col" className="px-3 py-2 text-end">{t('src.minutes')}</th>
                  <th scope="col" className="px-1 py-2"><span className="sr-only">{t('src.rows')}</span></th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" data-testid={`row-event-${g.key}-${r.id}`}>
                    <td className="num px-3 py-1.5">{r.event!.start}</td>
                    <td className="num px-3 py-1.5">{r.event!.end}</td>
                    <td className="px-3 py-1.5 text-end"><Val value={r.event!.minutes} unit="min" /></td>
                    <td className="px-1 py-0.5 text-end">
                      <button type="button" onClick={() => focusRow(rowAnchor('main', r.id))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-[11px] text-primary hover-elevate" aria-label={t('src.partOpen', { file: r.file, line: r.line })} data-testid={`link-event-row-${r.id}`}>
                        <span className="num">L{r.line}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      ))}
    </>
  );
}

function Duplicates({ d }: { d: SourceDetail }) {
  const { t } = useTranslation();
  const pg = usePaged(d.duplicatePairs, PAIRS_PAGE);
  if (d.duplicatePairs.length === 0) return null;
  return (
    <Block title={t('src.duplicates')} icon={Copy} lead={t('src.duplicatesLead')} testId="section-source-duplicates">
      <ol className="space-y-4">
        {pg.shown.map((p, i) => {
          const n = pg.from + i;
          return (
            <li key={`${p.original.id}-${p.suspected.id}`} data-testid={`pair-duplicate-${n}`}>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{t('src.pairN', { n })}</p>
              <div className="grid gap-2 md:grid-cols-2">
                <RowCard row={p.original} scope={`dup${n}o`} label={t('src.original')} />
                <RowCard row={p.suspected} scope={`dup${n}s`} label={t('src.suspected')} />
              </div>
            </li>
          );
        })}
      </ol>
      <MiniPager {...pg} onPage={pg.setPage} testId="pager-source-duplicates" label={t('src.duplicates')} />
    </Block>
  );
}

function Alternatives({ d }: { d: SourceDetail }) {
  const { t } = useTranslation();
  const pg = usePaged(d.alternatives, LIST_PAGE);
  if (d.alternatives.length === 0) return null;
  return (
    <Block title={t('src.alternatives')} lead={t('src.alternativesLead')} testId="section-source-alternatives">
      <ul className="divide-y rounded-lg border border-dashed bg-muted">
        {pg.shown.map((a) => (
          <li key={`${a.metric}-${a.key}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm" data-testid={`row-source-alt-${a.metric}-${a.key}`}>
            <span className="min-w-0">
              <span className="font-medium"><MetricTerm metric={a.metric}>{metricName(t, a.metric)}</MetricTerm></span>{' '}
              <Raw className="text-[11px] text-muted-foreground">{a.key}</Raw>
            </span>
            <Val value={a.value} unit={a.unit} testId={`text-source-alt-${a.metric}-${a.key}`} />
          </li>
        ))}
      </ul>
      <MiniPager {...pg} onPage={pg.setPage} testId="pager-source-alternatives" label={t('src.alternatives')} />
    </Block>
  );
}

function Issues({ d, focusCode }: { d: SourceDetail; focusCode?: string }) {
  const { t } = useTranslation();
  const pg = usePaged(d.issues, LIST_PAGE);
  return (
    <Block title={t('src.issues')} icon={AlertTriangle} testId="section-source-issues">
      {d.issues.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="text-source-issues-empty">{t('src.issuesEmpty')}</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {pg.shown.map((i) => (
              <li key={i.id} className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-card px-3 py-2 text-sm', i.code === focusCode && 'border-primary')} data-testid={`row-source-issue-${i.id}`}>
                <QualityStatusBadge status={i.severity === 'error' ? 'red' : i.severity === 'warning' ? 'yellow' : 'green'} label={t(`imp.check.severity.${i.severity}`, { defaultValue: i.severity })} size="sm" />
                <Raw className="text-[11px] font-semibold text-muted-foreground">{i.code}</Raw>
                <span className="min-w-0 flex-1 basis-48">{issueText(t, i.code)}</span>
                <span className="text-xs text-muted-foreground">
                  <Raw className="text-xs">{i.sourceName}</Raw>
                  {i.orderId && <> · <Raw className="text-xs">{i.orderId}</Raw></>}
                </span>
              </li>
            ))}
          </ul>
          <MiniPager {...pg} onPage={pg.setPage} testId="pager-source-issues" label={t('src.issues')} />
        </>
      )}
    </Block>
  );
}

/* ---------------- body ---------------- */

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-4 px-4 py-5 sm:px-6" data-testid="state-source-loading">
      <span className="sr-only">{t('src.loading')}</span>
      <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" style={{ opacity: 1 - i * 0.2 }} />)}
    </div>
  );
}

function StateBox({ icon: Icon, tone, title, body, code, action, testId }: { icon: typeof SearchX; tone: 'amber' | 'red'; title: string; body: string; code?: string; action?: ReactNode; testId: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" data-testid={testId} role={tone === 'red' ? 'alert' : undefined}>
      <span className={cn('grid size-12 place-items-center rounded-xl border', tone === 'red' ? 'text-status-red' : 'text-status-amber')}><Icon className="size-6" aria-hidden="true" /></span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {code && <p className="num mt-2 font-mono text-[11px] text-muted-foreground">{code}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Body({ target, session }: { target: SourceTarget; session: Session }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [page, setPage] = useState(1);
  const valid =
    (target.kind === 'metric' || target.kind === 'issue') &&
    UUID_RE.test(target.id) &&
    (target.kind === 'issue' || !!target.metric) &&
    (!target.other || UUID_RE.test(target.other)) &&
    (!target.snapshot || UUID_RE.test(target.snapshot));
  const params: GetSourceDetailParams = { ...(target.snapshot ? { snapshot: target.snapshot } : {}), kind: target.kind, id: target.id, metric: target.metric, other: target.other, page };
  const q = useGetSourceDetail(params, { query: {
    queryKey: [...getGetSourceDetailQueryKey(params), session.activeFactoryId, session.user?.id],
    enabled: valid,
    retry: false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  } });

  if (!valid) return <StateBox icon={Link2Off} tone="amber" title={t('src.invalidTitle')} body={t('src.invalidBody')} testId="state-source-invalid" />;
  if (q.isLoading) return <Skeleton />;
  if (q.isError) {
    const st = errorStatus(q.error);
    const code = errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined;
    if (st === 404 || st === 403 || st === 400 || st === 422) {
      return <StateBox icon={SearchX} tone="amber" title={t('src.notFoundTitle')} body={t('src.notFoundBody')} code={code} testId="state-source-not-found" />;
    }
    return (
      <StateBox icon={AlertTriangle} tone="red" title={t('src.errorTitle')} body={localizeError(t, q.error)} code={code} testId="state-source-error"
        action={<Button onClick={() => q.refetch()} disabled={q.isFetching} className="min-h-11 gap-2" data-testid="button-retry-source"><RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}</Button>} />
    );
  }
  const d = q.data;
  if (!d) return null;

  const shown = d.display ?? d.value;
  const formula = pick(d.formula, lang);
  const pages = Math.max(1, Math.ceil(d.total / ROWS_PAGE));
  const from = d.total === 0 ? 0 : (d.page - 1) * ROWS_PAGE + 1;
  const to = (d.page - 1) * ROWS_PAGE + d.rows.length;
  const focusCode = target.kind === 'issue' ? d.issues.find((i) => i.id === target.id)?.code : undefined;

  return (
    <div className={cn('transition-opacity', q.isFetching && 'opacity-70')} aria-busy={q.isFetching}>
      {/* value */}
      <section className="px-4 pb-5 pt-1 sm:px-6" data-testid="section-source-value" aria-label={t('src.value')}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('src.value')}</p>
        {shown == null ? (
          <div className="mt-1">
            <p className="text-2xl font-semibold italic text-muted-foreground" data-na="true" data-testid="text-source-value">{t('src.na')}</p>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="text-source-na-why">{t('src.naWhy')}</p>
          </div>
        ) : (
          <p className="mt-1" data-testid="text-source-value">
            <span className="num text-3xl font-semibold tracking-tight">{shown}</span>
            {d.unit && <span className="ms-1.5 text-base text-muted-foreground">{unitText(t, d.unit)}</span>}
          </p>
        )}
        {focusCode && (
          <div className="mt-4 space-y-2 rounded-lg border bg-card p-3 text-sm">
            <p><span className="block text-[11px] font-semibold text-muted-foreground">{t('src.meaning')}</span>
              {i18n.exists(`q.meaning.${focusCode}`) ? t(`q.meaning.${focusCode}`) : issueText(t, focusCode)}</p>
            {i18n.exists(`q.why.${focusCode}`) && <p><span className="block text-[11px] font-semibold text-muted-foreground">{t('src.why')}</span>{t(`q.why.${focusCode}`)}</p>}
          </div>
        )}
        {formula && (
          <div className="mt-4 rounded-lg border-s-[3px] border-s-[var(--primary)] bg-secondary px-3 py-2.5" data-testid="text-source-formula">
            <p className="text-[11px] font-semibold text-muted-foreground">{t('src.formula')}</p>
            <p className="mt-0.5 text-sm font-medium leading-relaxed" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{formula}</p>
          </div>
        )}
      </section>

      {d.inputs.length > 0 && (
        <Block title={t('src.inputs')} testId="section-source-inputs">
          <dl className="grid gap-2 sm:grid-cols-2">
            {d.inputs.map((i) => (
              <div key={i.key} className="flex items-baseline justify-between gap-2 rounded-md border bg-card px-3 py-2" data-testid={`row-source-input-${i.key}`}>
                <dt className="text-xs text-muted-foreground"><MetricTerm metric={i.key}>{metricName(t, i.key)}</MetricTerm></dt>
                <dd><Val value={i.value} unit={i.unit} testId={`text-source-input-${i.key}`} /></dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      <Breakdown d={d} />

      {d.notes.length > 0 && (
        <Block title={t('src.notes')} testId="section-source-notes">
          <ul className="space-y-1.5">
            {d.notes.map((n, i) => (
              <li key={i} className="flex gap-2 text-sm" data-testid={`text-source-note-${i}`}>
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span dir={lang === 'ar' ? 'rtl' : 'ltr'}>{pick(n, lang)}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Events rows={d.rows} />
      <Duplicates d={d} />

      <Block title={t('src.rows')} icon={Rows3} lead={t('src.rowsLead')} testId="section-source-rows"
        aside={d.total > 0 ? <span className="num shrink-0 text-xs text-muted-foreground" data-testid="text-source-rows-total">{t('src.rowsRange', { from, to, total: d.total })}</span> : undefined}>
        {d.rows.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card p-4 text-center text-xs text-muted-foreground" data-testid="text-source-rows-empty">{t('src.rowsEmpty')}</p>
        ) : (
          <ol className="space-y-2" data-testid="list-source-rows">
            {d.rows.map((r) => <li key={r.id}><RowCard row={r} scope="main" /></li>)}
          </ol>
        )}
        {pages > 1 && (
          <nav className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-card px-1 py-1" aria-label={t('src.rowsPage', { page: d.page, pages })}>
            <Button variant="ghost" className="min-h-11 min-w-11" disabled={d.page <= 1 || q.isFetching} onClick={() => setPage(d.page - 1)} aria-label={t('src.prev')} data-testid="pager-source-rows-prev">
              <ChevronLeft className="size-4 rtl-flip" aria-hidden="true" />
            </Button>
            <span className="num text-xs text-muted-foreground" aria-live="polite" data-testid="pager-source-rows-label">{t('src.rowsPage', { page: d.page, pages })}</span>
            <Button variant="ghost" className="min-h-11 min-w-11" disabled={d.page >= pages || q.isFetching} onClick={() => setPage(d.page + 1)} aria-label={t('src.next')} data-testid="pager-source-rows-next">
              <ChevronRight className="size-4 rtl-flip" aria-hidden="true" />
            </Button>
          </nav>
        )}
      </Block>

      {d.imports.length > 0 && (
        <Block title={t('src.imports')} testId="section-source-imports">
          <ul className="space-y-1.5">
            {d.imports.map((im) => (
              <li key={im.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border bg-card px-3 py-2 text-xs" data-testid={`row-source-import-${im.id}`}>
                <Raw className="text-xs font-semibold [overflow-wrap:anywhere]">{im.sourceName}</Raw>
                {im.orderId && <><span className="text-muted-foreground">·</span><Raw className="text-xs">{im.orderId}</Raw></>}
                <span className="num ms-auto text-muted-foreground">{t('src.approved', { date: formatDate(im.approvedAt, lang) })}</span>
                <Raw className="w-full break-all text-[10px] text-muted-foreground">{im.id}</Raw>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Alternatives d={d} />
      <Issues d={d} focusCode={focusCode} />
    </div>
  );
}

/* ---------------- shell ---------------- */

export function SourceDrawer({ target, session, onClose, onRestoreFocus }: { target: SourceTarget | null; session: Session; onClose: () => void; onRestoreFocus: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const rtl = lang === 'ar';
  const open = !!target;
  const title = !target
    ? t('src.title')
    : target.kind === 'issue'
      ? t('src.issueTitle')
      : target.metric === 'date'
        ? t('src.dateTitle')
        : metricName(t, target.metric ?? '');
  const sub = target?.kind === 'metric' ? (target.other ? t('src.forDifference') : t('src.forRun')) : undefined;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--foreground)_38%,transparent)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          dir={rtl ? 'rtl' : 'ltr'}
          onCloseAutoFocus={(e) => { e.preventDefault(); onRestoreFocus(); }}
          className={cn(
            'fixed inset-y-0 z-50 flex h-[100dvh] w-full flex-col bg-background shadow-[var(--shadow-lg)] outline-none sm:max-w-xl lg:max-w-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-200',
            rtl
              ? 'left-0 sm:border-e data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left'
              : 'right-0 sm:border-s data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          )}
          data-testid="drawer-source"
          data-side={rtl ? 'left' : 'right'}
        >
          <header className="flex items-start gap-3 border-b bg-card px-4 py-3 sm:px-6">
            <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Sigma className="size-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('src.title')}</p>
              <div className="flex items-start gap-1"><DialogPrimitive.Title className="text-lg font-semibold leading-tight [overflow-wrap:anywhere]" data-testid="text-source-title">{title}</DialogPrimitive.Title>{target?.kind === 'metric' && target.metric && <MetricTerm metric={target.metric}>{null}</MetricTerm>}</div>
              <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                {sub ? `${sub} · ` : ''}{t('src.readOnly')}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t('src.close')} data-testid="button-close-source">
                <X className="size-5" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4">
            {target && <Body key={`${target.kind}:${target.id}:${target.metric ?? ''}:${target.other ?? ''}:${session.activeFactoryId}`} target={target} session={session} />}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
