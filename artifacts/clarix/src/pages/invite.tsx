import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Building2, CalendarClock, Info, Link2Off, Mail, RotateCcw, UserCog } from 'lucide-react';
import {
  getGetInvitationDetailsQueryKey,
  useAcceptInvitation,
  useGetInvitationDetails,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { BrandLockup } from '@/components/brand';
import { LanguageSwitch, ThemeMenu } from '@/components/prefs-controls';
import { StateScreen } from '@/components/state-screen';
import { useToast } from '@/hooks/use-toast';
import { errorStatus, firstAllowedPath, localizeError, usePrefs, useSession } from '@/lib/session';
import { formatDate, LengthMeter, newPasswordSchema, PasswordInput, replaceSession } from '@/components/accounts/shared';

/** Keep the token out of Referer headers while this page is mounted. */
function useNoReferrer() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.prepend(meta);
    return () => meta.remove();
  }, []);
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="flex h-16 items-center justify-between border-b px-4 sm:px-8">
        <BrandLockup />
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <ThemeMenu />
        </div>
      </div>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">{children}</main>
    </div>
  );
}

export default function InvitePage({ token }: { token: string }) {
  const { t } = useTranslation();
  const { language } = usePrefs();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: session } = useSession();
  useNoReferrer();

  const validShape = token.length >= 32 && token.length <= 128;
  const key = getGetInvitationDetailsQueryKey({ token });
  const details = useGetInvitationDetails(
    { token },
    {
      request: { credentials: 'include' },
      query: { queryKey: key, enabled: validShape, retry: false, gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false },
    },
  );

  useEffect(() => () => qc.removeQueries({ queryKey: key }), [qc, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = useAcceptInvitation({
    mutation: { gcTime: 0 },
    request: { credentials: 'include', headers: { 'X-CSRF-Token': session?.csrfToken ?? '' } },
  });

  const schema = z
    .object({
      name: z.string().trim().min(1, t('acct.invite.nameRequired')).max(100, t('acct.invite.nameMax')),
      password: newPasswordSchema(t),
      confirm: z.string(),
    })
    .refine((v) => !v.confirm || v.confirm === v.password, { path: ['confirm'], message: t('acct.pw.mismatch') });
  type V = z.infer<typeof schema>;
  const form = useForm<V>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: { name: '', password: '', confirm: '' } });
  const formRef = useRef(form);
  formRef.current = form;
  useEffect(() => () => formRef.current.reset({ name: '', password: '', confirm: '' }), []);
  const pw = form.watch('password');

  const submit = (v: V) =>
    accept.mutate(
      { data: { token, name: v.name.trim(), password: v.password } },
      {
        onSuccess: (next) => {
          form.reset({ name: '', password: '', confirm: '' });
          accept.reset();
          replaceSession(qc, next, true);
          toast({ description: t('acct.invite.success') });
          navigate(firstAllowedPath(next), { replace: true });
        },
        onError: () => {
          form.setValue('password', '');
          form.setValue('confirm', '');
        },
      },
    );

  if (validShape && details.isLoading) {
    return (
      <Frame>
        <div className="w-full max-w-md space-y-4" role="status" aria-busy="true" data-testid="state-invite-loading">
          <span className="sr-only">{t('acct.invite.loading')}</span>
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
          <div className="h-11 animate-pulse rounded-md bg-muted" />
          <div className="h-11 animate-pulse rounded-md bg-muted" />
        </div>
      </Frame>
    );
  }

  const unavailable = !validShape || (details.isError && [400, 404, 410].includes(errorStatus(details.error) ?? 0));
  const acceptGone = accept.isError && errorStatus(accept.error) === 404;
  if (unavailable || acceptGone) {
    return (
      <Frame>
        <StateScreen
          icon={Link2Off}
          tone="amber"
          title={t('acct.invite.unavailableTitle')}
          body={t('acct.invite.unavailableBody')}
          testId="state-invite-unavailable"
          actions={
            <Button asChild className="min-h-11">
              <Link href="/login" data-testid="link-invite-login">{t('acct.invite.toLogin')}</Link>
            </Button>
          }
        />
      </Frame>
    );
  }
  if (details.isError || !details.data) {
    return (
      <Frame>
        <StateScreen
          icon={RotateCcw}
          tone="red"
          title={t('acct.invite.errorTitle')}
          body={t('acct.invite.errorBody')}
          testId="state-invite-error"
          actions={
            <Button onClick={() => details.refetch()} className="min-h-11 gap-2" data-testid="button-retry-invite">
              <RotateCcw className="size-4" aria-hidden="true" />
              {t('common.retry')}
            </Button>
          }
        />
      </Frame>
    );
  }

  const d = details.data;
  const facts = [
    { icon: Building2, label: t('acct.invite.factory'), value: d.factoryName, id: 'factory' },
    { icon: UserCog, label: t('acct.invite.role'), value: t(`roles.${d.role}`), id: 'role' },
    { icon: Mail, label: t('acct.invite.email'), value: d.email, id: 'email', ltr: true },
  ];

  return (
    <Frame>
      <div className="w-full max-w-md fade-up">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{t('acct.invite.kicker')}</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl" data-testid="text-invite-title">
          {t('acct.invite.title', { factory: d.factoryName })}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('acct.invite.lead')}</p>

        <dl className="ledger-grid mt-6 overflow-hidden rounded-xl border bg-card">
          {facts.map(({ icon: Icon, label, value, id, ltr }) => (
            <div key={id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate font-medium" dir={ltr ? 'ltr' : undefined} data-testid={`text-invite-${id}`}>{value}</dd>
            </div>
          ))}
          <div className="flex items-center gap-2 bg-muted/60 px-4 py-2 text-xs text-muted-foreground" data-testid="text-invite-expires">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {t('acct.invite.expires', { date: formatDate(d.expiresAt, language) })}
          </div>
        </dl>

        {session?.user && (
          <p className="mt-4 flex gap-2 rounded-md border bg-secondary p-3 text-sm" data-testid="text-invite-signed-in">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {t('acct.invite.signedInNote')}
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="mt-6 space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('acct.invite.name')}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="name" maxLength={100} className="h-11" data-testid="input-invite-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <input type="email" value={d.email} autoComplete="username" readOnly hidden aria-hidden="true" />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('acct.invite.password')}</FormLabel>
                  <FormControl>
                    <PasswordInput {...field} autoComplete="new-password" maxLength={512} testId="input-invite-password" />
                  </FormControl>
                  <LengthMeter value={pw} testId="meter-invite-password" />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('acct.invite.confirm')}</FormLabel>
                  <FormControl>
                    <PasswordInput {...field} autoComplete="new-password" maxLength={512} testId="input-invite-confirm" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {accept.isError && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-status-red" data-testid="error-invite-accept">
                {localizeError(t, accept.error)}
              </p>
            )}
            <Button type="submit" className="min-h-11 w-full gap-2" disabled={accept.isPending} data-testid="button-accept-invite">
              {accept.isPending ? t('acct.invite.submitting') : t('acct.invite.submit')}
              <ArrowRight className="size-4 rtl-flip" aria-hidden="true" />
            </Button>
          </form>
        </Form>
      </div>
    </Frame>
  );
}
