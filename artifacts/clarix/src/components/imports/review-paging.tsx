import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCsrfRequest } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useReviewPage, type ReviewExtra, type ReviewKind } from '@/lib/import-api';
import { ErrorNote, Pager } from './shared';

/**
 * Server-paged list. Page 1 renders the inline preview (first 20 from the detail/issue payload);
 * later pages are fetched from POST /api/imports/:id/review-page. Never truncates the tail.
 */
export function ServerPaged<T>({
  importId,
  kind,
  extra = {},
  scope = '',
  preview,
  total,
  testId,
  children,
}: {
  importId: string;
  kind: ReviewKind;
  extra?: ReviewExtra;
  scope?: string;
  preview: T[];
  total: number;
  testId: string;
  children: (items: T[], offset: number) => ReactNode;
}) {
  const { t } = useTranslation();
  const req = useCsrfRequest();
  const [page, setPage] = useState(1);
  const all = Math.max(total, preview.length);
  useEffect(() => setPage(1), [importId, kind, scope, extra.issueId, extra.code]);
  useEffect(() => setPage(p => Math.min(p, Math.max(1, Math.ceil(all / 20)))), [all]);
  const remote = page > 1;
  const q = useReviewPage<T>(importId, kind, page, extra, scope, req, remote);
  // importId is already part of the query key (reviewPageKey).
  const offset = (page - 1) * 20;

  let body: ReactNode;
  if (!remote) body = children(preview.slice(0, 20), 0);
  else if (q.isLoading)
    body = (
      <div className="space-y-1.5" aria-busy="true" data-testid={`state-${testId}-loading`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-7 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  else if (q.isError)
    body = (
      <ErrorNote
        error={q.error}
        testId={`status-${testId}-error`}
        action={
          <Button variant="outline" className="min-h-11 gap-2" onClick={() => void q.refetch()} data-testid={`button-retry-${testId}`}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('imp.errors.retry')}
          </Button>
        }
      />
    );
  else body = <div className={cn(q.isFetching && 'opacity-70')}>{children(q.data?.items ?? [], offset)}</div>;

  return (
    <div className="min-w-0">
      {body}
      <Pager page={page} total={all} onPage={setPage} testId={`pager-${testId}`} />
    </div>
  );
}
