import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { AlertCircle, ArrowRight, Eye, EyeOff, FileSearch, Layers, ShieldCheck, Sigma } from 'lucide-react';
import { getGetSessionQueryKey, useLogin } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { BrandLockup, BrandMark } from '@/components/brand';
import { LanguageSwitch, ThemeMenu } from '@/components/prefs-controls';
import { firstAllowedPath, localizeError, useSession } from '@/lib/session';

export default function LoginPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: session } = useSession();
  const [showPw, setShowPw] = useState(false);

  const schema = z.object({
    email: z.string().trim().min(1, t('login.emailInvalid')).max(254).email(t('login.emailInvalid')),
    password: z.string().min(1, t('login.passwordRequired')).max(256),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const login = useLogin({
    request: { credentials: 'include', headers: { 'X-CSRF-Token': session?.csrfToken ?? '' } },
  });

  const onSubmit = (v: Values) =>
    login.mutate(
      { data: { email: v.email, password: v.password } },
      {
        onSuccess: (next) => {
          qc.setQueryData(getGetSessionQueryKey(), next);
          form.reset({ email: v.email, password: '' });
          navigate(firstAllowedPath(next));
        },
        onError: () => form.setValue('password', ''),
      },
    );

  const principles = [
    { icon: Sigma, text: t('login.p1') },
    { icon: FileSearch, text: t('login.p2') },
    { icon: Layers, text: t('login.p3') },
    { icon: ShieldCheck, text: t('login.p4') },
  ];

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Evidence panel */}
      <aside className="relative hidden overflow-hidden border-e bg-card lg:flex lg:flex-col">
        <div className="ledger-grid absolute inset-0 opacity-90" aria-hidden="true" />
        <div
          className="absolute -end-32 -top-32 size-[28rem] rounded-full opacity-[0.12] blur-3xl brand-gradient"
          aria-hidden="true"
        />
        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-16">
          <BrandLockup tagline={t('brand.tagline')} />
          <div className="max-w-lg">
            <div className="fade-up text-xs font-semibold uppercase tracking-[0.12em] text-primary">{t('login.heroKicker')}</div>
            <h2 className="fade-up mt-4 text-[2.4rem] font-semibold leading-[1.12] tracking-tight text-balance" style={{ animationDelay: '60ms' }}>
              {t('login.heroTitle')}
            </h2>
            <p className="fade-up mt-5 text-[1.05rem] leading-relaxed text-muted-foreground" style={{ animationDelay: '120ms' }}>
              {t('login.heroBody')}
            </p>
            <ul className="mt-10 border-t">
              {principles.map(({ icon: Icon, text }, i) => (
                <li
                  key={text}
                  className="fade-up flex items-center gap-4 border-b py-3.5"
                  style={{ animationDelay: `${180 + i * 60}ms` }}
                >
                  <span className="num w-6 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                  <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-[0.95rem]">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="tick-rule h-1.5 w-24" aria-hidden="true" />
            {t('login.footer')}
          </div>
        </div>
      </aside>

      {/* Form */}
      <main className="flex flex-col">
        <div className="flex h-16 items-center justify-between px-4 sm:px-8">
          <div className="lg:invisible">
            <BrandMark />
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <ThemeMenu />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16 pt-6 sm:px-8">
          <div className="fade-up w-full max-w-[400px]">
            <h1 className="text-[1.75rem] font-semibold tracking-tight" data-testid="text-login-title">
              {t('login.title')}
            </h1>
            <p className="mt-2 leading-relaxed text-muted-foreground">{t('login.subtitle')}</p>

            {login.isError && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-3 rounded-lg border border-status-red/35 bg-status-red/[0.07] px-4 py-3 text-sm text-status-red"
                data-testid="status-login-error"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{localizeError(t, login.error)}</span>
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-7 space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('login.email')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          dir="ltr"
                          autoComplete="username"
                          inputMode="email"
                          autoFocus
                          className="h-11 bg-card text-start"
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('login.password')}</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            {...field}
                            type={showPw ? 'text' : 'password'}
                            dir="ltr"
                            autoComplete="current-password"
                            className="h-11 bg-card pe-11 text-start"
                            data-testid="input-password"
                          />
                        </FormControl>
                        <button
                          type="button"
                          onClick={() => setShowPw((s) => !s)}
                          aria-label={showPw ? t('login.hidePassword') : t('login.showPassword')}
                          aria-pressed={showPw}
                          className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-md text-muted-foreground hover:text-foreground"
                          data-testid="button-toggle-password"
                        >
                          {showPw ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                        </button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="h-11 w-full gap-2 text-[0.95rem]"
                  disabled={login.isPending || !session}
                  data-testid="button-login"
                >
                  {login.isPending ? t('login.submitting') : t('login.submit')}
                  {!login.isPending && <ArrowRight className="size-4 rtl-flip" aria-hidden="true" />}
                </Button>
              </form>
            </Form>
            <p className="mt-8 border-t pt-5 text-sm text-muted-foreground">{t('login.help')}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
