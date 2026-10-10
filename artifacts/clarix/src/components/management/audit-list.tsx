import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { History } from 'lucide-react';
import type { ManagementAuditEntry, ManagementAuditPage } from '@workspace/api-client-react';
import { formatDate, InlineEmpty, InlineError, Pager, Panel, RowsSkeleton } from '@/components/accounts/shared';
import { localizeError, usePrefs } from '@/lib/session';

export const PER_PAGE = 20;
const SECRET = /token|secret|hash|password|path|link/i;

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? Object.values(x as object).join(' = ') : String(x))).join(', ') || '—';
  if (typeof v === 'object') return Object.entries(v as object).map(([k, x]) => `${k}: ${fmt(x)}`).join(', ');
  return String(v);
}

function Values({ label, value }: { label: string; value: ManagementAuditEntry['oldValue'] }) {
  const { t } = useTranslation();
  if (!value) return null;
  const entries = Object.entries(value).filter(([k]) => !SECRET.test(k));
  if (!entries.length) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 space-y-0.5 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="break-words">
            <span className="text-muted-foreground">{i18n.exists(`p13.audit.fields.${k}`) ? t(`p13.audit.fields.${k}`) : k}</span>{' '}
            <span className="num">{k === 'defaultLanguage' && (v === 'ar' || v === 'en') ? t(`p13.plat.lang.${v}`) : fmt(v)}</span>
          </div>
        ))}
      </dd>
    </div>
  );
}

export function AuditPanel({
  title,
  lead,
  emptyTitle,
  emptyBody,
  errorText,
  query,
  page,
  onPage,
  testId,
}: {
  title: string;
  lead: string;
  emptyTitle: string;
  emptyBody: string;
  errorText: string;
  query: { data?: ManagementAuditPage; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  page: number;
  onPage: (p: number) => void;
  testId: string;
}) {
  const { t } = useTranslation();
  const { language } = usePrefs();
  const d = query.data;
  return (
    <Panel title={title} lead={lead} meta={d ? String(d.total) : undefined} testId={testId}>
      {query.isLoading ? (
        <RowsSkeleton />
      ) : query.isError ? (
        <InlineError message={`${errorText} ${localizeError(t, query.error)}`} onRetry={() => query.refetch()} testId={`${testId}-error`} />
      ) : !d || d.items.length === 0 ? (
        <InlineEmpty icon={History} title={emptyTitle} body={emptyBody} testId={`${testId}-empty`} />
      ) : (
        <>
          <ol className="divide-y">
            {d.items.map((e) => {
              const key = `p13.audit.actions.${e.action}`;
              const label = i18n.exists(key) ? t(key) : t('p13.audit.actions.other', { action: e.action });
              return (
                <li key={e.id} className="grid gap-2 px-4 py-3 sm:px-5" data-testid={`row-audit-${e.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-medium">
                      {label}
                      {e.factoryId && <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">{e.factoryId}</span>}
                    </p>
                    <time className="num text-xs text-muted-foreground" dateTime={e.createdAt}>{formatDate(e.createdAt, language)}</time>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('p13.audit.by', { name: e.actorName ?? t('p13.audit.system') })}</p>
                  {(e.oldValue || e.newValue) && (
                    <dl className="grid gap-3 rounded-md bg-muted p-2.5 sm:grid-cols-2">
                      <Values label={t('p13.audit.old')} value={e.oldValue} />
                      <Values label={t('p13.audit.new')} value={e.newValue} />
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
          <Pager page={page} total={d.total} perPage={PER_PAGE} onPage={onPage} testId={`${testId}-pager`} />
        </>
      )}
    </Panel>
  );
}
