import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { keepPreviousData } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, History, Lock, RotateCcw, SearchX, Snowflake } from 'lucide-react';
import {
  getGetSnapshotQueryKey,
  getListReconciliationsQueryKey,
  useGetSnapshot,
  useListReconciliations,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { StateScreen } from '@/components/state-screen';
import { Raw } from '@/components/imports/shared';
import { GlossaryTip } from '@/components/charts/glossary';
import { UUID_RE } from '@/components/runs/shared';
import { ForbiddenState } from '@/pages/tenant-page';
import { Result } from '@/pages/comparison';
import { AddReconciliationPanel, ChangesPanel, Pager, ReconciliationTable, canWriteSnapshots, useFmtDate } from '@/components/snapshots/reconcile';
import { errorCode, errorStatus, localizeError } from '@/lib/session';
import { ReportExport } from '@/components/snapshots/report-export';
import '@/lib/phase14-i18n';

const backCls = 'inline-flex min-h-11 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium hover-elevate';

function History_({ id, session }: { id: string; session: Session }) {
  const { t } = useTranslation();
  const fmt = useFmtDate();
  const [page, setPage] = useState(1);
  const params = { snapshotId: id, page };
  const q = useListReconciliations(params, { query: {
    queryKey: [...getListReconciliationsQueryKey(params), session.activeFactoryId, session.user?.id],
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  } });
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="rec-history" data-testid="section-reconciliation-history">
      <h2 id="rec-history" className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-primary" aria-hidden="true" />{t('snp.rec.historyTitle')}</h2>
      <p className="text-[11px] text-muted-foreground">{t('snp.rec.historyLead')}</p>
      <div className="mt-3">
        {q.isLoading ? (
          <div role="status" aria-busy="true" className="space-y-2" data-testid="state-reconciliations-loading">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : q.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" data-testid="state-reconciliations-error">
            <AlertTriangle className="size-4 text-status-red" aria-hidden="true" /><span className="flex-1">{t('snp.rec.historyError')} {localizeError(t, q.error)}</span>
            <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching} className="min-h-11 gap-2" data-testid="button-retry-reconciliations"><RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}</Button>
          </div>
        ) : !q.data || q.data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="state-reconciliations-empty">{t('snp.rec.historyEmpty')}</p>
        ) : (
          <>
            <ol className="space-y-3" data-testid="list-reconciliations">
              {q.data.items.map((r) => (
                <li key={r.id} className="overflow-hidden rounded-lg border" data-testid={`card-reconciliation-${r.id}`}>
                  <p className="flex items-center gap-2 border-b bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid={`text-reconciliation-meta-${r.id}`}>
                    <Lock className="size-3.5" aria-hidden="true" />{t('snp.rec.recordBy', { author: r.author, date: fmt(r.createdAt) })}
                  </p>
                  <div className="p-3"><ReconciliationTable result={r.result} testId={`table-reconciliation-${r.id}`} /></div>
                </li>
              ))}
            </ol>
            <Pager page={q.data.page || page} total={q.data.total} onPage={setPage} testId="pager-reconciliations" />
          </>
        )}
      </div>
    </section>
  );
}

export default function SnapshotDetailPage({ id, session }: { id: string; session: Session }) {
  const { t, i18n } = useTranslation();
  const fmt = useFmtDate();
  const ar = i18n.language.startsWith('ar');
  const valid = UUID_RE.test(id);
  const q = useGetSnapshot(id, { query: {
    queryKey: [...getGetSnapshotQueryKey(id), session.activeFactoryId, session.user?.id],
    enabled: valid,
    staleTime: 60_000,
    retry: false,
  } });
  const back = <Link href="/snapshots" className={backCls} data-testid="link-back-snapshots"><ArrowLeft className="size-4 rtl-flip" aria-hidden="true" />{t('snp.back')}</Link>;

  if (q.isError && errorStatus(q.error) === 403) return <ForbiddenState session={session} />;

  let body;
  if (!valid || (q.isError && [400, 404, 422].includes(errorStatus(q.error) ?? 0))) {
    body = <div className="rounded-xl border bg-card"><StateScreen icon={SearchX} tone="amber" title={t('snp.notFoundTitle')} body={t('snp.notFoundBody')}
      code={q.isError && errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined} testId="state-snapshot-not-found" actions={back} /></div>;
  } else if (q.isLoading) {
    body = (
      <div role="status" aria-busy="true" className="space-y-4" data-testid="state-snapshot-loading">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />)}</div>
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  } else if (q.isError) {
    body = <div className="rounded-xl border bg-card"><StateScreen icon={AlertTriangle} tone="red" title={t('snp.detailError')} body={localizeError(t, q.error)}
      code={errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined} testId="state-snapshot-error"
      actions={<><Button onClick={() => q.refetch()} disabled={q.isFetching} className="min-h-11 gap-2" data-testid="button-retry-snapshot"><RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}</Button>{back}</>} /></div>;
  } else if (q.data) {
    const { snapshot: s, comparison, definitionsVersion, changes } = q.data;
    body = (
      <div className="space-y-5">
        <header className="fade-up overflow-hidden rounded-xl border-2 border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-card shadow-[var(--shadow-md)]" data-testid="banner-snapshot-frozen">
          <div className="ledger-grid border-b bg-accent px-4 py-3 sm:px-5">
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary">
              <Snowflake className="size-4" aria-hidden="true" />
              <span data-testid="text-snapshot-frozen-label">{t('snp.frozenBanner', { date: fmt(s.createdAt) })}</span>
              <GlossaryTip term="frozen" testId="button-glossary-frozen" />
            </p>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <h1 className="text-2xl font-semibold tracking-tight" dir="auto" data-testid="text-snapshot-title">{s.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="text-snapshot-author">{t('snp.savedBy', { author: s.author })} · <span>{fmt(s.createdAt)}</span></p>
            {s.note && <p className="mt-3 border-s-2 border-primary ps-3 text-sm leading-relaxed" dir="auto" data-testid="text-snapshot-note"><span className="sr-only">{t('snp.note')}: </span>{s.note}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{t('snp.defs')}: <Raw className="text-xs text-foreground" >{definitionsVersion}</Raw></span>
              {s.changed && <span className="inline-flex items-center gap-1 font-medium text-status-amber" data-testid="badge-snapshot-changed"><History className="size-3.5" aria-hidden="true" />{t('snp.changed')}</span>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground" lang={ar ? 'ar' : 'en'}>{t('snp.frozenBody')}</p>
          </div>
        </header>
        <ReportExport key={`${s.id}-${session.activeFactoryId}-${session.user?.id}`} snapshotId={s.id} />
        <ChangesPanel changes={changes} />
        <Result data={comparison} />
        <History_ key={s.id} id={s.id} session={session} />
        {canWriteSnapshots(session)
          ? <AddReconciliationPanel key={s.id} snapshotId={s.id} />
          : <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-snapshot-readonly"><Lock className="size-3.5" aria-hidden="true" />{t('snp.readOnly')}</p>}
      </div>
    );
  }

  return (
    <div data-testid="page-snapshot-detail">
      <div className="mb-4">{back}</div>
      {body}
    </div>
  );
}
