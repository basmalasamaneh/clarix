import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { KeyRound, LogOut, MonitorX } from 'lucide-react';
import { useChangePassword, useLogout, useLogoutEverywhere, type Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { errorCode, errorStatus, localizeError } from '@/lib/session';
import { AccountSecurity } from '@/components/security/account-security';
import { ReauthInline, StrengthGuide } from '@/components/security/security-kit';
import { endLocalSession, LengthMeter, newPasswordSchema, Panel, PasswordInput, replaceSession } from '@/components/accounts/shared';

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' };

export default function AccountPage({ session }: { session: Session }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = session.user!;
  const req = { credentials: 'include' as const, headers: { 'X-CSRF-Token': session.csrfToken } };
  const change = useChangePassword({ request: req, mutation: { gcTime: 0 } });
  const logout = useLogout({ request: req });
  const logoutAll = useLogoutEverywhere({ request: req });
  const [confirmAll, setConfirmAll] = useState(false);
  const [pwRetry, setPwRetry] = useState<null | V>(null);

  const schema = z
    .object({
      currentPassword: z.string().min(1, t('acct.account.currentRequired')).max(256, t('acct.pw.max')),
      newPassword: newPasswordSchema(t),
      confirm: z.string(),
    })
    .refine((v) => !v.confirm || v.confirm === v.newPassword, { path: ['confirm'], message: t('acct.pw.mismatch') });
  type V = z.infer<typeof schema>;
  const form = useForm<V>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: EMPTY });
  const formRef = useRef(form);
  formRef.current = form;
  useEffect(() => () => formRef.current.reset(EMPTY), []);
  const pw = form.watch('newPassword');

  const signedOut = () => {
    endLocalSession(qc);
    navigate('/login');
  };

  const submit = (v: V) => {
    setPwRetry(null);
    change.mutate(
      { data: { currentPassword: v.currentPassword, newPassword: v.newPassword } },
      {
        onSuccess: (next) => {
          change.reset();
          form.reset(EMPTY);
          replaceSession(qc, next, false);
          toast({ description: t('acct.account.changed') });
        },
        onError: (e) => {
          if (errorCode(e) === 'RECENT_SIGN_IN_REQUIRED') {
            setPwRetry(v);
            return;
          }
          form.setValue('currentPassword', '');
          if (errorStatus(e) === 401) signedOut();
        },
      },
    );
  };

  const memberships = session.memberships;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="fade-up">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{t('acct.account.kicker')}</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="text-account-title">{t('acct.account.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('acct.account.lead')}</p>
      </header>

      <Panel testId="panel-profile" title={t('acct.account.profile')}>
        <div className="flex flex-wrap items-center gap-4 px-4 py-5 sm:px-5">
          <Avatar className="size-12">
            <AvatarFallback className="bg-secondary font-semibold text-primary">
              {user.name.trim().slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-medium" data-testid="text-account-name">{user.name}</div>
            <div className="truncate text-sm text-muted-foreground" dir="ltr" data-testid="text-account-email">{user.email}</div>
          </div>
        </div>
        {memberships.length > 0 && (
          <div className="border-t px-4 py-4 sm:px-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t('acct.account.roles')}</div>
            <ul className="flex flex-wrap gap-2">
              {memberships.map((m) => (
                <li key={m.factoryId} className="rounded-md border bg-background px-2.5 py-1 text-sm" data-testid={`text-account-membership-${m.factoryId}`}>
                  {m.factoryName} <span className="text-muted-foreground">· {t(`roles.${m.role}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel testId="panel-password" title={t('acct.account.pwTitle')} lead={t('acct.account.pwLead')}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4 px-4 py-5 sm:px-5" noValidate>
            <input type="email" value={user.email} autoComplete="username" readOnly hidden aria-hidden="true" />
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('acct.account.current')}</FormLabel>
                  <FormControl>
                    <PasswordInput {...field} autoComplete="current-password" maxLength={512} testId="input-current-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('acct.account.next')}</FormLabel>
                    <FormControl>
                      <PasswordInput {...field} autoComplete="new-password" maxLength={512} testId="input-new-password" />
                    </FormControl>
                    <LengthMeter value={pw} testId="meter-new-password" />
                    <StrengthGuide value={pw} testId="guide-new-password" />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('acct.account.confirm')}</FormLabel>
                    <FormControl>
                      <PasswordInput {...field} autoComplete="new-password" maxLength={512} testId="input-confirm-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {change.isError && !pwRetry && errorStatus(change.error) !== 401 && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-status-red" data-testid="error-change-password">
                {localizeError(t, change.error)}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" className="min-h-11 gap-2" disabled={change.isPending} data-testid="button-change-password">
                <KeyRound className="size-4" aria-hidden="true" />
                {change.isPending ? t('acct.account.saving') : t('acct.account.save')}
              </Button>
            </div>
          </form>
          {pwRetry && (
              <div className="px-4 pb-5 sm:px-5"><ReauthInline
                onConfirmed={() => submit(pwRetry)}
                onCancel={() => { setPwRetry(null); change.reset(); form.setValue('currentPassword', ''); }}
                testId="reauth-password"
              /></div>
            )}
        </Form>
      </Panel>

      <AccountSecurity session={session} />

      <Panel testId="panel-sessions" title={t('acct.account.sessionsTitle')} lead={t('acct.account.sessionsLead')}>
        <div className="flex flex-wrap gap-3 px-4 py-5 sm:px-5">
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            disabled={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: signedOut,
                onError: (e) => (errorStatus(e) === 401 ? signedOut() : toast({ variant: 'destructive', description: localizeError(t, e) })),
              })
            }
            data-testid="button-account-logout"
          >
            <LogOut className="size-4 rtl-flip" aria-hidden="true" />
            {t('acct.account.logout')}
          </Button>
          <Button variant="outline" className="min-h-11 gap-2 text-status-red" onClick={() => setConfirmAll(true)} data-testid="button-logout-everywhere">
            <MonitorX className="size-4" aria-hidden="true" />
            {t('acct.account.logoutAll')}
          </Button>
        </div>
      </Panel>

      <AlertDialog open={confirmAll} onOpenChange={(o) => !logoutAll.isPending && setConfirmAll(o)}>
        <AlertDialogContent data-testid="dialog-logout-everywhere">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('acct.account.logoutAllTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('acct.account.logoutAllBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={logoutAll.isPending} data-testid="button-logout-everywhere-cancel">
              {t('acct.members.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={logoutAll.isPending}
              onClick={(e) => {
                e.preventDefault();
                logoutAll.mutate(undefined, {
                  onSuccess: signedOut,
                  onError: (err) => {
                    setConfirmAll(false);
                    if (errorStatus(err) === 401) signedOut();
                    else toast({ variant: 'destructive', description: localizeError(t, err) });
                  },
                });
              }}
              data-testid="button-logout-everywhere-confirm"
            >
              {t('acct.account.logoutAll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
