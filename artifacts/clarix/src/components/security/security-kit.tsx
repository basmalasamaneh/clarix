import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ShieldAlert, ShieldCheck, Users, X } from 'lucide-react';
import { Link } from 'wouter';
import {
  getGetAccountSecurityQueryKey,
  useChangeAccountSecurity,
  useGetAccountSecurity,
  type SecurityActionInput,
  type SecurityActionResult,
} from '@workspace/api-client-react';
import '@/lib/phase18-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput, charLen } from '@/components/accounts/shared';
import { errorCode, localizeError, useCsrfRequest } from '@/lib/session';
import { cn } from '@/lib/utils';

export function useSecurityState(enabled = true) {
  return useGetAccountSecurity({
    request: { credentials: 'include' },
    query: { queryKey: getGetAccountSecurityQueryKey(), enabled, staleTime: 15_000, retry: 1 },
  });
}

type Done = (r: SecurityActionResult) => void;

/**
 * Runs a POST /auth/security action. When the server answers RECENT_SIGN_IN_REQUIRED,
 * the action is parked in `retry` so <ReauthInline> can confirm identity and replay it.
 */
export function useSecurityAction() {
  const qc = useQueryClient();
  const req = useCsrfRequest();
  const m = useChangeAccountSecurity({ request: req, mutation: { gcTime: 0 } });
  const [retry, setRetry] = useState<null | (() => void)>(null);
  const run = (data: SecurityActionInput, onDone?: Done, onFail?: (e: unknown) => void) => {
    setRetry(null);
    m.mutate(
      { data },
      {
        onSuccess: (r) => {
          void qc.invalidateQueries({ queryKey: getGetAccountSecurityQueryKey() });
          onDone?.(r);
          m.reset(); // secrets live only in the caller's local state, never in the mutation cache
        },
        onError: (e) => {
          if (errorCode(e) === 'RECENT_SIGN_IN_REQUIRED') setRetry(() => () => run(data, onDone, onFail));
          else onFail?.(e);
        },
      },
    );
  };
  const needsReauth = !!retry;
  const error = m.isError && !needsReauth ? m.error : null;
  return { run, pending: m.isPending, retry, needsReauth, cancelReauth: () => setRetry(null), error, reset: () => { m.reset(); setRetry(null); } };
}

export function ReauthInline({ onConfirmed, onCancel, testId = 'reauth' }: { onConfirmed: () => void; onCancel: () => void; testId?: string }) {
  const { t } = useTranslation();
  const sec = useSecurityState();
  const enrolled = !!sec.data?.enrolled;
  const act = useSecurityAction();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const submit = () =>
    act.run({ action: 'reauth', password, ...(enrolled ? { code: code.trim() } : {}) }, () => {
      setPassword('');
      setCode('');
      onConfirmed();
    }, () => setCode(''));
  return (
    <form
      className="fade-up space-y-3 rounded-lg border border-primary/35 bg-accent p-4"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      data-testid={testId}
      noValidate
    >
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <div className="text-sm font-semibold">{t('sec.reauth.title')}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">{enrolled ? t('sec.reauth.bodyMfa') : t('sec.reauth.body')}</p>
        </div>
      </div>
      <div className={cn('grid gap-3', enrolled && 'sm:grid-cols-2')}>
        <div className="space-y-1.5">
          <Label htmlFor={`${testId}-pw`}>{t('sec.common.password')}</Label>
          <PasswordInput id={`${testId}-pw`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={256} autoFocus testId={`input-${testId}-password`} />
        </div>
        {enrolled && <CodeField id={`${testId}-code`} value={code} onChange={setCode} testId={`input-${testId}-code`} />}
      </div>
      {act.error && <ErrorLine error={act.error} testId={`error-${testId}`} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel} data-testid={`button-${testId}-cancel`}>{t('sec.common.cancel')}</Button>
        <Button type="submit" className="min-h-11" disabled={act.pending || !password || (enrolled && !code.trim())} data-testid={`button-${testId}-submit`}>
          {act.pending ? t('sec.common.working') : t('sec.reauth.submit')}
        </Button>
      </div>
    </form>
  );
}

export function CodeField({ id, value, onChange, testId, label, recovery }: { id: string; value: string; onChange: (v: string) => void; testId: string; label?: string; recovery?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label ?? t('sec.common.code')}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        maxLength={128}
        spellCheck={false}
        autoCapitalize="off"
        className="h-11 text-start font-mono tracking-[0.2em]"
        aria-describedby={`${id}-hint`}
        data-testid={testId}
      />
      {!label && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t('sec.common.codeHint')}</p>}
    </div>
  );
}

