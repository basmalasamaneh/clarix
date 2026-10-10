import { Archive } from 'lucide-react';
import { SourceDrawerProvider } from '@/components/source/source-context';
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Building2,
  ChevronsUpDown,
  ClipboardCheck,
  Columns2,
  FileUp,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Settings2,
  ShieldHalf,
  UserCog,
  Users,
  Sparkles,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';
import {
  getGetSessionQueryKey,
  useLogout,
  useSelectFactory,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { BrandLockup } from '@/components/brand';
import { LanguageSwitch, ThemeMenu } from '@/components/prefs-controls';
import { FirstRunTour } from '@/components/tour';
import { useToast } from '@/hooks/use-toast';
import { localizeError, NAV_PAGES, usePrefs } from '@/lib/session';
import { cn } from '@/lib/utils';

export const PAGE_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  imports: FileUp,
  runs: ListOrdered,
  comparison: Columns2,
  snapshots: Archive,
  quality: ClipboardCheck,
  settings: Settings2,
  platform: ShieldHalf,
  members: Users,
  account: UserCog,
  help: CircleHelp,
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'C';
}

function NavList({ session, onNavigate }: { session: Session; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const isManager = !session.user?.platformAdmin && session.memberships.some((m) => m.factoryId === session.activeFactoryId && m.role === 'factory_manager');
  const tenant = NAV_PAGES.filter((p) => session.allowedPages.includes(p) && (p !== 'settings' || isManager));
  const showMembers = !session.user?.platformAdmin && session.allowedPages.includes('members');
  const showPlatform = session.user?.platformAdmin && session.allowedPages.includes('platform');
  const item = (p: string) => {
    const Icon = PAGE_ICONS[p] ?? BarChart3;
    const active = location === `/${p}`;
    return (
      <li key={p}>
        <Link
          href={`/${p}`}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          data-testid={`link-nav-${p}`}
          className={cn(
            'group relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] transition-colors',
            active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <span
            className={cn(
              'absolute inset-y-1.5 start-0 w-[3px] rounded-full transition-opacity brand-gradient',
              active ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden="true"
          />
          <Icon className={cn('size-4 shrink-0', active && 'text-primary')} aria-hidden="true" />
          {t(`nav.${p}`)}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label={t('nav.section')} className="flex flex-col gap-6">
      {tenant.length > 0 && (
        <div>
          <div className="px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t('nav.section')}
          </div>
          <ul className="flex flex-col gap-0.5">{tenant.map(item)}{showMembers && item('members')}</ul>
        </div>
      )}
      <div>
        <div className="px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {t('nav.helpSection')}
        </div>
        <ul className="flex flex-col gap-0.5">{item('help')}</ul>
      </div>
      {showPlatform && (
        <div>
          <div className="px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t('nav.adminSection')}
          </div>
          <ul className="flex flex-col gap-0.5">{item('platform')}</ul>
        </div>
      )}
    </nav>
  );
}

function FactorySelector({ session, csrf }: { session: Session; csrf: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const select = useSelectFactory({ request: { credentials: 'include', headers: { 'X-CSRF-Token': csrf } } });
  if (session.memberships.length === 0) return null;
  const active = session.memberships.find((m) => m.factoryId === session.activeFactoryId);
  return (
    <Select
      value={session.activeFactoryId ?? undefined}
      disabled={select.isPending}
      onValueChange={(factoryId) =>
        select.mutate(
          { data: { factoryId } },
          {
            onSuccess: (next) => {
              qc.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/factories/') });
              qc.setQueryData(getGetSessionQueryKey(), next);
              const name = next.memberships.find((m) => m.factoryId === next.activeFactoryId)?.factoryName ?? '';
              toast({ description: t('factory.switched', { name }) });
            },
            onError: (err) => toast({ variant: 'destructive', title: t('factory.switchFailed'), description: localizeError(t, err) }),
          },
        )
      }
    >
      <SelectTrigger
        className="h-11 w-full min-w-0 gap-2 bg-card sm:w-64 md:w-80"
        aria-label={t('factory.label')}
        data-testid="select-factory"
      >
        <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1 overflow-hidden text-start leading-tight">
          <SelectValue className="block max-w-full truncate" placeholder={t('factory.choose')} />
        </div>
        {active && (
          <span className="hidden shrink-0 rounded border px-1.5 py-px text-[0.68rem] text-muted-foreground md:inline">
            {t(`roles.${active.role}`)}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        {session.memberships.map((m) => (
          <SelectItem key={m.factoryId} value={m.factoryId} data-testid={`option-factory-${m.factoryId}`}>
            <span className="truncate">{m.factoryName}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserMenu({ session, csrf, onReplayTour }: { session: Session; csrf: string; onReplayTour: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const logout = useLogout({ request: { credentials: 'include', headers: { 'X-CSRF-Token': csrf } } });
  const user = session.user!;
  const role = session.memberships.find((m) => m.factoryId === session.activeFactoryId)?.role;
  const doLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        const key = getGetSessionQueryKey();
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== key[0] });
        qc.setQueryData<Session>(key, (prev) =>
          prev ? { ...prev, user: null, memberships: [], allowedPages: [], activeFactoryId: null } : prev,
        );
        void qc.invalidateQueries({ queryKey: key });
        navigate('/login');
      },
      onError: (err) => toast({ variant: 'destructive', description: localizeError(t, err) }),
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 min-w-11 gap-2 px-1.5 sm:px-2" aria-label={t('user.account')} data-testid="button-user-menu">
          <Avatar className="size-8">
            <AvatarFallback className="bg-secondary text-xs font-semibold text-primary">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <ChevronsUpDown className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium" data-testid="text-user-name">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground" dir="ltr" data-testid="text-user-email">
            {user.email}
          </div>
          <div className="mt-1.5 text-xs text-primary">
            {user.platformAdmin ? t('roles.platformAdmin') : role ? t(`roles.${role}`) : ''}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/account" data-testid="link-account">
            <UserCog className="size-4" aria-hidden="true" />
            {t('nav.account')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onReplayTour} className="gap-2" data-testid="button-replay-tour">
          <Sparkles className="size-4" aria-hidden="true" />
          {t('user.replayTour')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={doLogout} disabled={logout.isPending} className="gap-2" data-testid="button-logout">
          <LogOut className="size-4 rtl-flip" aria-hidden="true" />
          {logout.isPending ? t('user.loggingOut') : t('user.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const { t } = useTranslation();
  const { language, setTourCompleted } = usePrefs();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [replay, setReplay] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const csrf = session.csrfToken;
  const tourOpen = replay || (!dismissed && session.user?.tourCompleted === false);

  const sidebarBody = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b px-5">
        <BrandLockup tagline={t('brand.tagline')} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavList session={session} onNavigate={onNavigate} />
      </div>
      <div className="border-t px-5 py-4">
        <div className="tick-rule mb-3 h-1.5 opacity-70" aria-hidden="true" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('common.phase')}</span>
          <span className="num font-mono">v0.1</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:min-h-11 focus:min-w-11"
      >
        {t('common.skipToContent')}
      </a>
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 border-e bg-card lg:block">{sidebarBody()}</aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side={language === 'ar' ? 'right' : 'left'} className="w-72 p-0">
          <SheetTitle className="sr-only">{t('common.menu')}</SheetTitle>
          {sidebarBody(() => setMobileOpen(false))}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t('common.menu')}
            data-testid="button-mobile-menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <FactorySelector session={session} csrf={csrf} />
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <div className="hidden sm:block">
              <LanguageSwitch />
            </div>
            <div className="sm:hidden">
              <LanguageSwitch compact />
            </div>
            <ThemeMenu />
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <UserMenu session={session} csrf={csrf} onReplayTour={() => setReplay(true)} />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-8 outline-none sm:px-8 lg:px-12 lg:py-10">
          <div className="mx-auto w-full max-w-6xl"><SourceDrawerProvider session={session}>{children}</SourceDrawerProvider></div>
        </main>
      </div>

      <FirstRunTour
        open={tourOpen}
        onFinish={() => {
          setReplay(false);
          setDismissed(true);
          if (session.user?.tourCompleted === false) setTourCompleted(true);
        }}
      />
    </div>
  );
}
