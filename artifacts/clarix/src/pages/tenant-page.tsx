import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Lock, RotateCcw } from 'lucide-react';
import { getGetPageQueryKey, useGetPage, type Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { EmptyPanel, PageHeader, PageSkeleton } from '@/components/empty-page';
import { StateScreen } from '@/components/state-screen';
import { PAGE_ICONS } from '@/components/app-shell';
import { RunsSelect, ComparisonSelect } from '@/components/sources/run-select';
import { SourceAdmin } from '@/components/sources/source-admin';
import { errorCode, errorStatus, firstAllowedPath, localizeError, type TenantPage } from '@/lib/session';

export function ForbiddenState({ session }: { session: Session }) {
  const { t } = useTranslation();
  return (
    <StateScreen
      icon={Lock}
      tone="amber"
      title={t('states.forbiddenTitle')}
      body={t('states.forbiddenBody')}
      code={t('states.forbiddenCode')}
      testId="state-forbidden"
      actions={
        <Button asChild variant="outline">
          <Link href={firstAllowedPath(session)} data-testid="link-allowed-page">
            {t('states.forbiddenAction')}
          </Link>
        </Button>
      }
    />
  );
}

export default function TenantPageView({ page, session }: { page: TenantPage; session: Session }) {
  const { t } = useTranslation();
  const factoryId = session.activeFactoryId ?? '';
  const q = useGetPage(factoryId, page, {
    query: { enabled: !!factoryId, queryKey: getGetPageQueryKey(factoryId, page), retry: (n, e) => errorStatus(e) !== 403 && n < 1 },
    request: { credentials: 'include' },
  });
  const factory = session.memberships.find((m) => m.factoryId === factoryId);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    if (errorStatus(q.error) === 403) return <ForbiddenState session={session} />;
    return (
      <StateScreen
        icon={AlertTriangle}
        tone="red"
        title={t('states.pageErrorTitle')}
        body={localizeError(t, q.error)}
        code={errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined}
        testId="state-page-error"
        actions={
          <Button onClick={() => q.refetch()} className="gap-2" data-testid="button-retry">
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('common.retry')}
          </Button>
        }
      />
    );
  }

  return (
    <div data-testid={`page-${page}`} data-state={q.data?.state}>
      <PageHeader
        icon={PAGE_ICONS[page]}
        title={t(`pages.${page}.title`)}
        lead={t(`pages.${page}.lead`)}
        meta={factory ? `${factory.factoryName} · ${t('factory.isolated')}` : undefined}
      />
      {page === 'runs' ? (
        <RunsSelect />
      ) : page === 'comparison' ? (
        <ComparisonSelect />
      ) : (
      <EmptyPanel
        pageKey={page}
        title={t(`pages.${page}.emptyTitle`)}
        body={t(`pages.${page}.emptyBody`)}
        items={[t(`pages.${page}.i1`), t(`pages.${page}.i2`), t(`pages.${page}.i3`)]}
      />
      )}
      {page === 'settings' && factory?.role === 'factory_manager' && <SourceAdmin />}
    </div>
  );
}
