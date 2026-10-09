import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  getGetSessionQueryKey,
  useGetSession,
  useUpdatePreferences,
  type Preferences,
  type Session,
} from '@workspace/api-client-react';
import i18n, { LOCAL_LANG_KEY, LOCAL_THEME_KEY } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';

export type Lang = 'en' | 'ar';
export type ThemePref = 'light' | 'dark' | 'system';

export function useSession() {
  return useGetSession({
    query: { queryKey: getGetSessionQueryKey(), staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    request: { credentials: 'include' },
  });
}

/** Request options carrying the current CSRF token. Read fresh every render. */
export function useCsrfRequest() {
  const qc = useQueryClient();
  const session = qc.getQueryData<Session>(getGetSessionQueryKey());
  return { credentials: 'include' as const, headers: { 'X-CSRF-Token': session?.csrfToken ?? '' } };
}

type ErrLike = { status?: number; data?: unknown } | null | undefined;

export function errorStatus(err: unknown): number | undefined {
  return (err as ErrLike)?.status;
}

export function localizeError(t: TFunction, err: unknown): string {
  const e = err as ErrLike;
  const rawCode =
    e?.data && typeof e.data === 'object' && 'error' in (e.data as object)
      ? String((e.data as { error: unknown }).error)
      : undefined;
  const code = rawCode ? ({
    INVALID_CREDENTIALS: 'invalid_credentials',
    TOO_MANY_ATTEMPTS: 'rate_limited',
    INVALID_CSRF: 'csrf_invalid',
  }[rawCode] ?? rawCode.toLowerCase()) : undefined;
  if (code && i18n.exists(`errors.codes.${code}`)) return t(`errors.codes.${code}`);
  if (e?.status && i18n.exists(`errors.status.${e.status}`)) return t(`errors.status.${e.status}`);
  if (err instanceof TypeError) return t('errors.network');
  return t('errors.generic');
}

export function errorCode(err: unknown): string | undefined {
  const e = err as ErrLike;
  if (e?.data && typeof e.data === 'object' && 'error' in (e.data as object)) return String((e.data as { error: unknown }).error);
  return e?.status ? String(e.status) : undefined;
}

function readLocal<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && allowed.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeLocal(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

type PrefsCtx = {
  language: Lang;
  theme: ThemePref;
  resolvedTheme: 'light' | 'dark';
  setLanguage: (l: Lang) => void;
  setTheme: (t: ThemePref) => void;
  setTourCompleted: (v: boolean) => void;
};

const Ctx = createContext<PrefsCtx | null>(null);

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePrefs outside PreferencesProvider');
  return c;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: session } = useSession();
  const user = session?.user ?? null;

  const [localLang, setLocalLang] = useState<Lang>(() => readLocal<Lang>(LOCAL_LANG_KEY, ['en', 'ar'], (i18n.language as Lang) ?? 'en'));
  const [localTheme, setLocalTheme] = useState<ThemePref>(() =>
    readLocal<ThemePref>(LOCAL_THEME_KEY, ['light', 'dark', 'system'], 'system'),
  );
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const language: Lang = user?.language ?? localLang;
  const theme: ThemePref = user?.theme ?? localTheme;
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
    if (i18n.language !== language) void i18n.changeLanguage(language);
    writeLocal(LOCAL_LANG_KEY, language);
  }, [language]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    writeLocal(LOCAL_THEME_KEY, theme);
  }, [resolvedTheme, theme]);

  const csrf = session?.csrfToken ?? '';
  const update = useUpdatePreferences({
    request: { credentials: 'include', headers: { 'X-CSRF-Token': csrf } },
    mutation: { scope: { id: 'user-preferences' } },
  });
  const mutateRef = useRef(update.mutate);
  mutateRef.current = update.mutate;
  const toastRef = useRef({ toast, t });
  toastRef.current = { toast, t };

  const persist = useCallback(
    (prefs: Preferences) => {
      const key = getGetSessionQueryKey();
      const prev = qc.getQueryData<Session>(key);
      if (!prev?.user) return false;
      qc.setQueryData<Session>(key, { ...prev, user: { ...prev.user, ...prefs } });
      mutateRef.current(
        { data: prefs },
        {
          onSuccess: (next) => qc.setQueryData(key, next),
          onError: () => {
            void qc.invalidateQueries({ queryKey: key });
            toastRef.current.toast({ variant: 'destructive', description: toastRef.current.t('prefs.saveFailed') });
          },
        },
      );
      return true;
    },
    [qc],
  );

  const value = useMemo<PrefsCtx>(
    () => ({
      language,
      theme,
      resolvedTheme,
      setLanguage: (l) => {
        setLocalLang(l);
        persist({ language: l });
      },
      setTheme: (th) => {
        setLocalTheme(th);
        persist({ theme: th });
      },
      setTourCompleted: (v) => {
        persist({ tourCompleted: v });
      },
    }),
    [language, theme, resolvedTheme, persist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const NAV_PAGES = ['overview', 'imports', 'runs', 'comparison', 'quality', 'settings'] as const;
export type TenantPage = (typeof NAV_PAGES)[number];

export function firstAllowedPath(session: Session | undefined): string {
  if (!session?.user) return '/login';
  const first = [...NAV_PAGES, 'platform'].find((p) => session.allowedPages.includes(p));
  if (first) return `/${first}`;
  if (session.user.platformAdmin) return '/platform';
  return '/overview';
}
