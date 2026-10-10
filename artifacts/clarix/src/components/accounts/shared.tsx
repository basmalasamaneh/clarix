import { forwardRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const charLen = (s: string) => Array.from(s).length;

export function newPasswordSchema(t: TFunction) {
  return z
    .string()
    .refine((v) => charLen(v) >= 12, t('acct.pw.min'))
    .refine((v) => v.length <= 256, t('acct.pw.max'));
}

/** Absolute invite URL: current origin + app base path + server-relative path. Never stored. */
export function absoluteInviteUrl(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function formatDate(iso: string | null | undefined, lang: string, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', {
    numberingSystem: 'latn',
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(d);
}

export const PasswordInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input> & { testId: string }>(
  function PasswordInput({ testId, className, ...props }, ref) {
    const { t } = useTranslation();
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={cn('h-11 pe-12', className)}
          spellCheck={false}
          autoCapitalize="off"
          data-testid={testId}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t('acct.pw.hide') : t('acct.pw.show')}
          aria-pressed={show}
          className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-md text-muted-foreground hover:text-foreground"
          data-testid={`button-toggle-${testId}`}
        >
          {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
    );
  },
);

export function LengthMeter({ value, testId }: { value: string; testId: string }) {
  const { t } = useTranslation();
  const n = charLen(value);
  const ok = n >= 12 && n <= 256;
  return (
    <div className="flex items-center gap-2 text-xs" aria-live="polite" data-testid={testId}>
      <div className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className={cn('h-1.5 w-2.5 rounded-sm', i < n ? 'bg-primary' : 'bg-muted')} />
        ))}
      </div>
      <span className={ok ? 'text-status-green' : 'text-muted-foreground'}>
        {ok ? t('acct.pw.ok') : t('acct.pw.count', { n: Math.min(n, 12) })}
      </span>
    </div>
  );
}

export function Pager({
  page,
  total,
  perPage,
  onPage,
  testId,
}: {
  page: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
  testId: string;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3 border-t px-4 py-3" aria-label={t('acct.page.of', { page, pages })}>
      <Button variant="outline" size="icon" className="size-11" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('acct.page.prev')} data-testid={`button-${testId}-prev`}>
        <ChevronLeft className="size-4 rtl-flip" aria-hidden="true" />
      </Button>
      <span className="text-sm text-muted-foreground" data-testid={`text-${testId}-page`}>
        {t('acct.page.of', { page, pages })}
      </span>
      <Button variant="outline" size="icon" className="size-11" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('acct.page.next')} data-testid={`button-${testId}-next`}>
        <ChevronRight className="size-4 rtl-flip" aria-hidden="true" />
      </Button>
    </nav>
  );
}

export function Panel({
  title,
  meta,
  lead,
  children,
  testId,
  action,
}: {
  title: string;
  meta?: ReactNode;
  lead?: string;
  children: ReactNode;
  testId: string;
  action?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow)]" aria-labelledby={`${testId}-h`} data-testid={testId}>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <h2 id={`${testId}-h`} className="flex items-baseline gap-2 text-base font-semibold">
            {title}
            {meta && <span className="num text-xs font-normal text-muted-foreground">{meta}</span>}
          </h2>
          {lead && <p className="mt-1 text-sm text-muted-foreground">{lead}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function InlineEmpty({ icon: Icon, title, body, testId }: { icon: LucideIcon; title: string; body: string; testId: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" data-testid={testId}>
      <div className="ledger-grid mb-4 flex size-14 items-center justify-center rounded-xl border bg-background">
        <Icon className="size-6 text-primary" aria-hidden="true" />
      </div>
      <div className="font-medium">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4" style={{ opacity: 1 - i * 0.15 }}>
          <div className="size-9 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-56 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InlineError({ message, onRetry, testId }: { message: string; onRetry: () => void; testId: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm" data-testid={testId}>
      <span className="text-status-red">{message}</span>
      <Button variant="outline" className="min-h-11" onClick={onRetry} data-testid={`button-retry-${testId}`}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

import type { QueryClient } from '@tanstack/react-query';
import { getGetSessionQueryKey, type Session } from '@workspace/api-client-react';

/** Wipe every cached user-scoped query and mark the session signed-out, then re-verify with the server. */
export function endLocalSession(qc: QueryClient) {
  const key = getGetSessionQueryKey();
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== key[0] });
  qc.setQueryData<Session>(key, (prev) =>
    prev ? { ...prev, user: null, memberships: [], allowedPages: [], activeFactoryId: null } : prev,
  );
  void qc.invalidateQueries({ queryKey: key });
}

/** Replace the cached session with a fresh one (rotated CSRF) and drop everything else. */
export function replaceSession(qc: QueryClient, next: Session, dropOthers: boolean) {
  const key = getGetSessionQueryKey();
  if (dropOthers) qc.removeQueries({ predicate: (q) => q.queryKey[0] !== key[0] });
  qc.setQueryData(key, next);
}
