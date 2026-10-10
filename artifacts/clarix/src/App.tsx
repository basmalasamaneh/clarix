import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Redirect, Route, Switch, useLocation, useSearch, Router as WouterRouter } from 'wouter';
import '@/lib/accounts-i18n';
import '@/lib/phase10-i18n';
import '@/lib/phase13-i18n';
import '@/lib/phase14-i18n';
import '@/lib/phase18-i18n';
import ResetPage from '@/pages/reset';
import { SecurityNotices } from '@/components/security/security-admin';
import SnapshotsPage from '@/pages/snapshots';
import SnapshotDetailPage from '@/pages/snapshot-detail';
import HelpPage from '@/pages/help';
import MembersPage from '@/pages/members';
import AccountPage from '@/pages/account';
import InvitePage from '@/pages/invite';
import { Building2, CloudOff, RotateCcw, UserRoundX } from 'lucide-react';
import type { Session } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { CrashScreen } from '@/components/crash-screen';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { BrandMark } from '@/components/brand';
import { LanguageSwitch, ThemeMenu } from '@/components/prefs-controls';
import { StateScreen } from '@/components/state-screen';
import NotFound from '@/pages/not-found';
import ImportsPage from '@/pages/imports';
import QualityPageView from '@/pages/quality';
import RunsPage from '@/pages/runs';
import OverviewPage from '@/pages/overview';
import ComparisonPage from '@/pages/comparison';
import LoginPage from '@/pages/login';
import PlatformPage from '@/pages/platform';
import TenantPageView, { ForbiddenState } from '@/pages/tenant-page';
import { errorCode, firstAllowedPath, NAV_PAGES, PreferencesProvider, useSession, type TenantPage } from '@/lib/session';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function BareFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="flex h-16 items-center justify-between px-4 sm:px-8">
        <BrandMark />
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <ThemeMenu />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}

function SessionLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[100dvh] bg-background" aria-busy="true" role="status">
      <span className="sr-only">{t('states.sessionLoading')}</span>
      <div className="hidden w-64 shrink-0 border-e bg-card p-5 lg:block">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-10 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-muted" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      </div>
      <div className="flex-1">
        <div className="flex h-16 items-center gap-3 border-b px-6">
          <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12">
          <div className="h-8 w-56 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
          <div className="mt-10 h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

function TenantRoute({ page, session }: { page: TenantPage; session: Session }) {
  const { t } = useTranslation();
  if (!session.allowedPages.includes(page)) return <ForbiddenState session={session} />;
  if (!session.activeFactoryId) {
    return (
      <StateScreen icon={Building2} title={t('states.noFactoryTitle')} body={t('states.noFactoryBody')} testId="state-no-factory" />
    );
  }
  if (page === 'overview') return <OverviewPage key={session.activeFactoryId} session={session} />;
  if (page === 'imports') return <ImportsPage key={session.activeFactoryId} session={session} />;
  if (page === 'runs') return <RunsPage key={session.activeFactoryId} session={session} />;
  if (page === 'comparison') return <ComparisonPage key={session.activeFactoryId} session={session} />;
  if (page === 'snapshots') return <SnapshotsPage key={session.activeFactoryId} session={session} />;
  if (page === 'quality') return <QualityPageView key={session.activeFactoryId} session={session} />;
  return <TenantPageView key={`${session.activeFactoryId}:${page}`} page={page} session={session} />;
}

function CompareAlias() {
  const search = useSearch();
  return <Redirect to={`/comparison${search ? `?${search}` : ''}`} replace />;
}

function AuthedRoutes({ session }: { session: Session }) {
  const { t } = useTranslation();
  const user = session.user!;
  const home = firstAllowedPath(session);

  if (!user.platformAdmin && session.memberships.length === 0) {
    return (
      <AppShell session={session}>
        <Switch>
          <Route path="/help">{() => <HelpPage />}</Route>
          <Route>{() => <StateScreen
          icon={UserRoundX}
          tone="amber"
          title={t('states.noMembershipTitle')}
          body={t('states.noMembershipBody')}
          testId="state-no-membership"
        />}</Route>
        </Switch>
      </AppShell>
    );
  }

  return (
    <AppShell session={session}>
      <SecurityNotices session={session} />
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/">{() => <Redirect to={home} replace />}</Route>
          <Route path="/login">{() => <Redirect to={home} replace />}</Route>
          {NAV_PAGES.map((p) => (
            <Route key={p} path={`/${p}`}>
              {() => <TenantRoute page={p} session={session} />}
            </Route>
          ))}
          <Route path="/snapshots/:id">
            {(params) =>
              !user.platformAdmin && session.allowedPages.includes('snapshots') && session.activeFactoryId ? (
                <SnapshotDetailPage key={`${session.activeFactoryId}:${params.id}`} id={params.id} session={session} />
              ) : (
                <ForbiddenState session={session} />
              )
            }
          </Route>
          <Route path="/members">
            {() =>
              !user.platformAdmin && session.allowedPages.includes('members') && session.activeFactoryId ? (
                <MembersPage key={session.activeFactoryId} session={session} />
              ) : (
                <ForbiddenState session={session} />
              )
            }
          </Route>
          <Route path="/help">{() => <HelpPage />}</Route>
          <Route path="/account">{() => <AccountPage session={session} />}</Route>
          <Route path="/compare">{() => <CompareAlias />}</Route>
          <Route path="/platform">
            {() =>
              user.platformAdmin && session.allowedPages.includes('platform') ? (
                <PlatformPage />
              ) : (
                <ForbiddenState session={session} />
              )
            }
          </Route>
          <Route>{() => <NotFound home={home} />}</Route>
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function Gate() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { data: session, isLoading, isError, error, refetch, isFetching } = useSession();
  const inviteMatch = /^\/invite\/([^/?#]+)$/.exec(location);
  if (inviteMatch) return <InvitePage token={decodeURIComponent(inviteMatch[1])} />;
  if (location === '/reset') return <ResetPage />;

  if (isLoading) return <SessionLoading />;
  if (isError || !session) {
    return (
      <BareFrame>
        <StateScreen
          icon={CloudOff}
          tone="red"
          title={t('states.sessionErrorTitle')}
          body={t('states.sessionErrorBody')}
          code={errorCode(error) ? t('states.code', { code: errorCode(error) }) : undefined}
          testId="state-session-error"
          actions={
            <Button onClick={() => refetch()} disabled={isFetching} className="gap-2" data-testid="button-retry-session">
              <RotateCcw className="size-4" aria-hidden="true" />
              {t('common.retry')}
            </Button>
          }
        />
      </BareFrame>
    );
  }

  if (!session.user) {
    if (location !== '/login') return <Redirect to="/login" replace />;
    return <LoginPage />;
  }

  return <AuthedRoutes session={session} />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location} FallbackComponent={CrashScreen}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PreferencesProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Gate />
          </WouterRouter>
          <Toaster />
        </PreferencesProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
