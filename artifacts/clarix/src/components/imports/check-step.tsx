import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AlertTriangle, Ban, CheckCircle2, CircleAlert, Info, Loader2, PlayCircle, ShieldCheck, XCircle } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { errCodeOf, errData, issueText } from '@/lib/import-model';
import { ErrorNote, Pager, Raw, Section } from './shared';

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

function Issues({ id }: { id: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const q = useListImportIssues(id, page, { query: { queryKey: getListImportIssuesQueryKey(id, page) }, request: { credentials: 'include' } });

  if (q.isLoading)
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
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
  const items = q.data?.items ?? [];
  if (items.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center" data-testid="text-issues-empty">
        <CheckCircle2 className="size-6 text-status-green" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('imp.check.issuesEmpty')}</p>
      </div>
    );
  return (
    <>
      <div className="min-w-0 overflow-x-auto rounded-lg border" data-testid="table-issues">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t('imp.check.colSeverity')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('imp.check.colIssue')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('imp.check.colOrder')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('imp.check.colGroup')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('imp.check.colRefs')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((it, i) => {
              const s = SEV_STYLE[it.severity] ?? SEV_STYLE.info;
              const Icon = s.icon;
              return (
                <tr key={`${it.code}-${i}`} data-testid={`row-issue-${i}`} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className={cn('inline-flex items-center gap-1.5 font-medium', s.cls)}>
                      <Icon className="size-4" aria-hidden="true" />
                      {t(`imp.check.severity.${it.severity}`, { defaultValue: it.severity })}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p>{issueText(t, it.code)}</p>
                    <p className="num mt-0.5 font-mono text-[11px] text-muted-foreground">{it.code}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{it.order ? <Raw>{it.order}</Raw> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{it.group.split(',').map(g=>t(`imp.check.groups.${g}`)).join(' / ')}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {it.refs.map((r) => (
                        <span key={r} className="rounded border bg-muted px-1.5 py-0.5">
                          <Raw className="text-xs">{r}</Raw>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={q.data?.total ?? 0} onPage={setPage} testId="pager-issues" />
    </>
  );
}

export function CheckStep({ detail, canEdit, onEditMapping }: { detail: ImportDetail; canEdit: boolean; onEditMapping: () => void }) {
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

  const status = detail.status;
  const readOnly = status === 'approved' || status === 'rejected' || !canEdit;
  const checked = status !== 'draft';
  const level = detectedLevel(detail);
  const rc = detail.replacementCount;

  const apply = (d: ImportDetail) => {
    qc.setQueryData(getGetImportQueryKey(d.id), d);
    void qc.invalidateQueries({ queryKey: getListImportsQueryKey() });
    void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(`/api/imports/${d.id}/issues`) });
  };

  const approveErr = approve.error;
  const raceExisting =
    errCodeOf(approveErr) === 'DUPLICATE_FILE' ? (errData(approveErr)?.details?.existingImportId as string | undefined) : undefined;

  return (
    <div className="space-y-5">
      {status === 'approved' && (
        <div className="fade-up flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--status-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-green)_7%,var(--card))] p-4" data-testid="banner-approved">
          <ShieldCheck className="size-5 shrink-0 text-status-green" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('imp.check.approvedTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('imp.check.approvedBody')}</p>
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
              <Button variant="outline" className="min-h-11" onClick={onEditMapping} data-testid="button-edit-mapping">
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
                    <span className="truncate">{t(`imp.check.counts.${k}`)}</span>
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
            <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2" data-testid="text-replacement">
              <CircleAlert className={cn('mt-0.5 size-4 shrink-0', rc > 0 ? 'text-status-amber' : 'text-muted-foreground')} aria-hidden="true" />
              {rc > 0 ? t('imp.check.replacement', { count: rc }) : t('imp.check.noReplacement')}
            </p>
          </div>
        </Section>
      )}

      {checked && (
        <Section title={t('imp.check.issuesTitle')} testId="section-issues">
          <Issues id={detail.id} />
        </Section>
      )}

      {(reject.error != null || (approveErr != null && !approveOpen)) && <ErrorNote error={reject.error ?? approveErr} />}

      {!readOnly && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {checked && (
            <Button variant="outline" className="min-h-11" onClick={onEditMapping} data-testid="button-change-settings">
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
              disabled={!!detail.duplicateOf}
              onClick={() => {
                approve.reset();
                setConfirmed(false);
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
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{t('imp.check.approveTitle')}</DialogTitle>
            <DialogDescription>{t('imp.check.approveBody')}</DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="text-approve-replacement">
            {rc > 0 ? t('imp.check.replacement', { count: rc }) : t('imp.check.noReplacement')}
          </p>
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
              disabled={approve.isPending || (rc > 0 && !confirmed)}
              onClick={() =>
                approve.mutate(
                  { id: detail.id, data: { confirmReplacement: rc > 0 ? confirmed : false, replacementCount: rc } },
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
