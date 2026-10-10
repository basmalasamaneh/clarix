import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Database, Loader2, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/import-model';
import { useArchiveSource, useDataSources } from '@/lib/sources-api';
import { cn } from '@/lib/utils';
import { ErrorNote, Pager, Raw, Section } from '@/components/imports/shared';

export function SourceAdmin() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<string | null>(null);
  const q = useDataSources(page, search.trim());
  const m = useArchiveSource();
  const items = q.data?.items ?? [];

  const run = (sourceName: string, archived: boolean) =>
    m.mutate(
      { sourceName, archived },
      {
        onSuccess: () => {
          setConfirm(null);
          toast({ title: t(archived ? 'src.admin.archivedToast' : 'src.admin.restoredToast', { name: sourceName }) });
        },
      },
    );

  return (
    <div className="mt-8">
      <Section title={t('src.admin.title')} body={t('src.admin.body')} testId="section-source-admin">
        <div className="relative mb-3 max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('src.pick.search')} aria-label={t('src.pick.search')} className="h-11 ps-9" data-testid="input-admin-source-search" />
        </div>
        {m.error != null && !confirm && <div className="mb-3"><ErrorNote error={m.error} /></div>}
        {q.isLoading ? (
          <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded bg-muted" />)}</div>
        ) : q.isError ? (
          <ErrorNote error={q.error} action={<Button variant="outline" className="min-h-11 gap-2" onClick={() => q.refetch()} data-testid="button-retry-admin-sources"><RotateCcw className="size-4" aria-hidden="true" />{t('imp.errors.retry')}</Button>} />
        ) : items.length === 0 ? (
          <div className="ledger-grid flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center" data-testid="state-admin-sources-empty">
            <Database className="size-6 text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{search.trim() ? t('src.pick.noMatch') : t('src.admin.empty')}</p>
          </div>
        ) : (
          <div className={cn('min-w-0 overflow-x-auto rounded-lg border', q.isFetching && 'opacity-70')}>
            <table className="w-full min-w-[560px] text-sm" data-testid="table-admin-sources">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('src.admin.colName')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('src.admin.colOrders')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('src.admin.colLast')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('src.admin.colState')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((s) => (
                  <tr key={s.name} data-testid={`row-admin-source-${s.name}`} className={cn(s.archived && 'text-muted-foreground')}>
                    <td className="max-w-[16rem] px-3 py-2"><Raw className="break-words font-sans font-medium">{s.name}</Raw></td>
                    <td className="num px-3 py-2">{s.orderCount}</td>
                    <td className="num whitespace-nowrap px-3 py-2">{s.lastApprovedAt ? formatDate(s.lastApprovedAt, i18n.language) : t('src.pick.never')}</td>
                    <td className="px-3 py-2" data-testid={`status-admin-source-${s.name}`}>{s.archived ? t('src.pick.archived') : t('src.admin.active')}</td>
                    <td className="px-3 py-2 text-end">
                      {s.archived ? (
                        <Button variant="outline" className="min-h-11 gap-2" disabled={m.isPending} onClick={() => run(s.name, false)} data-testid={`button-restore-source-${s.name}`}>
                          <ArchiveRestore className="size-4" aria-hidden="true" />
                          {t('src.admin.restore')}
                        </Button>
                      ) : (
                        <Button variant="outline" className="min-h-11 gap-2" disabled={m.isPending} onClick={() => { m.reset(); setConfirm(s.name); }} data-testid={`button-archive-source-${s.name}`}>
                          <Archive className="size-4" aria-hidden="true" />
                          {t('src.admin.archive')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} total={q.data?.total ?? 0} onPage={setPage} testId="pager-admin-sources" />
      </Section>

      <Dialog open={!!confirm} onOpenChange={(o) => !m.isPending && !o && setConfirm(null)}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{t('src.admin.confirmTitle', { name: confirm ?? '' })}</DialogTitle>
            <DialogDescription>{t('src.admin.confirmBody')}</DialogDescription>
          </DialogHeader>
          {m.error != null && <ErrorNote error={m.error} />}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" disabled={m.isPending} onClick={() => setConfirm(null)} data-testid="button-cancel-archive">{t('src.admin.cancel')}</Button>
            <Button className="min-h-11 gap-2" disabled={m.isPending} onClick={() => confirm && run(confirm, true)} data-testid="button-confirm-archive">
              {m.isPending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t('src.admin.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
