import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeftRight, ArrowRight, Calendar, CheckCircle2, FileUp, GitCompare, Info, RotateCcw, ShieldCheck, UserRoundCog } from 'lucide-react';
import { getGetOverviewQueryKey, useGetOverview, type Overview, type ProductionRun, type Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/empty-page';
import { PAGE_ICONS } from '@/components/app-shell';
import { StateScreen } from '@/components/state-screen';
import { Raw, StatusBadge } from '@/components/imports/shared';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { SourceChip } from '@/components/runs/shared';
import { ForbiddenState } from '@/pages/tenant-page';
import { errorCode, errorStatus, localizeError } from '@/lib/session';
import { formatDate } from '@/lib/import-model';
import { cn } from '@/lib/utils';
import '@/lib/quality-i18n';
import '@/lib/runs-i18n';
import '@/lib/overview-i18n';

const PRIMARY = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-sm)] hover-elevate active-elevate-2';
const SECONDARY = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover-elevate';
const TEXT_LINK = 'inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline';

function Num({ value, testId, className }: { value: number | null | undefined; testId: string; className?: string }) {
  const { t } = useTranslation();
  if (value === null || value === undefined) {
    return <span className="text-sm font-medium italic text-muted-foreground" title={t('ov.naHint')} data-testid={testId}>{t('ov.na')}</span>;
  }
  return <span className={cn('num font-semibold leading-none tracking-tight', className ?? 'text-3xl')} data-testid={testId}>{value}</span>;
}

