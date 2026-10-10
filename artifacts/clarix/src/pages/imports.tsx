import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowLeft, CloudOff, Copy, FileStack, Plus, RotateCcw } from 'lucide-react';
import { getGetImportQueryKey, getListImportsQueryKey, useGetImport, useListImports, type ImportDetail, type Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/empty-page';
import { PAGE_ICONS } from '@/components/app-shell';
import { errorStatus } from '@/lib/session';
import { formatDate } from '@/lib/import-model';
import { ErrorNote, Pager, Raw, StatusBadge, Stepper, type StepKey } from '@/components/imports/shared';
import { NewImport, UploadReview } from '@/components/imports/upload-step';
import { MapStep } from '@/components/imports/map-step';
import { CheckStep } from '@/components/imports/check-step';

const linkBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium';

function History() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const params = { page };
  const q = useListImports(params, { query: { queryKey: getListImportsQueryKey(params) }, request: { credentials: 'include' } });

  return (
    <section className="fade-up" data-testid="section-history">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{t('imp.history.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('imp.history.caption')}</p>
      </div>
      {q.isLoading ? (
        <div className="space-y-2 rounded-xl border bg-card p-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-md bg-muted" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorNote
          error={q.error}
          action={
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => q.refetch()} data-testid="button-retry-history">
              <RotateCcw className="size-4" aria-hidden="true" />
              {t('imp.errors.retry')}
            </Button>
          }
        />
      ) : !q.data || q.data.items.length === 0 ? (
        <div className="ledger-grid flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center" data-testid="state-history-empty">
          <div className="flex size-12 items-center justify-center rounded-full border bg-card text-primary shadow-sm">
            <FileStack className="size-5" aria-hidden="true" />
          </div>
          <p className="font-semibold">{t('imp.history.emptyTitle')}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t('imp.history.emptyBody')}</p>
          <Link href="/imports?id=new" className={`${linkBtn} mt-2 border border-primary-border bg-primary text-primary-foreground`} data-testid="link-new-import-empty">
            <Plus className="size-4" aria-hidden="true" />
            {t('imp.newImport')}
          </Link>
        </div>
      ) : (
        <>
          <div className="min-w-0 overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[620px] text-sm" data-testid="table-history">
              <thead className="border-b bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t('imp.history.source')}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t('imp.history.files')}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t('imp.history.created')}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t('imp.history.status')}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {q.data.items.map((it) => (
                  <tr key={it.id} className="hover-elevate" data-testid={`row-import-${it.id}`}>
                    <td className="max-w-[16rem] px-4 py-2">
                      <Raw className="block truncate font-sans text-sm font-medium">{it.sourceName}</Raw>
                      {it.duplicateOf && (
                        <Link href={`/imports?id=${it.duplicateOf}`} className="mt-0.5 inline-flex min-h-11 items-center gap-1 text-xs text-status-amber underline-offset-2 hover:underline" data-testid={`link-duplicate-${it.id}`}>
                          <Copy className="size-3" aria-hidden="true" />
                          {t('imp.duplicate.title')}
                        </Link>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{t('imp.history.filesCount', { count: it.files.length })}</td>
                    <td className="num whitespace-nowrap px-4 py-2 text-muted-foreground">{formatDate(it.createdAt, i18n.language)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={it.status} testId={`status-import-${it.id}`} />
                    </td>
                    <td className="px-4 py-2 text-end">
                      <Link href={`/imports?id=${it.id}`} className={`${linkBtn} border hover-elevate`} data-testid={`link-open-import-${it.id}`}>
                        {t('imp.history.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={q.data.total} onPage={setPage} testId="pager-history" />
        </>
      )}
    </section>
  );
}

function defaultStep(d: ImportDetail): StepKey {
  if (!d.finalized) return 'upload';
  if (d.status === 'draft') return 'map';
  return 'check';
}

function Wizard({ id, step, canEdit, go }: { id: string; step: StepKey | null; canEdit: boolean; go: (id: string, s?: StepKey) => void }) {
  const { t } = useTranslation();
  const q = useGetImport(id, { query: { queryKey: getGetImportQueryKey(id), retry: 1 }, request: { credentials: 'include' } });

  if (q.isLoading)
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded bg-muted" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-12 text-center" data-testid="state-import-error">
        <CloudOff className="size-6 text-status-red" aria-hidden="true" />
        <p className="font-semibold">{t('imp.errors.loadTitle')}</p>
        {errorStatus(q.error) === 404 ? <p className="text-sm text-muted-foreground">{t('imp.errors.notFound')}</p> : <ErrorNote error={q.error} />}
        <Button className="min-h-11 gap-2" onClick={() => q.refetch()} data-testid="button-retry-import">
          <RotateCcw className="size-4" aria-hidden="true" />
          {t('imp.errors.retry')}
        </Button>
      </div>
    );

  const d = q.data;
  const current = step ?? defaultStep(d);
  const readOnly = d.status === 'approved' || d.status === 'rejected' || !canEdit;
  const effective: StepKey = !d.finalized ? 'upload' : current;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Raw className="truncate font-sans text-lg font-semibold">{d.sourceName}</Raw>
          <StatusBadge status={d.status} testId="status-current-import" />
        </div>
      </div>
      <Stepper
        current={effective}
        enabled={{ upload: true, map: d.finalized, check: d.finalized }}
        done={{ upload: d.finalized, map: d.status !== 'draft', check: d.status === 'approved' || d.status === 'rejected' }}
        onStep={(s) => go(d.id, s)}
      />
      {d.duplicateOf && (
        <div className="fade-up flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--status-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-amber)_7%,var(--card))] p-4 sm:flex-row sm:items-center" role="status" data-testid="banner-duplicate">
          <Copy className="size-5 shrink-0 text-status-amber" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('imp.duplicate.title')}</p>
            <p className="text-sm text-muted-foreground">{t('imp.duplicate.body')}</p>
          </div>
          <Link href={`/imports?id=${d.duplicateOf}`} className={`${linkBtn} border bg-card hover-elevate`} data-testid="link-duplicate-existing">
            {t('imp.duplicate.open')}
          </Link>
        </div>
      )}
      {effective === 'upload' && <UploadReview detail={d} canEdit={canEdit} onContinue={() => go(d.id, 'map')} />}
      {d.finalized && <div hidden={effective !== 'map'}><MapStep key={d.id} detail={d} readOnly={readOnly} onChecked={() => go(d.id, 'check')} /></div>}
      {effective === 'check' && <CheckStep detail={d} canEdit={canEdit} onEditMapping={() => go(d.id, 'map')} />}
    </div>
  );
}

export default function ImportsPage({ session }: { session: Session }) {
  const { t } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const id = params.get('id');
  const stepParam = params.get('step');
  const step: StepKey | null = stepParam === 'upload' || stepParam === 'map' || stepParam === 'check' ? stepParam : null;
  const factory = session.memberships.find((m) => m.factoryId === session.activeFactoryId);
  const canEdit = session.user?.platformAdmin || factory?.role === 'analyst' || factory?.role === 'factory_manager';

  const go = (nid: string, s?: StepKey) => setLocation(`/imports?id=${encodeURIComponent(nid)}${s ? `&step=${s}` : ''}`);

  return (
    <div data-testid="page-imports" className="space-y-8">
      <PageHeader
        icon={PAGE_ICONS.imports}
        title={t('imp.title')}
        lead={t('imp.lead')}
        meta={factory ? `${factory.factoryName} · ${t('factory.isolated')}` : undefined}
      />
      {id ? (
        <div className="space-y-6">
          <Link href="/imports" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground" data-testid="link-back-history">
            <ArrowLeft className="size-4 rtl-flip" aria-hidden="true" />
            {t('imp.backToHistory')}
          </Link>
          {id === 'new' ? (
            canEdit ? <NewImport onCreated={(d) => go(d.id, 'upload')} /> : null
          ) : (
            <Wizard key={id} id={id} step={step} canEdit={!!canEdit} go={go} />
          )}
        </div>
      ) : (
        <>
          {canEdit && (
            <div className="flex justify-end">
              <Link href="/imports?id=new" className={`${linkBtn} border border-primary-border bg-primary text-primary-foreground`} data-testid="link-new-import">
                <Plus className="size-4" aria-hidden="true" />
                {t('imp.newImport')}
              </Link>
            </div>
          )}
          <History />
        </>
      )}
    </div>
  );
}