export function ErrorLine({ error, testId }: { error: unknown; testId: string }) {
  const { t } = useTranslation();
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md border border-status-red/35 bg-status-red/[0.06] p-3 text-sm text-status-red" data-testid={testId}>
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {localizeError(t, error)}
    </p>
  );
}

/** One-time secret display. Lives only in React state; never persisted or logged. */
export function SecretBox({ label, lines, testId, onSaved, savedLabel }: { label: string; lines: string[]; testId: string; onSaved?: () => void; savedLabel?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="fade-up space-y-3" data-testid={testId}>
      <div className="rounded-lg border-2 border-dashed border-primary/40 bg-background">
        <div className="flex items-center justify-between gap-2 border-b border-dashed border-primary/30 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{label}</span>
          <Button type="button" size="sm" variant="outline" className="min-h-9 gap-1.5" onClick={copy} data-testid={`button-copy-${testId}`}>
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied ? t('sec.common.copied') : t('sec.common.copy')}
          </Button>
        </div>
        <div
          dir="ltr"
          className={cn('select-all p-3 font-mono text-sm break-all', lines.length > 1 && 'grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-2')}
          data-testid={`text-${testId}`}
        >
          {lines.map((l, i) => (
            <span key={i} className="flex gap-2">
              {lines.length > 1 && <span className="num w-5 text-muted-foreground">{i + 1}.</span>}
              {l}
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('sec.secret.once')} {t('sec.secret.noShare')}</p>
      {onSaved && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid={`checkbox-saved-${testId}`} />
            {t('sec.secret.saved')}
          </label>
          <Button type="button" className="min-h-11" disabled={!ack} onClick={onSaved} data-testid={`button-saved-${testId}`}>
            {savedLabel ?? t('sec.common.done')}
          </Button>
        </div>
      )}
    </div>
  );
}

const COMMON = ['password', '123456', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', 'abc123', '111111', 'clarix', 'factory'];

export function StrengthGuide({ value, testId }: { value: string; testId: string }) {
  const { t } = useTranslation();
  const n = charLen(value);
  const lower = value.toLowerCase();
  const looksCommon = n > 0 && (COMMON.some((w) => lower.includes(w)) || /^(.)\1+$/.test(value) || /^\d+$/.test(value));
  const items = [
    { ok: n >= 12 && value.length <= 256, text: t('sec.strength.length') },
    { ok: n > 0 && !looksCommon, text: t('sec.strength.common') },
    { ok: /\s/.test(value.trim()) && n >= 16, text: t('sec.strength.sentence') },
  ];
  return (
    <div className="rounded-md border bg-background px-3 py-2.5 text-xs" aria-live="polite" data-testid={testId}>
      <div className="mb-1.5 font-semibold text-muted-foreground">{t('sec.strength.title')}</div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.text} className={cn('flex items-center gap-2', it.ok ? 'text-status-green' : 'text-muted-foreground')}>
            {it.ok ? <Check className="size-3.5" aria-hidden="true" /> : <span className="mx-[3px] size-2 rounded-full border border-current" aria-hidden="true" />}
            {it.text}
          </li>
        ))}
      </ul>
      {looksCommon && <p className="mt-1.5 text-status-amber" role="status">{t('sec.strength.looksCommon')}</p>}
    </div>
  );
}

export function Notice({ tone, icon, title, body, action, onDismiss, testId }: { tone: 'primary' | 'amber'; icon: ReactNode; title: string; body: string; action?: ReactNode; onDismiss?: () => void; testId: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={cn(
        'fade-up flex flex-wrap items-start gap-3 rounded-xl border p-4',
        tone === 'amber' ? 'border-status-amber/40 bg-status-amber/[0.07]' : 'border-primary/35 bg-accent',
      )}
      data-testid={testId}
    >
      <span className={cn('mt-0.5 shrink-0', tone === 'amber' ? 'text-status-amber' : 'text-primary')}>{icon}</span>
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex items-center gap-1">
        {action}
        {onDismiss && (
          <Button type="button" variant="ghost" size="icon" className="size-11" onClick={onDismiss} aria-label={t('sec.banner.dismiss')} data-testid={`button-dismiss-${testId}`}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function SecondManagerHint({ testId = 'notice-second-manager', showLink = true, dismissible = false }: { testId?: string; showLink?: boolean; dismissible?: boolean }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <Notice
      tone="primary"
      icon={<Users className="size-5" aria-hidden="true" />}
      title={t('sec.banner.singleTitle')}
      body={t('sec.banner.singleBody')}
      testId={testId}
      onDismiss={dismissible ? () => setHidden(true) : undefined}
      action={showLink ? (
        <Link href="/members" className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 text-sm font-medium hover-elevate" data-testid={`link-${testId}`}>
          {t('sec.banner.singleAction')}
        </Link>
      ) : undefined}
    />
  );
}