function Card({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={cn('rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5', className)}>{children}</section>;
}

function Summary({ d, canQuality }: { d: Overview; canQuality: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="fade-up grid gap-4 md:grid-cols-2" role="group" aria-label={t('ov.cards.label')} data-testid="section-overview-summary">
      <Card label={t('ov.cards.approved')}>
        <h2 className="text-xs font-semibold text-muted-foreground">{t('ov.cards.approved')}</h2>
        <div className="mt-3"><Num value={d.approvedImports} testId="text-overview-approved" /></div>
        <p className="mt-2 text-xs text-muted-foreground">{t('ov.cards.approvedHint')}</p>
      </Card>
      <Card label={t('ov.cards.orders')}>
        <h2 className="text-xs font-semibold text-muted-foreground">{t('ov.cards.orders')}</h2>
        <div className="mt-3"><Num value={d.currentOrders} testId="text-overview-orders" /></div>
        <p className="mt-2 text-xs text-muted-foreground">{t('ov.cards.ordersHint')}</p>
      </Card>
      <Card label={t('ov.cards.statusTitle')}>
        <h2 className="text-xs font-semibold text-muted-foreground">{t('ov.cards.statusTitle')}</h2>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {(['green', 'yellow', 'red'] as const).map((s) => (
            <li key={s} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background px-1.5 py-2.5 sm:px-2.5">
              <QualityStatusBadge status={s} size="sm" className="self-start" />
              <Num value={d.statuses[s]} className="text-2xl" testId={`text-overview-status-${s}`} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t('ov.cards.statusHint')}</p>
      </Card>
      <Card label={t('ov.cards.issuesTitle')}>
        <h2 className="text-xs font-semibold text-muted-foreground">{t('ov.cards.issuesTitle')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2 rounded-lg border bg-background px-2.5 py-2.5">
            <QualityStatusBadge status="red" label={t('ov.cards.errors')} size="sm" />
            <Num value={d.errors} className="text-2xl" testId="text-overview-errors" />
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-background px-2.5 py-2.5">
            <QualityStatusBadge status="yellow" label={t('ov.cards.warnings')} size="sm" />
            <Num value={d.warnings} className="text-2xl" testId="text-overview-warnings" />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground" data-testid="text-overview-issues-scope">{t('ov.cards.issuesScope')}</p>
        {canQuality && (
          <Link href="/quality" className={TEXT_LINK} data-testid="link-overview-quality">
            {t('ov.cards.openQuality')}<ArrowRight className="rtl-flip size-4" aria-hidden="true" />
          </Link>
        )}
      </Card>
    </div>
  );
}

function Latest({ d, canImports, lang }: { d: Overview; canImports: boolean; lang: string }) {
  const { t } = useTranslation();
  const items = d.latestImports.slice(0, 5);
  return (
    <Card label={t('ov.latest.title')} className="fade-up p-0 sm:p-0">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('ov.latest.title')}</h2>
          <p className="text-xs text-muted-foreground">{canImports ? t('ov.latest.lead') : t('ov.latest.leadNoAccess')}</p>
        </div>
        {canImports && (
          <Link href="/imports" className={TEXT_LINK} data-testid="link-overview-all-imports">
            {t('ov.latest.all')}<ArrowRight className="rtl-flip size-4" aria-hidden="true" />
          </Link>
        )}
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5" data-testid="text-overview-latest-empty">{t('ov.latest.empty')}</p>
      ) : (
        <ul data-testid="list-overview-imports">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-0 sm:px-5" data-testid={`row-overview-import-${it.id}`}>
              <span className="min-w-0 flex-1">
                <Raw className="block whitespace-normal text-sm font-medium [overflow-wrap:anywhere]">{it.sourceName}</Raw>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3" aria-hidden="true" />
                  <span className="sr-only">{t('ov.latest.date')}: </span>
                  {it.date ? <span className="num" data-testid={`text-overview-import-date-${it.id}`}>{formatDate(it.date, lang)}</span> : <span className="italic">{t('ov.latest.noDate')}</span>}
                </span>
              </span>
              <StatusBadge status={it.status} testId={`status-overview-import-${it.id}`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RunSlot({ run, side }: { run: ProductionRun; side: string }) {
  const { t } = useTranslation();
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-lg border bg-background p-3" data-testid={`card-overview-run-${run.id}`}>
      <span className="grid size-7 shrink-0 place-items-center rounded bg-primary text-xs font-bold text-primary-foreground">{side}</span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex items-start justify-between gap-2">
          <Raw className="min-w-0 whitespace-normal text-sm font-semibold [overflow-wrap:anywhere]">{run.orderId}</Raw>
          <QualityStatusBadge status={run.overall} size="sm" testId={`status-overview-run-${run.id}`} />
        </span>
        <SourceChip run={run} testId={`text-overview-run-source-${run.id}`} />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="size-3" aria-hidden="true" />
          {run.date ? <span className="num">{run.date}</span> : <span className="italic">{t('ov.compare.noDate')}</span>}
        </span>
      </span>
    </li>
  );
}

function CompareShortcut({ d, primary, canImports, canComparison, canRuns }: { d: Overview; primary: boolean; canImports: boolean; canComparison: boolean; canRuns: boolean }) {
  const { t } = useTranslation();
  const pair = d.comparisonRuns.length === 2 ? d.comparisonRuns : null;
  const href = pair ? `/comparison?${new URLSearchParams({ a: pair[0].id, b: pair[1].id }).toString()}` : '';
  return (
    <Card label={t('ov.compare.title')} className="fade-up">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary"><GitCompare className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('ov.compare.title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('ov.compare.lead')}</p>
        </div>
      </div>
      {pair ? (
        <>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            <RunSlot run={pair[0]} side={t('rc.cmp.sideA')} />
            <RunSlot run={pair[1]} side={t('rc.cmp.sideB')} />
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canComparison && (
              <Link href={href} className={primary ? PRIMARY : SECONDARY} data-testid="link-overview-compare">
                <ArrowLeftRight className="size-4" aria-hidden="true" />{t('ov.compare.button')}
              </Link>
            )}
            {canRuns && <Link href="/runs" className={TEXT_LINK} data-testid="link-overview-runs">{t('ov.compare.runs')}</Link>}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />{t('ov.compare.blockedNote')}</p>
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed bg-background p-4" data-testid="state-overview-few-runs">
          <p className="text-sm font-semibold">{t('ov.compare.fewTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{canImports ? t('ov.compare.fewBody') : t('ov.compare.fewBodyNoImport')}</p>
          {canRuns && (
            <Link href="/runs" className={cn(primary ? PRIMARY : SECONDARY, 'mt-3')} data-testid="link-overview-runs">
              {t('ov.compare.runs')}<ArrowRight className="rtl-flip size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

function Guide({ canImports, canRuns, canQuality }: { canImports: boolean; canRuns: boolean; canQuality: boolean }) {
  const { t } = useTranslation();
  const steps = [
    { icon: FileUp, title: t('ov.guide.s1'), body: t('ov.guide.s1Body') },
    { icon: CheckCircle2, title: t('ov.guide.s2'), body: t('ov.guide.s2Body') },
    { icon: GitCompare, title: t('ov.guide.s3'), body: t('ov.guide.s3Body') },
  ];
  return (
    <Card label={t('ov.guide.title')} className="fade-up border-primary/30 bg-[color-mix(in_srgb,var(--primary)_4%,var(--card))]">
      <h2 className="text-base font-semibold">{t('ov.guide.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('ov.guide.lead')}</p>
      <ol className="mt-5 grid gap-3 md:grid-cols-3" data-testid="list-overview-guide">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 rounded-lg border bg-card p-3.5">
            <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold"><s.icon className="size-4 text-primary" aria-hidden="true" />{s.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      {canImports ? (
        <Link href="/imports" className={cn(PRIMARY, 'mt-5')} data-testid="link-overview-guide-imports">
          <FileUp className="size-4" aria-hidden="true" />{t('ov.guide.cta')}
        </Link>
      ) : (
        <div className="mt-5 rounded-lg border bg-card p-4" role="note" data-testid="state-overview-ask-manager">
          <p className="flex items-center gap-2 text-sm font-semibold"><UserRoundCog className="size-4 text-primary" aria-hidden="true" />{t('ov.guide.askTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('ov.guide.askBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canRuns && <Link href="/runs" className={SECONDARY} data-testid="link-overview-guide-runs">{t('ov.links.runs')}</Link>}
            {canQuality && <Link href="/quality" className={SECONDARY} data-testid="link-overview-guide-quality"><ShieldCheck className="size-4" aria-hidden="true" />{t('ov.links.quality')}</Link>}
          </div>
        </div>
      )}
    </Card>
  );
}

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-4" data-testid="state-overview-loading">
      <span className="sr-only">{t('ov.loading')}</span>
           <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" style={{ opacity: 0.7 }} />
      </div>
    </div>
  );
}

export default function OverviewPage({ session }: { session: Session }) {
  const { t, i18n: inst } = useTranslation();
  const factory = session.memberships.find((m) => m.factoryId === session.activeFactoryId);
  const can = (p: string) => session.allowedPages.includes(p);
  const canImports = can('imports');
  const canRuns = can('runs');
  const canQuality = can('quality');
  const canComparison = can('comparison');
  const q = useGetOverview({ query: {
    queryKey: [...getGetOverviewQueryKey(), session.activeFactoryId, session.user?.id],
    staleTime: 30_000,
    refetchOnMount: 'always',
  } });

  let body: ReactNode;
  if (q.isLoading) body = <Skeleton />;
  else if (q.isError) {
    if (errorStatus(q.error) === 403) return <ForbiddenState session={session} />;
    body = (
      <div className="rounded-xl border bg-card">
        <StateScreen icon={AlertTriangle} tone="red" title={t('ov.errorTitle')} body={localizeError(t, q.error)}
          code={errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined} testId="state-overview-error"
          actions={<Button onClick={() => q.refetch()} disabled={q.isFetching} className="min-h-11 gap-2" data-testid="button-retry-overview"><RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}</Button>} />
      </div>
    );
  } else if (q.data) {
    const d = q.data;
    const noApproved = d.approvedImports === 0;
    body = (
      <div className="space-y-4">
        {noApproved && <Guide canImports={canImports} canRuns={canRuns} canQuality={canQuality} />}
        <Summary d={d} canQuality={canQuality} />
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          {!noApproved ? (
            <CompareShortcut d={d} primary canImports={canImports} canComparison={canComparison} canRuns={canRuns} />
          ) : null}
          <div className={cn(noApproved && 'lg:col-span-2')}>
            <Latest d={d} canImports={canImports} lang={inst.language} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="page-overview">
      <PageHeader icon={PAGE_ICONS.overview} title={t('ov.title')} lead={t('ov.lead')} meta={factory ? `${factory.factoryName} · ${t('ov.meta')}` : t('ov.meta')} />
      {body}
    </div>
  );
}
