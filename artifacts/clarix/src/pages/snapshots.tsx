import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { keepPreviousData } from '@tanstack/react-query';
import { AlertTriangle, Archive, History, Lock, RotateCcw, Search, SearchX, X } from 'lucide-react';
import { getListSnapshotsQueryKey, useListSnapshots, type Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/empty-page';
import { PAGE_ICONS } from '@/components/app-shell';
import { StateScreen } from '@/components/state-screen';
import { Raw } from '@/components/imports/shared';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { GlossaryTip, StatusTip } from '@/components/charts/glossary';
import { ForbiddenState } from '@/pages/tenant-page';
import { Pager, canWriteSnapshots, useFmtDate } from '@/components/snapshots/reconcile';
import { errorCode, errorStatus, localizeError } from '@/lib/session';
import '@/lib/runs-i18n';
import '@/lib/quality-i18n';
import '@/lib/charts-i18n';
import '@/lib/phase14-i18n';

export default function SnapshotsPage({ session }: { session: Session }) {
  const { t } = useTranslation();
  const fmt = useFmtDate();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params = { page, ...(search ? { search } : {}) };
  const q = useListSnapshots(params, { query: {
    queryKey: [...getListSnapshotsQueryKey(params), session.activeFactoryId, session.user?.id],
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  } });

  const submit = (e: FormEvent) => { e.preventDefault(); setSearch(draft.trim().slice(0, 200)); setPage(1); };
  const clear = () => { setDraft(''); setSearch(''); setPage(1); };

  if (q.isError && errorStatus(q.error) === 403) return <ForbiddenState session={session} />;

  let body;
  if (q.isLoading) {
    body = (
      <div role="status" aria-busy="true" className="space-y-2" data-testid="state-snapshots-loading">
        <span className="sr-only">{t('states.sessionLoading')}</span>
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" style={{ opacity: 1 - i * 0.18 }} />)}
      </div>
    );
  } else if (q.isError) {
    body = <div className="rounded-xl border bg-card"><StateScreen icon={AlertTriangle} tone="red" title={t('snp.loadError')} body={localizeError(t, q.error)}
      code={errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined} testId="state-snapshots-error"
      actions={<Button onClick={() => q.refetch()} disabled={q.isFetching} className="min-h-11 gap-2" data-testid="button-retry-snapshots"><RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}</Button>} /></div>;
  } else if (q.data && q.data.items.length === 0) {
    body = search
      ? <div className="rounded-xl border bg-card"><StateScreen icon={SearchX} title={t('snp.noMatchTitle')} body={t('snp.noMatchBody')} testId="state-snapshots-no-match"
          actions={<Button variant="outline" onClick={clear} className="min-h-11" data-testid="button-clear-search-empty">{t('snp.clear')}</Button>} /></div>
      : <div className="rounded-xl border bg-card"><StateScreen icon={Archive} title={t('snp.emptyTitle')} body={t('snp.emptyBody')} testId="state-snapshots-empty"
          actions={<Link href="/comparison" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover-elevate" data-testid="link-empty-comparison">{t('snp.toComparison')}</Link>} /></div>;
  } else if (q.data) {
    body = (
      <div>
        <ul className={`space-y-2 transition-opacity ${q.isFetching ? 'opacity-70' : ''}`} data-testid="list-snapshots">
          {q.data.items.map((s) => (
            <li key={s.id}>
              <Link href={`/snapshots/${s.id}`} className="group fade-up flex min-h-11 flex-col gap-2 rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)] hover-elevate sm:flex-row sm:items-center" data-testid={`link-snapshot-${s.id}`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-primary" aria-hidden="true"><Archive className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" data-testid={`text-snapshot-title-${s.id}`}>{s.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{t('snp.runs')}:</span>
                    {s.runs.map((r, i) => <Raw key={`${r}-${i}`} className="text-xs text-foreground" >{r}</Raw>)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground" data-testid={`text-snapshot-meta-${s.id}`}>{t('snp.saved')} {fmt(s.createdAt)} · {t('snp.by', { author: s.author })}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {s.changed
                    ? <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--status-amber)_45%,transparent)] px-2 py-0.5 text-xs font-medium text-status-amber" data-testid={`badge-snapshot-changed-${s.id}`}><History className="size-3.5" aria-hidden="true" />{t('snp.changed')}</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid={`badge-snapshot-unchanged-${s.id}`}><Lock className="size-3.5" aria-hidden="true" />{t('snp.unchanged')}</span>}
                  <QualityStatusBadge status={s.overall} size="sm" testId={`status-snapshot-${s.id}`} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Pager page={q.data.page || page} total={q.data.total} onPage={setPage} testId="pager-snapshots" />
      </div>
    );
  }

  return (
    <div data-testid="page-snapshots">
      <PageHeader icon={PAGE_ICONS.snapshots} title={t('nav.snapshots')} lead={t('snp.lead')} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form onSubmit={submit} role="search" className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor="snap-search" className="sr-only">{t('snp.search')}</label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="snap-search" type="search" maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('snp.search')} className="min-h-11 ps-9" data-testid="input-search-snapshots" />
          </div>
          <Button type="submit" className="min-h-11" data-testid="button-search-snapshots">{t('snp.searchBtn')}</Button>
          {search && <Button type="button" variant="ghost" onClick={clear} className="min-h-11 gap-1" data-testid="button-clear-search"><X className="size-4" aria-hidden="true" />{t('snp.clear')}</Button>}
        </form>
        <span className="inline-flex items-center text-xs text-muted-foreground">
          {q.data && <span data-testid="text-snapshots-total">{t('snp.total', { count: q.data.total })}</span>}
          <GlossaryTip term="snapshot" testId="button-glossary-snapshot-list" /><GlossaryTip term="frozen" testId="button-glossary-frozen-list" />
          <StatusTip status="red" testId="button-glossary-status-list" />
        </span>
      </div>
      {!canWriteSnapshots(session) && <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-snapshots-readonly"><Lock className="size-3.5" aria-hidden="true" />{t('snp.readOnly')}</p>}
      {body}
    </div>
  );
}
